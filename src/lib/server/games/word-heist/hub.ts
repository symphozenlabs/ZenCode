import type { IncomingMessage } from 'node:http';
import type { Duplex } from 'node:stream';
import { WebSocketServer, type WebSocket } from 'ws';
import { requireAdmin } from '$lib/server/admin-session';
import { HEIST_SOCKET_PATH, type HeistClientMessage, type HeistErrorCode, type HeistServerMessage } from '$lib/games/word-heist/protocol';
import { CODE_RE, type HeistControl, type HeistRules, type ModerationConfig } from '$lib/games/word-heist/types';
import { defaultModeration } from './moderation';
import { depsFor, loadModeration, newCode } from './service';
import { FirestoreHeistStore, type HeistStore } from './store';
import { HeistError, Tournament, type Peer } from './tournament';

/**
 * Word Heist on the live server. One WebSocket per phone or organiser
 * screen at HEIST_SOCKET_PATH; tournaments live in this process's memory
 * (see tournament.ts). Like live sessions, run a single server process.
 */

const HEARTBEAT_MS = 15_000;
const MSGS_PER_SECOND = 20;
const MOVES_PER_2S = 5;
const JOINS_PER_SOCKET = 5;
const CONFIG_REFRESH_MS = 10_000;

interface Client {
	ws: WebSocket;
	peer: Peer;
	alive: boolean;
	t: Tournament | null;
	playerId: string | null;
	admin: boolean;
	window: { start: number; count: number };
	moves: number[];
	joins: number;
}

export interface HeistHubDeps {
	store: HeistStore;
	/** Firebase ID token → organiser email, or null. */
	verifyAdmin: (token: string) => Promise<string | null>;
	moderation: () => Promise<ModerationConfig>;
}

async function verifyAdminToken(token: string): Promise<string | null> {
	try {
		const admin = await requireAdmin(new Request('http://heist.local/', { headers: { authorization: `Bearer ${token}` } }));
		return admin.email;
	} catch {
		return null;
	}
}

const send = (c: Client, msg: HeistServerMessage) => c.peer.send(JSON.stringify(msg));
const fail = (c: Client, code: HeistErrorCode, message: string) => send(c, { t: 'error', code, message });

export class HeistHub {
	readonly wss = new WebSocketServer({ noServer: true, maxPayload: 8 * 1024 });
	#tournaments = new Map<string, Tournament>();
	#loading = new Map<string, Promise<Tournament | null>>();
	#config: ModerationConfig = defaultModeration();
	#configTimer: ReturnType<typeof setInterval>;
	#heartbeat: ReturnType<typeof setInterval>;
	#clients = new Set<Client>();

	constructor(private d: HeistHubDeps) {
		this.wss.on('connection', (ws) => this.#onConnection(ws));
		this.#heartbeat = setInterval(() => this.#beat(), HEARTBEAT_MS);
		this.#heartbeat.unref?.();
		const refresh = () =>
			d
				.moderation()
				.then((c) => (this.#config = c))
				.catch((err) => console.error('[word-heist] moderation settings', err));
		void refresh();
		this.#configTimer = setInterval(refresh, CONFIG_REFRESH_MS);
		this.#configTimer.unref?.();
	}

	handleUpgrade(req: IncomingMessage, socket: Duplex, head: Buffer): boolean {
		if ((req.url ?? '').split('?')[0] !== HEIST_SOCKET_PATH) return false;
		this.wss.handleUpgrade(req, socket, head, (ws) => this.wss.emit('connection', ws, req));
		return true;
	}

	/** Save every tournament and stop. */
	async close() {
		clearInterval(this.#heartbeat);
		clearInterval(this.#configTimer);
		for (const ws of this.wss.clients) ws.terminate();
		this.wss.close();
		await Promise.all(
			[...this.#tournaments.values()].map(async (t) => {
				await t.save().catch(() => {});
				t.dispose();
			})
		);
	}

	#tdeps() {
		return { store: this.d.store, deps: () => depsFor(this.#config) };
	}

	/** Organiser: open a new tournament. */
	async create(createdBy: string, rules: HeistRules): Promise<string> {
		for (let i = 0; i < 6; i++) {
			const code = newCode();
			if (this.#tournaments.has(code)) continue;
			const t = await Tournament.create(code, createdBy, rules, this.#tdeps());
			if (t) {
				this.#tournaments.set(code, t);
				return code;
			}
		}
		throw new HeistError('Could not create a game code. Please try again.');
	}

	async get(code: string): Promise<Tournament | null> {
		const t = this.#tournaments.get(code);
		if (t) return t;
		let pending = this.#loading.get(code);
		if (!pending) {
			pending = Tournament.load(code, this.#tdeps())
				.then((loaded) => {
					if (loaded) this.#tournaments.set(code, loaded);
					return loaded;
				})
				.finally(() => this.#loading.delete(code));
			this.#loading.set(code, pending);
		}
		return pending;
	}

	// ── Sockets ──────────────────────────────────────────────────────────

	#onConnection(ws: WebSocket) {
		const client: Client = {
			ws,
			peer: { send: (data) => ws.readyState === ws.OPEN && ws.send(data) },
			alive: true,
			t: null,
			playerId: null,
			admin: false,
			window: { start: Date.now(), count: 0 },
			moves: [],
			joins: 0
		};
		this.#clients.add(client);
		ws.on('pong', () => (client.alive = true));
		ws.on('message', (raw, isBinary) => {
			if (isBinary || !this.#allow(client)) return;
			let msg: HeistClientMessage;
			try {
				msg = JSON.parse(String(raw));
			} catch {
				return fail(client, 'bad_request', 'Invalid message.');
			}
			this.#handle(client, msg).catch((err) => {
				console.error('[word-heist]', err);
				fail(client, 'bad_request', 'Something went wrong. Please try again.');
			});
		});
		ws.on('close', () => this.#detach(client));
		ws.on('error', () => ws.terminate());
	}

	#allow(c: Client) {
		const now = Date.now();
		if (now - c.window.start > 1000) c.window = { start: now, count: 0 };
		return ++c.window.count <= MSGS_PER_SECOND;
	}

	#beat() {
		for (const c of this.#clients) {
			if (!c.alive) {
				c.ws.terminate();
				continue;
			}
			c.alive = false;
			c.ws.ping();
		}
	}

	#detach(c: Client) {
		this.#clients.delete(c);
		c.t?.detach(c.peer, c.playerId);
		c.t = null;
		c.playerId = null;
	}

	async #enter(c: Client, code: unknown): Promise<Tournament | null> {
		const clean = typeof code === 'string' ? code.trim().toUpperCase() : '';
		if (!CODE_RE.test(clean)) {
			fail(c, 'not_found', 'That game code does not exist.');
			return null;
		}
		const t = await this.get(clean);
		if (!t) {
			fail(c, 'not_found', 'Tournament not found.');
			return null;
		}
		if (c.t !== t) {
			c.t?.detach(c.peer, c.playerId);
			c.playerId = null;
			c.admin = false;
			c.t = t;
			t.watch(c.peer);
		}
		return t;
	}

	async #handle(c: Client, msg: HeistClientMessage) {
		switch (msg?.t) {
			case 'hello': {
				const t = await this.#enter(c, msg.code);
				if (!t) return;
				if (typeof msg.playerId === 'string' && msg.playerId) {
					if (!t.authenticate(msg.playerId, String(msg.token ?? ''))) return fail(c, 'auth', 'This device is no longer in the tournament. Join again.');
					if (c.playerId && c.playerId !== msg.playerId) t.detach(c.peer, c.playerId);
					c.playerId = msg.playerId;
					t.bindPlayer(c.peer, msg.playerId);
				} else send(c, { t: 'me', me: null });
				return;
			}
			case 'join': {
				const t = await this.#enter(c, msg.code);
				if (!t) return;
				if (++c.joins > JOINS_PER_SOCKET) return fail(c, 'rate_limited', 'Too many attempts. Reload the page and try again.');
				try {
					const id = await t.join(msg.name, msg.avatar);
					c.playerId = id.playerId;
					send(c, { t: 'joined', ...id });
					t.bindPlayer(c.peer, id.playerId);
				} catch (err) {
					if (err instanceof HeistError) return fail(c, 'join', err.message);
					throw err;
				}
				return;
			}
			case 'move': {
				const t = c.t;
				const requestId = typeof msg.requestId === 'string' && /^[A-Za-z0-9_-]{8,64}$/.test(msg.requestId) ? msg.requestId : '';
				if (!t || !c.playerId) return fail(c, 'auth', 'Join the tournament first.');
				if (!requestId) return fail(c, 'bad_request', 'Invalid move.');
				const now = Date.now();
				c.moves = c.moves.filter((m) => now - m < 2000);
				if (c.moves.length >= MOVES_PER_2S) return send(c, { t: 'move', requestId, result: { ok: false, message: 'Slow down a little.' } });
				c.moves.push(now);
				const text = typeof msg.text === 'string' ? msg.text.slice(0, 60) : '';
				return send(c, { t: 'move', requestId, result: t.move(c.playerId, { requestId, text }) });
			}
			case 'admin': {
				const t = await this.#enter(c, msg.code);
				if (!t) return;
				const email = await this.d.verifyAdmin(String(msg.token ?? ''));
				if (!email) return fail(c, 'auth', 'Organiser sign-in required.');
				c.admin = true;
				t.addAdmin(c.peer);
				return;
			}
			case 'control': {
				const reqId = typeof msg.reqId === 'string' ? msg.reqId.slice(0, 64) : '';
				if (!c.t || !c.admin) return fail(c, 'auth', 'Organiser sign-in required.');
				try {
					await c.t.control(msg.action as HeistControl, msg);
					send(c, { t: 'control', reqId, ok: true });
				} catch (err) {
					if (!(err instanceof HeistError)) console.error('[word-heist] control', err);
					send(c, { t: 'control', reqId, ok: false, message: err instanceof HeistError ? err.message : 'That did not work. Please try again.' });
				}
				return;
			}
			case 'watch':
				if (c.t && c.admin) c.t.watchRoom(c.peer, typeof msg.roomId === 'string' ? msg.roomId : null);
				return;
			default:
				fail(c, 'bad_request', 'Unknown message.');
		}
	}
}

const KEY = '__zencodeHeist';
type G = typeof globalThis & { [KEY]?: HeistHub | { close?: () => unknown } };

/**
 * The process-wide Word Heist hub, on globalThis so SvelteKit routes, the
 * dev-server upgrade hook and server.js share it. After a dev hot reload the
 * old hub saves its tournaments and is replaced; phones reconnect and the new
 * hub reloads the tournament from Firestore.
 */
export function heistHub(): HeistHub {
	const g = globalThis as G;
	const existing = g[KEY];
	if (existing instanceof HeistHub) return existing;
	if (existing) {
		console.info('[word-heist] Server code changed — restarting the Word Heist hub.');
		void existing.close?.();
	}
	const hub = new HeistHub({ store: new FirestoreHeistStore(), verifyAdmin: verifyAdminToken, moderation: loadModeration });
	g[KEY] = hub;
	return hub;
}
