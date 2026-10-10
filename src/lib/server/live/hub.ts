import { randomBytes, randomInt, timingSafeEqual } from 'node:crypto';
import type { IncomingMessage, Server } from 'node:http';
import type { Duplex } from 'node:stream';
import { WebSocketServer, type WebSocket } from 'ws';
import { isAvatar } from '$lib/live/avatars';
import { SOCKET_PATH, type ClientMessage, type ErrorCode, type HostAction, type ServerMessage } from '$lib/live/protocol';
import { cleanNickname, JOIN_CODE_RE, nicknameError } from '$lib/live/session';
import type { LiveSession, StoredParticipant } from '$lib/live/types';
import { hasProfanity } from './profanity';
import type { LiveRepo } from './repo';
import type { AdminIdentity } from './admin-auth';
import { HubError, Room, send, type Client } from './room';

export { HubError };

export interface HubDeps {
	repo: LiveRepo;
	verifyAdmin: (token: string) => Promise<AdminIdentity | null>;
}

const MAX_PLAYERS = 500;
const HEARTBEAT_MS = 15_000;
const MSGS_PER_SECOND = 30;
const JOINS_PER_SOCKET = 6;

const HOST_ACTIONS = new Set<string>([
	'start_session',
	'change_slide',
	'start_timer',
	'close_responses',
	'reveal_answer',
	'toggle_results',
	'reset_slide',
	'show_leaderboard',
	'open_lobby',
	'end_session'
]);

const sendMsg = (c: Client, msg: ServerMessage) => send(c, JSON.stringify(msg));
const fail = (c: Client, code: ErrorCode, message: string, slideId?: string) => sendMsg(c, { t: 'error', code, message, slideId });

function secretsMatch(a: string, b: string) {
	const x = Buffer.from(a);
	const y = Buffer.from(b);
	return x.length === y.length && timingSafeEqual(x, y);
}

export class LiveHub {
	readonly wss = new WebSocketServer({ noServer: true, maxPayload: 16 * 1024 });
	#rooms = new Map<string, Room>();
	#loading = new Map<string, Promise<Room | null>>();
	#codes = new Map<string, string>();
	#clients = new WeakMap<WebSocket, Client>();
	#heartbeat: ReturnType<typeof setInterval>;

	constructor(private deps: HubDeps) {
		this.wss.on('connection', (ws) => this.#onConnection(ws));
		this.#heartbeat = setInterval(() => this.#beat(), HEARTBEAT_MS);
		this.#heartbeat.unref?.();
	}

	get repo() {
		return this.deps.repo;
	}

	/** Route an HTTP upgrade. Returns false if the path isn't ours. */
	handleUpgrade(req: IncomingMessage, socket: Duplex, head: Buffer): boolean {
		const path = (req.url ?? '').split('?')[0];
		if (path !== SOCKET_PATH) return false;
		this.wss.handleUpgrade(req, socket, head, (ws) => this.wss.emit('connection', ws, req));
		return true;
	}

	attach(server: Server) {
		server.on('upgrade', (req, socket, head) => {
			socket.on('error', () => socket.destroy());
			if (!this.handleUpgrade(req, socket, head)) socket.destroy();
		});
	}

	close() {
		clearInterval(this.#heartbeat);
		for (const room of this.#rooms.values()) room.dispose();
		for (const ws of this.wss.clients) ws.terminate();
		this.wss.close();
	}

	// ---- Rooms ----------------------------------------------------------------

	async #room(sessionId: string): Promise<Room | null> {
		const cached = this.#rooms.get(sessionId);
		if (cached) return cached;
		let pending = this.#loading.get(sessionId);
		if (!pending) {
			pending = (async () => {
				const session = await this.deps.repo.getSession(sessionId);
				if (!session) return null;
				const room = new Room(session, this.deps.repo);
				if (room.open) {
					const [players, responses] = await Promise.all([
						this.deps.repo.listParticipants(sessionId),
						this.deps.repo.listResponses(sessionId)
					]);
					for (const p of players) room.participants.set(p.id, p);
					for (const r of responses) {
						let m = room.responses.get(r.slideId);
						if (!m) room.responses.set(r.slideId, (m = new Map()));
						m.set(r.participantId, r);
					}
					if (session.joinCode) this.#codes.set(session.joinCode, sessionId);
					room.restore();
				}
				this.#rooms.set(sessionId, room);
				return room;
			})().finally(() => this.#loading.delete(sessionId));
			this.#loading.set(sessionId, pending);
		}
		return pending;
	}

	async #roomByCode(code: string): Promise<Room | null> {
		const id = this.#codes.get(code) ?? (await this.deps.repo.resolveJoinCode(code));
		return id ? this.#room(id) : null;
	}

	/** Public lookup for the join page. */
	async lookupCode(code: string): Promise<{ title: string } | null> {
		if (!JOIN_CODE_RE.test(code)) return null;
		const room = await this.#roomByCode(code);
		return room?.open ? { title: room.session.title } : null;
	}

	async #claimCode(sessionId: string): Promise<string> {
		for (let i = 0; i < 25; i++) {
			const code = String(randomInt(100_000, 1_000_000));
			if (this.#codes.has(code)) continue;
			if (await this.deps.repo.claimJoinCode(code, sessionId)) {
				this.#codes.set(code, sessionId);
				return code;
			}
		}
		throw new HubError(503, 'Could not allocate a join code. Try again.');
	}

	/** Draft or ended → lobby with a fresh join code and an empty player list. */
	async openLobby(sessionId: string): Promise<LiveSession> {
		const room = await this.#room(sessionId);
		if (!room) throw new HubError(404, 'Session not found.');
		if (room.open) return room.session;
		const code = await this.#claimCode(sessionId);
		if (room.session.status === 'ended') {
			await Promise.all([this.deps.repo.clearParticipants(sessionId), this.deps.repo.clearResponses(sessionId)]);
			room.participants.clear();
			room.responses.clear();
		}
		const now = Date.now();
		room.session = { ...room.session, status: 'lobby', joinCode: code, live: null, startedAt: null, endedAt: null, updatedAt: now };
		await this.deps.repo.patchSession(sessionId, { status: 'lobby', joinCode: code, live: null, startedAt: null, endedAt: null, updatedAt: now });
		room.toHosts({ t: 'welcome_host', state: room.hostSnapshot() });
		return room.session;
	}

	async endSession(sessionId: string): Promise<void> {
		const room = await this.#room(sessionId);
		if (!room) throw new HubError(404, 'Session not found.');
		if (!room.open) return;
		room.dispose();
		const code = room.session.joinCode;
		const now = Date.now();
		room.session = { ...room.session, status: 'ended', joinCode: null, endedAt: now, updatedAt: now };
		if (code) {
			this.#codes.delete(code);
			await this.deps.repo.releaseJoinCode(code).catch((e) => console.error('[live] release code', e));
		}
		await this.deps.repo.patchSession(sessionId, { status: 'ended', joinCode: null, live: room.session.live ?? null, endedAt: now, updatedAt: now });
		room.toPlayers({ t: 'session_ended' });
		room.toHosts({ t: 'welcome_host', state: room.hostSnapshot() });
		for (const s of [...room.players.values()]) for (const c of s) c.ws.close(1000, 'ended');
	}

	/** Builder edits. Blocked while a session is running live. */
	async updateContent(sessionId: string, patch: Pick<LiveSession, 'title' | 'settings' | 'slides'>): Promise<LiveSession> {
		const room = await this.#room(sessionId);
		if (!room) throw new HubError(404, 'Session not found.');
		if (room.session.status === 'live') throw new HubError(409, 'This session is live. End it before editing.');
		const updatedAt = Date.now();
		room.session = { ...room.session, ...patch, updatedAt };
		await this.deps.repo.patchSession(sessionId, { ...patch, updatedAt });
		if (room.hosts.size) room.toHosts({ t: 'welcome_host', state: room.hostSnapshot() });
		return room.session;
	}

	async getSession(sessionId: string): Promise<LiveSession | null> {
		return (await this.#room(sessionId))?.session ?? null;
	}

	async deleteSession(sessionId: string): Promise<void> {
		const room = await this.#room(sessionId);
		if (!room) return;
		await this.endSession(sessionId);
		for (const c of room.hosts) c.ws.close(1000, 'deleted');
		this.#rooms.delete(sessionId);
		await this.deps.repo.deleteSession(sessionId);
	}

	// ---- Sockets --------------------------------------------------------------

	#onConnection(ws: WebSocket) {
		const client: Client = {
			ws,
			alive: true,
			role: 'none',
			room: null,
			participantId: null,
			window: { start: Date.now(), count: 0 },
			joinAttempts: 0
		};
		this.#clients.set(ws, client);
		ws.on('pong', () => (client.alive = true));
		ws.on('message', (raw, isBinary) => {
			if (isBinary || !this.#allow(client)) return;
			let msg: ClientMessage;
			try {
				msg = JSON.parse(raw.toString());
			} catch {
				return fail(client, 'bad_request', 'Malformed message.');
			}
			if (!msg || typeof msg !== 'object' || typeof msg.t !== 'string') return fail(client, 'bad_request', 'Malformed message.');
			this.#dispatch(client, msg).catch((err) => {
				if (err instanceof HubError) return fail(client, 'not_ready', err.message);
				console.error('[live] handler error', err);
				fail(client, 'bad_request', 'Something went wrong. Please retry.');
			});
		});
		ws.on('close', () => this.#detach(client));
		ws.on('error', () => ws.terminate());
	}

	#allow(c: Client) {
		const now = Date.now();
		if (now - c.window.start >= 1000) c.window = { start: now, count: 0 };
		return ++c.window.count <= MSGS_PER_SECOND;
	}

	#beat() {
		for (const ws of this.wss.clients) {
			const c = this.#clients.get(ws);
			if (!c) continue;
			if (!c.alive) {
				ws.terminate();
				continue;
			}
			c.alive = false;
			ws.ping();
		}
	}

	async #dispatch(c: Client, msg: ClientMessage) {
		if (HOST_ACTIONS.has(msg.t)) {
			// Every admin action re-checks that this socket was verified as a host.
			if (c.role !== 'host' || !c.room) return fail(c, 'unauthorized', 'Organiser access required.');
			return this.#hostAction(c.room, msg as HostAction);
		}
		switch (msg.t) {
			case 'host':
				return this.#host(c, msg);
			case 'join':
				return this.#join(c, msg);
			case 'resume':
				return this.#resume(c, msg);
			case 'submit_response': {
				if (c.role !== 'player' || !c.room || !c.participantId) return fail(c, 'unauthorized', 'Join the session first.');
				const result = c.room.submit(c.participantId, msg.slideId, msg.value);
				if (result.ok) sendMsg(c, { t: 'response_ack', slideId: msg.slideId });
				else fail(c, 'response_rejected', result.message, typeof msg.slideId === 'string' ? msg.slideId : undefined);
				return;
			}
			default:
				return fail(c, 'bad_request', 'Unknown message.');
		}
	}

	async #hostAction(room: Room, msg: HostAction) {
		switch (msg.t) {
			case 'open_lobby':
				await this.openLobby(room.session.id);
				return;
			case 'end_session':
				return this.endSession(room.session.id);
			case 'start_session':
				room.start();
				room.toHosts({ t: 'welcome_host', state: room.hostSnapshot() });
				return;
			case 'change_slide':
				return room.goTo(msg.index);
			case 'start_timer':
				return room.startTimer();
			case 'close_responses':
				return room.closeResponses();
			case 'reveal_answer':
				return room.reveal();
			case 'toggle_results':
				return room.setResults(msg.show);
			case 'reset_slide':
				return room.reset();
			case 'show_leaderboard':
				return room.setLeaderboard(msg.show);
		}
	}

	async #host(c: Client, msg: Extract<ClientMessage, { t: 'host' }>) {
		if (typeof msg.sessionId !== 'string' || typeof msg.token !== 'string') return fail(c, 'bad_request', 'Malformed message.');
		const admin = await this.deps.verifyAdmin(msg.token);
		if (!admin) return fail(c, 'unauthorized', 'Organiser access required.');
		const room = await this.#room(msg.sessionId);
		if (!room) return fail(c, 'not_found', 'Session not found.');
		this.#detach(c);
		c.role = 'host';
		c.room = room;
		room.hosts.add(c);
		if (room.session.status === 'draft') await this.openLobby(room.session.id);
		else sendMsg(c, { t: 'welcome_host', state: room.hostSnapshot() });
	}

	async #join(c: Client, msg: Extract<ClientMessage, { t: 'join' }>) {
		if (++c.joinAttempts > JOINS_PER_SOCKET) return fail(c, 'rate_limited', 'Too many attempts. Wait a moment and try again.');
		if (typeof msg.code !== 'string' || !JOIN_CODE_RE.test(msg.code)) return fail(c, 'not_found', 'That code doesn’t match a live session.');
		const room = await this.#roomByCode(msg.code);
		if (!room) return fail(c, 'not_found', 'That code doesn’t match a live session.');
		if (!room.open) return fail(c, 'session_closed', 'This session has ended.');

		const nickname = cleanNickname(msg.nickname);
		const problem = nicknameError(nickname);
		if (problem) return fail(c, 'nickname_invalid', problem);
		if (room.session.settings.profanityFilter && hasProfanity(nickname)) {
			return fail(c, 'nickname_invalid', 'Please pick a different nickname.');
		}
		const lower = nickname.toLowerCase();
		for (const p of room.participants.values()) {
			if (p.nickname.toLowerCase() === lower) return fail(c, 'nickname_taken', 'Someone already has that nickname.');
		}
		if (room.participants.size >= MAX_PLAYERS) return fail(c, 'session_closed', 'This session is full.');

		const participant: StoredParticipant = {
			id: randomBytes(9).toString('base64url'),
			secret: randomBytes(24).toString('base64url'),
			nickname,
			avatar: isAvatar(msg.avatar) ? msg.avatar : 'fox',
			score: 0,
			joinedAt: Date.now()
		};
		room.participants.set(participant.id, participant);
		try {
			await this.deps.repo.putParticipant(room.session.id, participant);
		} catch (err) {
			room.participants.delete(participant.id);
			throw err;
		}
		this.#attachPlayer(c, room, participant);
	}

	async #resume(c: Client, msg: Extract<ClientMessage, { t: 'resume' }>) {
		if (typeof msg.code !== 'string' || typeof msg.participantId !== 'string' || typeof msg.secret !== 'string') {
			return fail(c, 'resume_failed', 'Please join again.');
		}
		const room = JOIN_CODE_RE.test(msg.code) ? await this.#roomByCode(msg.code) : null;
		if (!room || !room.open) return fail(c, 'session_closed', 'This session has ended.');
		const p = room.participants.get(msg.participantId);
		if (!p || !secretsMatch(p.secret, msg.secret)) return fail(c, 'resume_failed', 'Please join again.');
		this.#attachPlayer(c, room, p);
	}

	#attachPlayer(c: Client, room: Room, p: StoredParticipant) {
		this.#detach(c);
		c.role = 'player';
		c.room = room;
		c.participantId = p.id;
		let set = room.players.get(p.id);
		if (!set) room.players.set(p.id, (set = new Set()));
		set.add(c);
		const { secret, ...pub } = p;
		sendMsg(c, {
			t: 'welcome_player',
			secret,
			state: {
				title: room.session.title,
				status: room.session.status,
				settings: { reactions: room.session.settings.reactions, qa: room.session.settings.qa },
				me: { ...pub, connected: true },
				playerCount: room.participants.size,
				slide: room.playerState(p.id)
			}
		});
		room.markLobby();
	}

	#detach(c: Client) {
		const room = c.room;
		if (!room) return;
		if (c.role === 'host') room.hosts.delete(c);
		if (c.role === 'player' && c.participantId) {
			const set = room.players.get(c.participantId);
			set?.delete(c);
			if (set && !set.size) {
				room.players.delete(c.participantId);
				room.markLobby();
			}
		}
		c.room = null;
		c.role = 'none';
		c.participantId = null;
		if (!room.open && room.idle) {
			room.dispose();
			this.#rooms.delete(room.session.id);
		}
	}
}
