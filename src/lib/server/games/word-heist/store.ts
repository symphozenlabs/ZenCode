import { collection, deleteDoc, doc, getDoc, getDocs, setDoc, writeBatch, type Firestore } from 'firebase/firestore';
import { adminDb } from '$lib/server/admin-session';
import { SESSIONS } from '$lib/games/tech-word-rush/types';
import { CONFIG_COLLECTION, CONFIG_DOC, roundId, type Board, type HeistPlayer, type HeistSession, type ModerationConfig, type RoomSummary, type RoundResult } from '$lib/games/word-heist/types';

/**
 * Where a Word Heist tournament is saved. The live server keeps the real
 * state in memory; this is its backup (restored after a restart) and what
 * the admin Games list and history read.
 */
export interface Snapshot {
	session: HeistSession;
	seed: string;
	players: { id: string; player: HeistPlayer; tokenHash: string }[];
	/** Every round's boards (a tournament has a few dozen). */
	boards: Board[];
	rounds: RoundResult[];
}

export interface SaveSet {
	session?: HeistSession;
	players?: { id: string; player: HeistPlayer }[];
	boards?: { board: Board; summary: RoomSummary }[];
	rounds?: RoundResult[];
}

export interface HeistStore {
	create(session: HeistSession, seed: string): Promise<boolean>;
	load(code: string): Promise<Snapshot | null>;
	/** A new player's device token (hash), saved before the join is confirmed. */
	addPlayer(code: string, id: string, player: HeistPlayer, tokenHash: string): Promise<void>;
	save(code: string, set: SaveSet): Promise<void>;
	/** Reset: delete every room, board and round. */
	clearRounds(code: string): Promise<void>;
	moderation(): Promise<ModerationConfig | null>;
}

const WRITES_PER_BATCH = 450;

/** Firestore, signed in as the organiser from .env (no service account needed). */
export class FirestoreHeistStore implements HeistStore {
	#db: () => Promise<Firestore>;

	constructor(db: () => Promise<Firestore> = adminDb) {
		this.#db = db;
	}

	async create(session: HeistSession, seed: string) {
		const db = await this.#db();
		const ref = doc(db, SESSIONS, session.code);
		if ((await getDoc(ref)).exists()) return false;
		const batch = writeBatch(db);
		batch.set(ref, session);
		batch.set(doc(db, SESSIONS, session.code, 'secret', 'heist'), { seed });
		await batch.commit();
		return true;
	}

	async load(code: string): Promise<Snapshot | null> {
		const db = await this.#db();
		const snap = await getDoc(doc(db, SESSIONS, code));
		const session = snap.data() as HeistSession | undefined;
		if (!session || session.gameType !== 'word-heist') return null;
		const [secret, players, states, boards, rounds] = await Promise.all([
			getDoc(doc(db, SESSIONS, code, 'secret', 'heist')),
			getDocs(collection(db, SESSIONS, code, 'players')),
			getDocs(collection(db, SESSIONS, code, 'playerState')),
			getDocs(collection(db, SESSIONS, code, 'boards')),
			getDocs(collection(db, SESSIONS, code, 'rounds'))
		]);
		const hashes = new Map(states.docs.map((d) => [d.id, String(d.data().tokenHash ?? '')]));
		return {
			session,
			seed: String(secret.data()?.seed ?? ''),
			players: players.docs.map((d) => ({ id: d.id, player: d.data() as HeistPlayer, tokenHash: hashes.get(d.id) ?? '' })),
			boards: boards.docs.map((d) => d.data() as Board),
			rounds: rounds.docs.map((d) => d.data() as RoundResult).sort((a, b) => a.round - b.round)
		};
	}

	async addPlayer(code: string, id: string, player: HeistPlayer, tokenHash: string) {
		const db = await this.#db();
		const batch = writeBatch(db);
		batch.set(doc(db, SESSIONS, code, 'players', id), player);
		batch.set(doc(db, SESSIONS, code, 'playerState', id), { tokenHash });
		await batch.commit();
	}

	async save(code: string, set: SaveSet) {
		const db = await this.#db();
		const writes: [string[], object][] = [];
		if (set.session) writes.push([[SESSIONS, code], set.session]);
		for (const p of set.players ?? []) writes.push([[SESSIONS, code, 'players', p.id], p.player]);
		for (const b of set.boards ?? []) {
			writes.push([[SESSIONS, code, 'boards', b.board.roomId], b.board]);
			writes.push([[SESSIONS, code, 'rooms', b.board.roomId], b.summary]);
		}
		for (const r of set.rounds ?? []) writes.push([[SESSIONS, code, 'rounds', roundId(r.round)], r]);
		for (let i = 0; i < writes.length; i += WRITES_PER_BATCH) {
			const batch = writeBatch(db);
			for (const [path, data] of writes.slice(i, i + WRITES_PER_BATCH)) batch.set(doc(db, path[0], ...path.slice(1)), data);
			await batch.commit();
		}
	}

	async clearRounds(code: string) {
		const db = await this.#db();
		for (const sub of ['rooms', 'boards', 'rounds']) {
			for (const d of (await getDocs(collection(db, SESSIONS, code, sub))).docs) await deleteDoc(d.ref);
		}
	}

	async moderation() {
		const d = (await getDoc(doc(await this.#db(), CONFIG_COLLECTION, CONFIG_DOC))).data();
		if (!d) return null;
		return {
			blocklist: Array.isArray(d.blocklist) ? d.blocklist.filter((w: unknown) => typeof w === 'string') : [],
			detectObfuscation: d.detectObfuscation !== false,
			updatedAt: typeof d.updatedAt === 'number' ? d.updatedAt : null,
			updatedBy: typeof d.updatedBy === 'string' ? d.updatedBy : null
		};
	}
}

/** In-memory store for tests. */
export class MemoryHeistStore implements HeistStore {
	sessions = new Map<string, HeistSession>();
	seeds = new Map<string, string>();
	players = new Map<string, Map<string, { player: HeistPlayer; tokenHash: string }>>();
	boards = new Map<string, Map<string, Board>>();
	rounds = new Map<string, Map<number, RoundResult>>();
	config: ModerationConfig | null = null;
	saves = 0;

	async create(session: HeistSession, seed: string) {
		if (this.sessions.has(session.code)) return false;
		this.sessions.set(session.code, structuredClone(session));
		this.seeds.set(session.code, seed);
		this.players.set(session.code, new Map());
		this.boards.set(session.code, new Map());
		this.rounds.set(session.code, new Map());
		return true;
	}

	async load(code: string): Promise<Snapshot | null> {
		const session = this.sessions.get(code);
		if (!session) return null;
		return structuredClone({
			session,
			seed: this.seeds.get(code) ?? '',
			players: [...(this.players.get(code) ?? [])].map(([id, p]) => ({ id, ...p })),
			boards: [...(this.boards.get(code)?.values() ?? [])],
			rounds: [...(this.rounds.get(code)?.values() ?? [])].sort((a, b) => a.round - b.round)
		});
	}

	async addPlayer(code: string, id: string, player: HeistPlayer, tokenHash: string) {
		this.players.get(code)!.set(id, structuredClone({ player, tokenHash }));
	}

	async save(code: string, set: SaveSet) {
		this.saves++;
		if (set.session) this.sessions.set(code, structuredClone(set.session));
		for (const p of set.players ?? []) {
			const prev = this.players.get(code)!.get(p.id);
			this.players.get(code)!.set(p.id, structuredClone({ player: p.player, tokenHash: prev?.tokenHash ?? '' }));
		}
		for (const b of set.boards ?? []) this.boards.get(code)!.set(b.board.roomId, structuredClone(b.board));
		for (const r of set.rounds ?? []) this.rounds.get(code)!.set(r.round, structuredClone(r));
	}

	async clearRounds(code: string) {
		this.boards.get(code)?.clear();
		this.rounds.get(code)?.clear();
	}

	async moderation() {
		return this.config;
	}
}

export async function saveModerationDoc(value: ModerationConfig) {
	await setDoc(doc(await adminDb(), CONFIG_COLLECTION, CONFIG_DOC), value);
}
