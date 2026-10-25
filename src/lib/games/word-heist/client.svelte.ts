import { LiveSocket } from '$lib/live/socket.svelte';
import { heistSocketUrl } from '$lib/live/origin';
import { syncClock } from '$lib/games/tech-word-rush/api';
import type { AdminPlayer, BoardView, HeistClientMessage, HeistServerMessage, MeView, TournamentView } from './protocol';
import type { HeistControl, MoveResult, RoomSummary, RoundResult } from './types';
import { forgetIdentity, loadIdentity, newRequestId, saveIdentity, type Identity } from './api';

/**
 * One screen's connection to a Word Heist tournament on the live server:
 * a phone (`player`) or the organiser dashboard (`admin`). Reconnects on its
 * own; every reconnect re-sends hello and the server replies with the full
 * current state, so nothing is lost while offline.
 */
export class HeistClient {
	tournament = $state<TournamentView | null>(null);
	me = $state<MeView | null>(null);
	board = $state<BoardView | null>(null);
	identity = $state<Identity | null>(null);
	/** 'missing' when the code doesn't exist. */
	load = $state<'loading' | 'ready' | 'missing'>('loading');
	error = $state<string | null>(null);

	// Organiser
	rooms = $state<RoomSummary[]>([]);
	players = $state<AdminPlayer[]>([]);
	rounds = $state<RoundResult[]>([]);
	room = $state<BoardView | null>(null);

	readonly socket: LiveSocket<HeistClientMessage, HeistServerMessage>;
	#pendingMoves = new Map<string, { msg: HeistClientMessage; resolve: (r: MoveResult) => void; timer: ReturnType<typeof setTimeout> }>();
	#pendingControls = new Map<string, { resolve: () => void; reject: (e: Error) => void; timer: ReturnType<typeof setTimeout> }>();
	#joining: { resolve: () => void; reject: (e: Error) => void } | null = null;
	#watching: string | null = null;
	#rewatch = false;

	constructor(
		readonly code: string,
		readonly mode: 'player' | 'admin',
		readonly getToken?: () => Promise<string | null | undefined>
	) {
		if (mode === 'player') this.identity = loadIdentity(code);
		this.socket = new LiveSocket<HeistClientMessage, HeistServerMessage>({
			url: heistSocketUrl,
			hello: async () => {
				if (this.mode === 'admin') {
					this.#rewatch = true;
					const token = await this.getToken?.();
					return token ? { t: 'admin', code: this.code, token } : null;
				}
				const id = this.identity;
				return id ? { t: 'hello', code: this.code, playerId: id.playerId, token: id.token } : { t: 'hello', code: this.code };
			},
			onMessage: (m) => this.#onMessage(m)
		});
	}

	get status() {
		return this.socket.status;
	}

	start() {
		return this.socket.start();
	}

	#onMessage(m: HeistServerMessage) {
		switch (m.t) {
			case 'tournament':
				syncClock(m.now);
				this.tournament = m.s;
				this.load = 'ready';
				break;
			case 'me':
				this.me = m.me;
				// Re-send moves that were in flight when the connection dropped (same id → never counted twice).
				if (m.me) for (const p of this.#pendingMoves.values()) this.socket.send(p.msg);
				break;
			case 'board':
				this.board = m.b;
				break;
			case 'joined': {
				const id = { playerId: m.playerId, token: m.token, name: m.name };
				this.identity = id;
				saveIdentity(this.code, id);
				this.#joining?.resolve();
				this.#joining = null;
				break;
			}
			case 'move': {
				const p = this.#pendingMoves.get(m.requestId);
				if (p) {
					clearTimeout(p.timer);
					this.#pendingMoves.delete(m.requestId);
					p.resolve(m.result);
				}
				break;
			}
			case 'admin':
				this.rooms = m.rooms;
				this.players = m.players;
				if (m.rounds) this.rounds = m.rounds;
				this.load = 'ready';
				// After a reconnect, follow the open room again.
				if (this.#rewatch && this.#watching) this.socket.send({ t: 'watch', roomId: this.#watching });
				this.#rewatch = false;
				break;
			case 'room':
				this.room = m.b;
				break;
			case 'control': {
				const p = this.#pendingControls.get(m.reqId);
				if (p) {
					clearTimeout(p.timer);
					this.#pendingControls.delete(m.reqId);
					if (m.ok) p.resolve();
					else p.reject(new Error(m.message || 'That did not work.'));
				}
				break;
			}
			case 'error':
				if (m.code === 'not_found') this.load = 'missing';
				else if (m.code === 'join') {
					this.#joining?.reject(new Error(m.message));
					this.#joining = null;
				} else if (m.code === 'auth' && this.mode === 'player') {
					forgetIdentity(this.code);
					this.identity = null;
					this.me = null;
					this.board = null;
					this.#joining?.reject(new Error(m.message));
					this.#joining = null;
				} else this.error = m.message;
				break;
		}
	}

	join(name: string, avatar?: number): Promise<void> {
		if (this.#joining) return Promise.reject(new Error('Already joining…'));
		return new Promise((resolve, reject) => {
			const timer = setTimeout(() => {
				this.#joining = null;
				reject(new Error('No answer from the server — check your connection and try again.'));
			}, 15_000);
			this.#joining = {
				resolve: () => (clearTimeout(timer), resolve()),
				reject: (e) => (clearTimeout(timer), reject(e))
			};
			if (!this.socket.send({ t: 'join', code: this.code, name, avatar })) {
				clearTimeout(timer);
				this.#joining = null;
				reject(new Error('Connecting… try again in a moment.'));
			}
		});
	}

	/** Play a word (made from tiles, or a steal). Resolves with the server's verdict (usually in well under a second). */
	move(text: string): Promise<MoveResult> {
		const requestId = newRequestId();
		const msg: HeistClientMessage = { t: 'move', requestId, text };
		return new Promise((resolve) => {
			const timer = setTimeout(() => {
				this.#pendingMoves.delete(requestId);
				resolve({ ok: false, message: 'Connection lost — check your connection and try again.' });
			}, 10_000);
			this.#pendingMoves.set(requestId, { msg, resolve, timer });
			this.socket.send(msg); // if offline, re-sent on reconnect
		});
	}

	control(action: HeistControl, extra: Record<string, unknown> = {}): Promise<void> {
		const reqId = newRequestId();
		return new Promise((resolve, reject) => {
			const timer = setTimeout(() => {
				this.#pendingControls.delete(reqId);
				reject(new Error('No answer from the live server. Check the connection and try again.'));
			}, 30_000);
			this.#pendingControls.set(reqId, { resolve, reject, timer });
			if (!this.socket.send({ t: 'control', reqId, action, ...extra })) {
				clearTimeout(timer);
				this.#pendingControls.delete(reqId);
				reject(new Error('Not connected to the live server yet. Try again in a moment.'));
			}
		});
	}

	/** Organiser: follow one room's full board (null to stop). */
	watch(roomId: string | null) {
		this.#watching = roomId;
		this.room = null;
		this.socket.send({ t: 'watch', roomId });
	}
}
