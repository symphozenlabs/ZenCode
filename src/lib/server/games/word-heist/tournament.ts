import { createHash, randomBytes, randomInt, timingSafeEqual } from 'node:crypto';
import { AVATAR_COUNT, isAvatar, uniqueAvatars } from '$lib/games/word-heist/avatars';
import { assignRooms, fitStages } from '$lib/games/word-heist/allocation';
import {
	applyMove,
	makeBag,
	newBoard,
	nextRoster,
	placesFor,
	rankBoard,
	removeFromBoard,
	resolveTie,
	revealTiles,
	rng,
	roomDecided,
	roomResult,
	roundClock,
	type MoveDeps
} from '$lib/games/word-heist/engine';
import type { AdminPlayer, BoardView, HeistServerMessage, MeView, TournamentView } from '$lib/games/word-heist/protocol';
import {
	MAX_PLAYERS,
	normalizeRules,
	tilePlan,
	type Board,
	type HeistControl,
	type HeistPlayer,
	type HeistSession,
	type MoveResult,
	type PlayerStatus,
	type PodiumEntry,
	type RoomResult,
	type RoomSummary,
	type RoundResult
} from '$lib/games/word-heist/types';
import { hasProfanity } from '$lib/server/live/profanity';
import type { HeistStore, Snapshot } from './store';

/**
 * One Word Heist tournament, held in the live server's memory.
 *
 * Node runs one thing at a time, so a move is checked and applied to its
 * room's board in a single synchronous step: nothing can change the board in
 * between, no transaction is needed, and the result goes straight back to
 * the phones. Organiser actions run one after another (#op). Firestore gets a
 * copy of whatever changed every SAVE_MS, and straight away after organiser
 * actions and joins. After a restart the tournament is rebuilt from that copy.
 */

/** Something that can receive messages (a WebSocket, or a test double). */
export interface Peer {
	send(data: string): void;
}

export class HeistError extends Error {
	constructor(message: string) {
		super(message);
	}
}

export const SAVE_MS = 2_000;
const TOURNAMENT_PUSH_MS = 300;
const ADMIN_PUSH_MS = 500;
const NAME_MAX = 20;

const sha256 = (s: string) => createHash('sha256').update(s).digest('hex');
const roomIdFor = (seed: string, round: number, number: number) => `r${round}-${number}-${sha256(`${seed}:room:${round}:${number}`).slice(0, 16)}`;
const bagSeed = (seed: string, round: number, number: number) => parseInt(sha256(`${seed}:tiles:${round}:${number}`).slice(0, 8), 16);
/** The server's tile clock fires just after each tile is due. */
const TICK_SLACK_MS = 20;

export const summaryOf = (b: Board): RoomSummary => ({
	round: b.round,
	roomId: b.roomId,
	number: b.number,
	status: b.status,
	playerCount: Object.values(b.players).filter((p) => !p.removed).length,
	top3: rankBoard(b).slice(0, 3),
	wordCount: Object.keys(b.words).length,
	moves: b.seq - (b.startSeq ?? 0),
	updatedAt: Date.now()
});

const boardView = (b: Board): BoardView => ({
	round: b.round,
	roomId: b.roomId,
	number: b.number,
	status: b.status,
	endsAt: b.endsAt,
	pausedRemainingMs: b.pausedRemainingMs,
	rules: b.rules,
	tiles: b.tiles,
	drawn: b.drawn,
	pool: b.pool,
	players: b.players,
	words: b.words,
	feed: b.feed
});

export function cleanName(raw: unknown): string {
	const name = (typeof raw === 'string' ? raw : '')
		.replace(/[\u0000-\u001f\u007f<>]/g, '')
		.replace(/\s+/g, ' ')
		.trim();
	if (!name) throw new HeistError('Enter a display name.');
	if (name.length > NAME_MAX) throw new HeistError(`Keep your name under ${NAME_MAX} characters.`);
	if (hasProfanity(name)) throw new HeistError('Please choose a different name.');
	return name;
}

/** Calls `fn` at most once per `ms`; `now()` runs it immediately. */
function throttle(fn: () => void, ms: number) {
	let timer: ReturnType<typeof setTimeout> | null = null;
	const run = () => {
		if (timer) clearTimeout(timer);
		timer = null;
		fn();
	};
	return {
		soon() {
			if (!timer) {
				timer = setTimeout(run, ms);
				timer.unref?.();
			}
		},
		now: run,
		cancel() {
			if (timer) clearTimeout(timer);
			timer = null;
		}
	};
}

export interface TournamentDeps {
	store: HeistStore;
	/** Dictionary + moderation for moves (kept fresh by the hub). */
	deps: () => MoveDeps;
	now?: () => number;
}

export class Tournament {
	readonly code: string;
	s: HeistSession;
	readonly #seed: string;
	readonly #d: TournamentDeps;
	readonly #now: () => number;

	players = new Map<string, HeistPlayer>();
	#tokens = new Map<string, string>();
	#names = new Set<string>();
	/** A game's avatars held for joins still being saved, so two can't take the same one at once. */
	#pendingAvatars = new Set<number>();
	/** Every round's boards, by room id. */
	boards = new Map<string, Board>();
	rounds = new Map<number, RoundResult>();
	#lobbyRoom = new Map<string, number>();

	// Who is listening
	#watchers = new Set<Peer>();
	#playerPeers = new Map<string, Set<Peer>>();
	#admins = new Map<Peer, { watch: string | null }>();

	// What still needs saving
	#dirty = { session: false, players: new Set<string>(), boards: new Set<string>(), rounds: new Set<number>() };
	#saving: Promise<void> = Promise.resolve();
	#saveTimer: ReturnType<typeof setInterval>;
	#roundTimer: ReturnType<typeof setTimeout> | null = null;
	#ops: Promise<unknown> = Promise.resolve();
	#roundsVersion = 0;
	#adminRoundsSent = new WeakMap<Peer, number>();

	#pushTournament = throttle(() => this.#broadcast(this.#watchers, { t: 'tournament', now: this.#now(), s: this.view() }), TOURNAMENT_PUSH_MS);
	#pushAdmin = throttle(() => this.#sendAdmin(), ADMIN_PUSH_MS);
	#pushLobby = throttle(() => this.#recomputeLobby(), TOURNAMENT_PUSH_MS);

	private constructor(snapshot: Snapshot, d: TournamentDeps) {
		this.code = snapshot.session.code;
		this.s = snapshot.session;
		// Tournaments saved before modes and tiles existed open with today's rules.
		this.s.rules = normalizeRules(this.s.rules);
		this.s.totalStages ??= this.s.rules.stages;
		this.s.closed ??= false;
		this.#seed = snapshot.seed;
		this.#d = d;
		this.#now = d.now ?? Date.now;
		for (const { id, player, tokenHash } of snapshot.players) {
			this.players.set(id, player);
			if (tokenHash) this.#tokens.set(id, tokenHash);
			this.#names.add(player.name.toLowerCase());
		}
		for (const b of snapshot.boards) {
			const rules = normalizeRules(b.rules);
			const tiles = b.tiles ?? tilePlan(Object.keys(b.players).length, rules);
			this.boards.set(b.roomId, { ...b, rules, tiles, bag: b.bag ?? '', drawn: b.drawn ?? 0, pool: b.pool ?? [] });
		}
		for (const r of snapshot.rounds) this.rounds.set(r.round, r);
		this.#saveTimer = setInterval(() => void this.save(), SAVE_MS);
		this.#saveTimer.unref?.();
	}

	static async create(code: string, createdBy: string, rules: HeistSession['rules'], d: TournamentDeps): Promise<Tournament | null> {
		const now = (d.now ?? Date.now)();
		const session: HeistSession = {
			code,
			gameType: 'word-heist',
			status: 'lobby',
			registrationOpen: true,
			createdAt: now,
			createdBy,
			startedAt: null,
			endedAt: null,
			rules,
			playerCount: 0,
			round: 0,
			roomCount: 0,
			roundPlayers: 0,
			timerEndsAt: null,
			pausedRemainingMs: null,
			final: false,
			totalStages: rules.stages,
			closed: false,
			lobbyRooms: 0,
			openTies: 0,
			podium: [],
			winner: null
		};
		const seed = randomBytes(16).toString('hex');
		if (!(await d.store.create(session, seed))) return null;
		return new Tournament({ session, seed, players: [], boards: [], rounds: [] }, d);
	}

	/** Rebuild from the saved copy, picking up a round that was running. */
	static async load(code: string, d: TournamentDeps): Promise<Tournament | null> {
		const snap = await d.store.load(code);
		if (!snap || !snap.seed) return null;
		const t = new Tournament(snap, d);
		t.#recomputeLobby();
		if (t.s.status === 'playing' && t.s.timerEndsAt) t.#tick();
		if (t.s.status === 'scoring') void t.#op(() => t.#finish(t.s.round));
		return t;
	}

	dispose() {
		clearInterval(this.#saveTimer);
		if (this.#roundTimer) clearTimeout(this.#roundTimer);
		this.#pushTournament.cancel();
		this.#pushAdmin.cancel();
		this.#pushLobby.cancel();
	}

	// ── Views ────────────────────────────────────────────────────────────

	view(): TournamentView {
		const s = this.s;
		return {
			code: s.code,
			status: s.status,
			registrationOpen: s.registrationOpen,
			rules: s.rules,
			playerCount: s.playerCount,
			round: s.round,
			final: s.final,
			totalStages: s.totalStages,
			closed: s.closed,
			takenAvatars: s.rules.mode === 'game' ? this.#gameAvatars() : [],
			roomCount: s.roomCount,
			roundPlayers: s.roundPlayers,
			timerEndsAt: s.timerEndsAt,
			pausedRemainingMs: s.pausedRemainingMs,
			lobbyRooms: s.lobbyRooms,
			openTies: s.openTies,
			podium: s.podium
		};
	}

	me(id: string): MeView | null {
		const p = this.players.get(id);
		if (!p) return null;
		return {
			playerId: id,
			name: p.name,
			status: p.status,
			round: p.round,
			roomNumber: p.roomNumber,
			place: p.place ?? null,
			lobbyRoom: p.status === 'lobby' ? (this.#lobbyRoom.get(id) ?? null) : null,
			avatar: p.avatar ?? 0
		};
	}

	connected(id: string) {
		return (this.#playerPeers.get(id)?.size ?? 0) > 0;
	}

	adminPlayers(): AdminPlayer[] {
		return [...this.players].map(([id, p]) => ({
			id,
			name: p.name,
			status: p.status,
			round: p.round,
			roomNumber: p.roomNumber,
			place: p.place ?? null,
			connected: this.connected(id)
		}));
	}

	roomSummaries(round = this.s.round): RoomSummary[] {
		return [...this.boards.values()]
			.filter((b) => b.round === round)
			.sort((a, b) => a.number - b.number)
			.map(summaryOf);
	}

	// ── Connections ──────────────────────────────────────────────────────

	watch(peer: Peer) {
		this.#watchers.add(peer);
		this.#sendTo(peer, { t: 'tournament', now: this.#now(), s: this.view() });
	}

	/** A phone proved it is this player (token). */
	bindPlayer(peer: Peer, id: string) {
		let set = this.#playerPeers.get(id);
		if (!set) this.#playerPeers.set(id, (set = new Set()));
		set.add(peer);
		this.#sendTo(peer, { t: 'me', me: this.me(id) });
		const p = this.players.get(id);
		const b = p?.roomId ? this.boards.get(p.roomId) : undefined;
		this.#sendTo(peer, { t: 'board', b: b ? boardView(b) : null });
		this.#pushAdmin.soon();
	}

	addAdmin(peer: Peer) {
		this.#admins.set(peer, { watch: null });
		this.watch(peer);
		this.#sendAdminTo(peer);
	}

	watchRoom(peer: Peer, roomId: string | null) {
		const a = this.#admins.get(peer);
		if (!a) return;
		a.watch = roomId && this.boards.has(roomId) ? roomId : null;
		const b = a.watch ? this.boards.get(a.watch) : undefined;
		this.#sendTo(peer, { t: 'room', b: b ? boardView(b) : null });
	}

	detach(peer: Peer, playerId: string | null) {
		this.#watchers.delete(peer);
		this.#admins.delete(peer);
		if (playerId) {
			const set = this.#playerPeers.get(playerId);
			set?.delete(peer);
			if (set && !set.size) {
				this.#playerPeers.delete(playerId);
				const p = this.players.get(playerId);
				if (p) {
					p.lastSeenAt = this.#now();
					this.#dirty.players.add(playerId);
				}
			}
			this.#pushAdmin.soon();
		}
	}

	get listening() {
		return this.#watchers.size;
	}

	// ── Players ──────────────────────────────────────────────────────────

	authenticate(id: string, token: string): boolean {
		const want = this.#tokens.get(id);
		if (!want || typeof token !== 'string' || !token) return false;
		const a = Buffer.from(sha256(token));
		const b = Buffer.from(want);
		return a.length === b.length && timingSafeEqual(a, b);
	}

	/** Avatars picked by everyone still in a game (a game is one room, so each is taken once). */
	#gameAvatars() {
		const out: number[] = [];
		for (const p of this.players.values()) if (p.status !== 'removed' && p.avatar !== undefined) out.push(p.avatar);
		return out;
	}

	async join(rawName: unknown, rawAvatar?: unknown): Promise<{ playerId: string; token: string; name: string }> {
		const s = this.s;
		if (s.status === 'finished') throw new HeistError(`This ${this.#noun} has finished.`);
		if (!s.registrationOpen) throw new HeistError('Registration is closed.');
		if (this.players.size >= MAX_PLAYERS) throw new HeistError(`This ${this.#noun} is full.`);
		if (s.status === 'lobby' && this.#lobbyCount() >= s.rules.maxPlayers) throw new HeistError(`This ${this.#noun} is full (${s.rules.maxPlayers} players).`);
		const name = cleanName(rawName);
		const key = name.toLowerCase();
		if (this.#names.has(key)) throw new HeistError(`That name is already taken in this ${this.#noun}. Try another.`);
		// In a game everyone shares one room, so an avatar can be taken only once. In a
		// tournament rooms aren't known yet: clashes are settled when rooms are locked.
		const game = s.rules.mode === 'game';
		const taken = game ? new Set([...this.#gameAvatars(), ...this.#pendingAvatars]) : new Set<number>();
		if (isAvatar(rawAvatar) && taken.has(rawAvatar)) throw new HeistError('Someone already picked that avatar. Choose another.');
		const avatar = isAvatar(rawAvatar) ? rawAvatar : uniqueAvatars([...taken, randomInt(AVATAR_COUNT)]).at(-1)!;
		this.#names.add(key);
		if (game) this.#pendingAvatars.add(avatar);

		const id = randomBytes(15).toString('base64url').replace(/[-_]/g, 'x');
		const token = randomBytes(24).toString('base64url');
		const now = this.#now();
		// Rooms are locked once round 1 is prepared: later arrivals are reserves.
		const status: PlayerStatus = s.status === 'lobby' ? 'lobby' : 'reserve';
		const player: HeistPlayer = { name, joinedAt: now, status, round: 0, roomId: null, roomNumber: null, lastSeenAt: now, place: null, avatar };
		try {
			// Saved before the phone is told it joined, so its token survives a restart.
			await this.#d.store.addPlayer(this.code, id, player, sha256(token));
		} catch (err) {
			this.#names.delete(key);
			throw err;
		} finally {
			// Once saved the avatar is in `players`; if saving failed it's free again.
			this.#pendingAvatars.delete(avatar);
		}
		// The lobby may have been locked while saving.
		if (player.status === 'lobby' && this.s.status !== 'lobby') {
			player.status = 'reserve';
			this.#dirty.players.add(id);
		}
		this.players.set(id, player);
		this.#tokens.set(id, sha256(token));
		this.s.playerCount = this.players.size;
		this.#dirty.session = true;
		if (player.status === 'lobby') this.#pushLobby.soon();
		this.#pushTournament.soon();
		this.#pushAdmin.soon();
		return { playerId: id, token, name };
	}

	/** Judge and apply one move. Synchronous: the board can't change underneath it. */
	move(id: string, m: { requestId: string; text: string }): MoveResult {
		const p = this.players.get(id);
		if (!p) return { ok: false, message: 'Join the tournament first.' };
		if (p.status === 'removed') return { ok: false, message: 'An organiser removed you from this tournament.' };
		if (p.status !== 'playing' || p.round !== this.s.round || !p.roomId) return { ok: false, message: "You're not in a round right now." };
		let board = this.boards.get(p.roomId);
		if (!board) return { ok: false, message: 'Your room is not ready yet.' };
		const now = this.#now();
		// A tile due this instant counts even if the clock hasn't fired yet.
		const revealed = revealTiles(board, now);
		if (revealed) this.#setBoard((board = revealed));
		const out = applyMove(board, { ...m, playerId: id }, now, this.#d.deps());
		if (out.board) this.#setBoard(out.board);
		return out.result;
	}

	// ── Organiser actions ────────────────────────────────────────────────

	control(action: HeistControl, body: Record<string, unknown>): Promise<void> {
		return this.#op(async () => {
			switch (action) {
				case 'sync':
					return;
				case 'open-registration':
				case 'close-registration':
					if (this.s.status === 'finished') throw new HeistError('This tournament has finished.');
					this.s.registrationOpen = action === 'open-registration';
					break;
				case 'prepare':
					this.#prepare();
					break;
				case 'start':
					this.#start();
					break;
				case 'pause':
					this.#pause();
					break;
				case 'resume':
					this.#resume();
					break;
				case 'end': {
					const round = Number(body.round);
					await this.#finish(Number.isInteger(round) ? round : this.s.round);
					break;
				}
				case 'resolve-tie':
					this.#decideTie(body);
					break;
				case 'next-round':
					this.#nextRound(Number(body.round));
					break;
				case 'remove-player':
					this.#remove(String(body.playerId ?? ''));
					break;
				case 'close':
					this.#close();
					break;
				case 'reset':
					if (String(body.confirm ?? '').trim().toUpperCase() !== this.code) throw new HeistError('Type the game code to confirm the reset.');
					await this.#reset();
					break;
				default:
					throw new HeistError('Unknown action.');
			}
			this.#dirty.session = true;
			this.#pushTournament.now();
			this.#pushAdmin.now();
			// The change is already live; if saving fails the next periodic save retries.
			await this.save().catch(() => {});
		});
	}

	#op<T>(fn: () => Promise<T>): Promise<T> {
		const run = this.#ops.catch(() => {}).then(fn);
		this.#ops = run;
		return run;
	}

	#prepare() {
		const s = this.s;
		if (s.status !== 'lobby') return; // already prepared
		const roster = [...this.players]
			.filter(([, p]) => p.status === 'lobby')
			.sort(([ia, a], [ib, b]) => a.joinedAt - b.joinedAt || ia.localeCompare(ib))
			.map(([id, p]) => ({ id, name: p.name }));
		if (roster.length < 2) throw new HeistError('At least 2 players must register first.');
		s.totalStages = s.rules.stages;
		this.#buildRound(1, roster);
		s.status = 'ready';
		s.round = 1;
		this.#lobbyRoom.clear();
		s.lobbyRooms = 0;
	}

	/**
	 * Make a stage's rooms. The planned stages are kept if the players who are
	 * left can fill them; if not (a small crowd, removals) the tournament gets
	 * shorter and goes to the final sooner. Each room's tiles depend on how
	 * many play in it.
	 */
	#buildRound(round: number, roster: { id: string; name: string }[]) {
		const s = this.s;
		const plan = fitStages(roster.length, Math.max(1, s.totalStages - round + 1), s.rules.advance, s.rules.roomSize);
		if (!plan) throw new HeistError(`Too many players left for the final (max ${s.rules.roomSize}).`);
		const rooms = assignRooms(roster, plan[0].sizes.length);
		rooms.forEach((members, i) => {
			const number = i + 1;
			const roomId = roomIdFor(this.#seed, round, number);
			const tiles = tilePlan(members.length, s.rules);
			const bag = makeBag(tiles.count, rng(bagSeed(this.#seed, round, number)));
			// Nobody in a room shares an avatar: a later player with a clash gets the next free one.
			const avatars = uniqueAvatars(members.map((m) => this.players.get(m.id)?.avatar ?? 0));
			const seated = members.map((m, j) => ({ ...m, avatar: avatars[j] }));
			this.#setBoard(newBoard({ round, roomId, number, rules: s.rules, tiles, players: seated, bag }), false);
			for (const m of members) this.#patchPlayer(m.id, { status: 'playing', round, roomId, roomNumber: number, place: null });
		});
		s.totalStages = round - 1 + plan.length;
		s.roomCount = rooms.length;
		s.roundPlayers = roster.length;
		s.final = plan[0].final;
	}

	get #noun() {
		return this.s.rules.mode === 'game' ? 'game' : 'tournament';
	}

	#lobbyCount() {
		let n = 0;
		for (const p of this.players.values()) if (p.status === 'lobby') n++;
		return n;
	}

	#currentBoards() {
		return [...this.boards.values()].filter((b) => b.round === this.s.round);
	}

	#start() {
		const s = this.s;
		if (s.status === 'playing' || s.status === 'paused') return;
		if (s.status !== 'ready') throw new HeistError('Prepare the round first.');
		const endsAt = this.#now() + (s.rules.roundSeconds + s.rules.finalSeconds) * 1000;
		for (const b of this.#currentBoards()) this.#setBoard({ ...b, status: 'playing', endsAt, pausedRemainingMs: null }, false);
		s.status = 'playing';
		s.timerEndsAt = endsAt;
		s.pausedRemainingMs = null;
		s.startedAt ??= this.#now();
		this.#tick(); // turns over the opening tiles, which pushes every board
	}

	#pause() {
		const s = this.s;
		if (s.status === 'paused') return;
		if (s.status !== 'playing' || !s.timerEndsAt) throw new HeistError('The round is not running.');
		const now = this.#now();
		const remaining = Math.max(0, s.timerEndsAt - now);
		for (const b of this.#currentBoards()) this.#setBoard({ ...(revealTiles(b, now) ?? b), status: 'paused', endsAt: null, pausedRemainingMs: remaining });
		s.status = 'paused';
		s.timerEndsAt = null;
		s.pausedRemainingMs = remaining;
		this.#disarmTimer();
	}

	#resume() {
		const s = this.s;
		if (s.status === 'playing') return;
		if (s.status !== 'paused') throw new HeistError('The round is not paused.');
		const endsAt = this.#now() + (s.pausedRemainingMs ?? 0);
		for (const b of this.#currentBoards()) this.#setBoard({ ...b, status: 'playing', endsAt, pausedRemainingMs: null });
		s.status = 'playing';
		s.timerEndsAt = endsAt;
		s.pausedRemainingMs = null;
		this.#tick();
	}

	/**
	 * The server's tile clock: turns over every tile that is due in every room,
	 * then sleeps until the next tile (or the end of the round, which it ends
	 * itself — no screen needs to be open). Pausing disarms it.
	 */
	#tick() {
		this.#disarmTimer();
		const s = this.s;
		if (s.status !== 'playing' || !s.timerEndsAt) return;
		const now = this.#now();
		if (now >= s.timerEndsAt) {
			const round = s.round;
			void this.control('end', { round }).catch((err) => console.error('[word-heist] auto end', err));
			return;
		}
		// Not saved: after a restart the same tiles are turned over again from the bag and the clock.
		// (Saving every board on every tile slowed big rounds down; moves still save as usual.)
		for (const b of this.#currentBoards()) {
			const next = revealTiles(b, now);
			if (next) this.#setBoard(next, true, false);
		}
		// Rooms of different sizes drop tiles at different rates: wake for the soonest.
		let at = s.timerEndsAt;
		for (const b of this.#currentBoards()) at = Math.min(at, roundClock(b.tiles, s.timerEndsAt, null, now).nextTileAt ?? at);
		this.#roundTimer = setTimeout(() => this.#tick(), Math.max(0, at - now) + TICK_SLACK_MS);
		this.#roundTimer.unref?.();
	}

	#disarmTimer() {
		if (this.#roundTimer) clearTimeout(this.#roundTimer);
		this.#roundTimer = null;
	}

	/** Close the round, rank every room, decide qualifiers. Repeat calls do nothing. */
	async #finish(round: number) {
		const s = this.s;
		if (round !== s.round || !['playing', 'paused', 'scoring'].includes(s.status)) return;
		this.#disarmTimer();
		s.status = 'scoring';
		s.timerEndsAt = null;
		s.pausedRemainingMs = null;
		for (const b of this.#currentBoards()) if (b.status !== 'finished') this.#setBoard({ ...b, status: 'finished', endsAt: null, pausedRemainingMs: null });
		let result = this.rounds.get(round);
		if (!result) {
			const places = placesFor(s.final, s.rules.advance);
			result = {
				round,
				final: s.final,
				places,
				rooms: this.#currentBoards()
					.sort((a, b) => a.number - b.number)
					.map((b) => roomResult(b.roomId, b.number, rankBoard(b), places, s.final)),
				createdAt: this.#now()
			};
			this.#setRound(result);
		}
		this.#applyOutcome(result);
	}

	#applyOutcome(result: RoundResult) {
		const podium: PodiumEntry[] = [];
		for (const room of result.rooms) {
			const pending = new Set(room.ties.filter((t) => !t.resolved).flatMap((t) => t.candidates));
			const advancing = new Set(room.advancing);
			for (const r of room.ranking) {
				let status: PlayerStatus;
				let place: number | null = null;
				if (advancing.has(r.playerId)) {
					if (result.final) {
						place = room.advancing.indexOf(r.playerId) + 1;
						status = place === 1 ? 'champion' : 'qualified';
						podium.push({ playerId: r.playerId, name: r.name, score: r.score, rank: place });
					} else status = 'qualified';
				} else status = pending.has(r.playerId) ? 'tied' : 'eliminated';
				if (this.players.get(r.playerId)?.status !== 'removed') this.#patchPlayer(r.playerId, { status, place });
			}
		}
		const s = this.s;
		s.openTies = result.rooms.reduce((n, r) => n + r.ties.filter((t) => !t.resolved).length, 0);
		const done = result.final && s.openTies === 0;
		s.status = done ? 'finished' : 'review';
		if (done) {
			s.podium = podium.sort((a, b) => a.rank - b.rank);
			s.winner = s.podium[0] ? { name: s.podium[0].name, score: s.podium[0].score } : null;
			s.endedAt = this.#now();
			s.registrationOpen = false;
			return;
		}
		// Every place decided: allot the next stage's rooms straight away so players see
		// where they're going. Nothing starts until an organiser presses Start.
		if (!result.final && s.openTies === 0) {
			try {
				this.#nextRound(s.round);
			} catch (err) {
				// Stays in review: the organiser can prepare the stage by hand and sees why.
				console.warn('[word-heist] could not allot the next stage', err);
			}
		}
	}

	#decideTie(body: Record<string, unknown>) {
		const s = this.s;
		if (s.status !== 'review') throw new HeistError('There is nothing to decide right now.');
		const r = this.rounds.get(s.round);
		if (!r) throw new HeistError('This round has no results yet.');
		const i = r.rooms.findIndex((room) => room.roomId === body.roomId);
		if (i < 0) throw new HeistError('That room is not in this round.');
		const tieIndex = Number.isInteger(body.tieIndex) ? (body.tieIndex as number) : 0;
		const updated = resolveTie(r.rooms[i], tieIndex, body.picks, r.places ?? placesFor(r.final, 2));
		if (typeof updated === 'string') throw new HeistError(updated);
		const next: RoundResult = { ...r, rooms: r.rooms.map((room, j) => (j === i ? (updated as RoomResult) : room)) };
		this.#setRound(next);
		this.#applyOutcome(next);
	}

	#nextRound(fromRound: number) {
		const s = this.s;
		if (Number.isInteger(fromRound) && fromRound !== s.round) return; // already moved on
		if (s.status !== 'review') throw new HeistError('Finish the current round first.');
		if (s.final) throw new HeistError('That was the final round.');
		const prev = this.rounds.get(s.round);
		if (!prev || s.openTies > 0 || !prev.rooms.every(roomDecided)) throw new HeistError('Decide the tied places first.');
		const roster = nextRoster(prev.rooms)
			.filter((id) => this.players.get(id) && this.players.get(id)!.status !== 'removed')
			.map((id) => ({ id, name: this.players.get(id)!.name }));
		if (!roster.length) throw new HeistError('No one qualified.');
		s.round += 1;
		s.status = 'ready';
		s.openTies = 0;
		this.#buildRound(s.round, roster);
	}

	#remove(id: string) {
		const p = this.players.get(id);
		if (!p) throw new HeistError('That player is not in this tournament.');
		if (p.status === 'removed') return;
		if (p.roomId && p.round === this.s.round && ['ready', 'playing', 'paused'].includes(this.s.status)) {
			const b = this.boards.get(p.roomId);
			const next = b && removeFromBoard(b, id);
			if (next) this.#setBoard(next);
		}
		const wasLobby = p.status === 'lobby';
		this.#patchPlayer(id, { status: 'removed' });
		if (wasLobby) this.#recomputeLobby();
	}

	/** Close the lobby / end the tournament for good: no one can join, any running round stops unscored. */
	#close() {
		const s = this.s;
		if (s.status === 'finished') return;
		this.#disarmTimer();
		for (const b of this.#currentBoards()) if (b.status !== 'finished') this.#setBoard({ ...b, status: 'finished', endsAt: null, pausedRemainingMs: null });
		Object.assign(s, { status: 'finished', closed: true, registrationOpen: false, timerEndsAt: null, pausedRemainingMs: null, lobbyRooms: 0, openTies: 0, endedAt: this.#now() });
		this.#lobbyRoom.clear();
	}

	async #reset() {
		this.#disarmTimer();
		await this.#d.store.clearRounds(this.code);
		this.boards.clear();
		this.rounds.clear();
		this.#dirty.boards.clear();
		this.#dirty.rounds.clear();
		this.#roundsVersion++;
		for (const [id, p] of this.players) {
			if (p.status !== 'removed') this.#patchPlayer(id, { status: 'lobby', round: 0, roomId: null, roomNumber: null, place: null });
		}
		Object.assign(this.s, {
			status: 'lobby',
			registrationOpen: true,
			round: 0,
			roomCount: 0,
			roundPlayers: 0,
			timerEndsAt: null,
			pausedRemainingMs: null,
			final: false,
			totalStages: this.s.rules.stages,
			closed: false,
			openTies: 0,
			podium: [],
			winner: null,
			endedAt: null,
			startedAt: null
		});
		this.#recomputeLobby();
	}

	// ── Lobby ────────────────────────────────────────────────────────────

	#recomputeLobby() {
		if (this.s.status !== 'lobby') return;
		const roster = [...this.players]
			.filter(([, p]) => p.status === 'lobby')
			.sort(([ia, a], [ib, b]) => a.joinedAt - b.joinedAt || ia.localeCompare(ib));
		const next = new Map<string, number>();
		const rules = this.s.rules;
		const rooms = roster.length ? (fitStages(roster.length, rules.stages, rules.advance, rules.roomSize)?.[0].sizes.length ?? 1) : 0;
		assignRooms(roster, rooms).forEach((room, i) => room.forEach(([id]) => next.set(id, i + 1)));
		for (const [id, room] of next) {
			if (this.#lobbyRoom.get(id) !== room) {
				this.#lobbyRoom.set(id, room);
				this.#sendPlayer(id, { t: 'me', me: this.me(id) });
			}
		}
		for (const id of [...this.#lobbyRoom.keys()]) if (!next.has(id)) this.#lobbyRoom.delete(id);
		if (rooms !== this.s.lobbyRooms) {
			this.s.lobbyRooms = rooms;
			this.#dirty.session = true;
		}
		this.#pushTournament.soon();
	}

	// ── State changes (also queue saving and pushing) ────────────────────

	/** `save: false` for changes a restart can rebuild on its own (tiles turned over by the clock). */
	#setBoard(b: Board, push = true, save = true) {
		this.boards.set(b.roomId, b);
		if (save) this.#dirty.boards.add(b.roomId);
		if (!push) return;
		const msg = JSON.stringify({ t: 'board', b: boardView(b) } satisfies HeistServerMessage);
		for (const id of Object.keys(b.players)) for (const peer of this.#playerPeers.get(id) ?? []) peer.send(msg);
		const roomMsg = JSON.stringify({ t: 'room', b: boardView(b) } satisfies HeistServerMessage);
		for (const [peer, a] of this.#admins) if (a.watch === b.roomId) peer.send(roomMsg);
		this.#pushAdmin.soon();
	}

	#setRound(r: RoundResult) {
		this.rounds.set(r.round, r);
		this.#dirty.rounds.add(r.round);
		this.#roundsVersion++;
	}

	#patchPlayer(id: string, patch: Partial<HeistPlayer>) {
		const p = this.players.get(id);
		if (!p) return;
		Object.assign(p, patch);
		this.#dirty.players.add(id);
		this.#sendPlayer(id, { t: 'me', me: this.me(id) });
		if (patch.roomId !== undefined) {
			const b = p.roomId ? this.boards.get(p.roomId) : undefined;
			this.#sendPlayer(id, { t: 'board', b: b ? boardView(b) : null });
		}
	}

	// ── Sending ──────────────────────────────────────────────────────────

	#sendTo(peer: Peer, msg: HeistServerMessage) {
		peer.send(JSON.stringify(msg));
	}

	#sendPlayer(id: string, msg: HeistServerMessage) {
		const peers = this.#playerPeers.get(id);
		if (!peers?.size) return;
		const data = JSON.stringify(msg);
		for (const peer of peers) peer.send(data);
	}

	#broadcast(peers: Iterable<Peer>, msg: HeistServerMessage) {
		const data = JSON.stringify(msg);
		for (const peer of peers) peer.send(data);
	}

	#sendAdmin() {
		for (const peer of this.#admins.keys()) this.#sendAdminTo(peer);
	}

	#sendAdminTo(peer: Peer) {
		const withRounds = this.#adminRoundsSent.get(peer) !== this.#roundsVersion;
		this.#adminRoundsSent.set(peer, this.#roundsVersion);
		this.#sendTo(peer, {
			t: 'admin',
			rooms: this.roomSummaries(),
			players: this.adminPlayers(),
			...(withRounds ? { rounds: [...this.rounds.values()].sort((a, b) => a.round - b.round) } : {})
		});
	}

	// ── Saving ───────────────────────────────────────────────────────────

	/** Write everything changed since the last save (one batch). Saves never overlap. */
	save(): Promise<void> {
		const run = this.#saving.catch(() => {}).then(async () => {
			const d = this.#dirty;
			if (!d.session && !d.players.size && !d.boards.size && !d.rounds.size) return;
			const set = {
				session: d.session ? structuredClone(this.s) : undefined,
				players: [...d.players].filter((id) => this.players.has(id)).map((id) => ({ id, player: structuredClone(this.players.get(id)!) })),
				boards: [...d.boards].filter((id) => this.boards.has(id)).map((id) => ({ board: structuredClone(this.boards.get(id)!), summary: summaryOf(this.boards.get(id)!) })),
				rounds: [...d.rounds].filter((n) => this.rounds.has(n)).map((n) => structuredClone(this.rounds.get(n)!))
			};
			this.#dirty = { session: false, players: new Set(), boards: new Set(), rounds: new Set() };
			try {
				await this.#d.store.save(this.code, set);
			} catch (err) {
				// Keep it for the next save.
				console.error('[word-heist] save failed', err);
				if (set.session) this.#dirty.session = true;
				for (const p of set.players) this.#dirty.players.add(p.id);
				for (const b of set.boards) this.#dirty.boards.add(b.board.roomId);
				for (const r of set.rounds) this.#dirty.rounds.add(r.round);
				throw err;
			}
		});
		this.#saving = run;
		return run;
	}
}
