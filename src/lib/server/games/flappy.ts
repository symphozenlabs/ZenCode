import { error, isHttpError, json } from '@sveltejs/kit';
import { createHash, randomBytes, randomInt, timingSafeEqual } from 'node:crypto';
import {
	collection,
	doc,
	getCountFromServer,
	getDoc,
	getDocs,
	increment,
	runTransaction,
	updateDoc,
	type DocumentSnapshot,
	type Firestore
} from 'firebase/firestore';
import { adminDb } from '$lib/server/admin-session';
import { maxScore } from '$lib/games/flappy/engine';
import { SKINS, isFlyGame, type FlyGame } from '$lib/games/flappy/skins';
import {
	CODE_RE,
	DURATIONS,
	type FlapAction,
	type FlapControl,
	type FlapPlayer,
	type FlapRankEntry,
	type FlapSession,
	type FlapView
} from '$lib/games/flappy/types';
import { SESSIONS } from '$lib/games/tech-word-rush/types';

const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'; // no I, L, O, 0, 1
const MAX_PLAYERS = 300;
const NAME_MAX = 20;
/** A flight still in the air at time-up is accepted if it lands within this. */
const GRACE_MS = 4000;
/** Network allowance when checking a score against the time flown. */
const LATENCY_MS = 2500;
const MAX_REPORTED = 9999;

const sessionRef = (db: Firestore, code: string) => doc(db, SESSIONS, code);
const playerRef = (db: Firestore, code: string, id: string) => doc(db, SESSIONS, code, 'players', id);
const stateRef = (db: Firestore, code: string, id: string) => doc(db, SESSIONS, code, 'playerState', id);

interface PrivateState {
	tokenHash: string;
}

const sha256 = (s: string) => createHash('sha256').update(s).digest('hex');
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Wrap a request handler: HTTP errors pass through, anything else becomes a plain message. */
export async function handle(fn: () => Promise<unknown>) {
	try {
		return json(await fn());
	} catch (err) {
		if (isHttpError(err)) return json({ message: err.body.message }, { status: err.status });
		console.error('[flappy]', err);
		return json({ message: 'Something went wrong. Please try again.' }, { status: 500 });
	}
}

export function parseCode(raw: string | undefined): string {
	const code = (raw ?? '').trim().toUpperCase();
	if (!CODE_RE.test(code)) error(404, 'That game code does not exist.');
	return code;
}

export async function readBody(request: Request): Promise<Record<string, unknown>> {
	try {
		const body = await request.json();
		return body && typeof body === 'object' ? body : {};
	} catch {
		error(400, 'Invalid request.');
	}
}

const sessionData = (snap: DocumentSnapshot) => {
	const s = snap.data() as FlapSession | undefined;
	if (!snap.exists() || !isFlyGame(s?.gameType)) error(404, 'This game session no longer exists.');
	return s;
};

// ── Sessions (admin) ─────────────────────────────────────────────────────

function newCode(game: FlyGame) {
	let s: string = SKINS[game].codePrefix;
	for (let i = 0; i < 4; i++) s += CODE_ALPHABET[randomInt(CODE_ALPHABET.length)];
	return s;
}

export async function createSession(createdBy: string, duration: number, game: unknown = 'flappy'): Promise<{ code: string }> {
	if (!DURATIONS.includes(duration as never)) error(400, 'Choose a valid game length.');
	if (!isFlyGame(game)) error(400, 'Unknown game.');
	const db = await adminDb();
	for (let attempt = 0; attempt < 6; attempt++) {
		const code = newCode(game);
		const session: FlapSession = {
			code,
			gameType: game,
			status: 'lobby',
			createdAt: Date.now(),
			createdBy,
			startedAt: null,
			endedAt: null,
			duration,
			timerEndsAt: null,
			playerCount: 0,
			leaderboard: [],
			winner: null
		};
		const created = await runTransaction(db, async (tx) => {
			if ((await tx.get(sessionRef(db, code))).exists()) return false; // code taken → try another
			tx.set(sessionRef(db, code), session);
			return true;
		});
		if (created) return { code };
	}
	error(500, 'Could not create a game code. Please try again.');
}

/**
 * Standard competition ranking (1, 2, 2, 4) on each player's latest score.
 * Ties are listed by who reached the score first.
 */
export function rankPlayers(players: readonly (FlapPlayer & { id: string })[]): FlapRankEntry[] {
	const sorted = [...players].sort(
		(a, b) => b.score - a.score || (a.scoredAt ?? Infinity) - (b.scoredAt ?? Infinity) || a.joinedAt - b.joinedAt
	);
	let rank = 0;
	return sorted.map((p, i) => {
		if (i === 0 || p.score !== sorted[i - 1].score) rank = i + 1;
		return { id: p.id, name: p.name, score: p.score, rounds: p.rounds, rank };
	});
}

async function writeRanking(db: Firestore, code: string) {
	const snap = await getDocs(collection(db, SESSIONS, code, 'players'));
	const leaderboard = rankPlayers(snap.docs.map((d) => ({ id: d.id, ...(d.data() as FlapPlayer) }))).slice(0, 500);
	const top = leaderboard[0];
	await updateDoc(sessionRef(db, code), {
		leaderboard,
		playerCount: snap.size,
		winner: top && top.score > 0 ? { name: top.name, score: top.score } : null,
		ranking: false
	});
}

/**
 * Closes flights (early, or at time-up) and publishes the final leaderboard
 * once any flight still landing has had its grace period.
 */
async function finish(db: Firestore, code: string) {
	const closesAt = await runTransaction(db, async (tx) => {
		const s = sessionData(await tx.get(sessionRef(db, code)));
		if (s.status === 'finished') return null;
		const now = Date.now();
		const timerEndsAt = Math.min(s.timerEndsAt ?? now, now);
		tx.update(sessionRef(db, code), { status: 'finished', endedAt: now, timerEndsAt, ranking: true });
		return s.status === 'playing' ? timerEndsAt + GRACE_MS : now;
	});
	if (closesAt === null) return;
	const wait = closesAt - Date.now();
	if (wait > 0) await sleep(wait);
	await writeRanking(db, code);
}

export async function control(code: string, action: FlapControl): Promise<{ now: number }> {
	if (!['sync', 'start', 'finish'].includes(action)) error(400, 'Unknown action.');
	const db = await adminDb();
	if (action === 'sync') {
		sessionData(await getDoc(sessionRef(db, code)));
	} else if (action === 'start') {
		const playerCount = await countPlayers(db, code);
		await runTransaction(db, async (tx) => {
			const s = sessionData(await tx.get(sessionRef(db, code)));
			if (s.status !== 'lobby') return; // already started — idempotent
			const now = Date.now();
			tx.update(sessionRef(db, code), { status: 'playing', startedAt: now, timerEndsAt: now + s.duration * 1000, playerCount });
		});
	} else {
		await finish(db, code);
	}
	return { now: Date.now() };
}

// ── Participants ─────────────────────────────────────────────────────────

const countPlayers = async (db: Firestore, code: string) =>
	(await getCountFromServer(collection(db, SESSIONS, code, 'players'))).data().count;

function cleanName(raw: unknown): string {
	const name = (typeof raw === 'string' ? raw : '')
		.replace(/[\u0000-\u001f\u007f<>]/g, '')
		.replace(/\s+/g, ' ')
		.trim();
	if (!name) error(400, 'Enter a display name.');
	if (name.length > NAME_MAX) error(400, `Keep your name under ${NAME_MAX} characters.`);
	return name;
}

export async function join(code: string, rawName: unknown) {
	const name = cleanName(rawName);
	const db = await adminDb();
	const sRef = sessionRef(db, code);
	const s = sessionData(await getDoc(sRef));
	if (s.status === 'finished') error(410, 'This game has ended.');
	// Counted rather than kept on the session doc: a join must not write the
	// doc every phone is listening to, or a full room joining floods them all.
	if ((await countPlayers(db, code)) >= MAX_PLAYERS) error(409, 'This game is full.');

	const id = doc(collection(db, SESSIONS, code, 'players')).id;
	const token = randomBytes(24).toString('base64url');
	const nameRef = doc(db, SESSIONS, code, 'names', sha256(name.toLowerCase()));

	await runTransaction(db, async (tx) => {
		if ((await tx.get(nameRef)).exists()) error(409, 'That name is already taken in this game. Try another.');
		const player: FlapPlayer = { name, joinedAt: Date.now(), score: 0, scoredAt: null, rounds: 0, flying: false, round: 0, flightStartedAt: null };
		const state: PrivateState = { tokenHash: sha256(token) };
		tx.set(nameRef, { playerId: id });
		tx.set(playerRef(db, code, id), player);
		tx.set(stateRef(db, code, id), state);
	});
	return { playerId: id, token, name, now: Date.now() };
}

export async function play(code: string, body: Record<string, unknown>): Promise<FlapView> {
	const playerId = typeof body.playerId === 'string' ? body.playerId : '';
	const token = typeof body.token === 'string' ? body.token : '';
	const action = body.action as FlapAction;
	if (!playerId || !/^[A-Za-z0-9]{10,40}$/.test(playerId) || !token) error(401, 'Join the game first.');
	if (!['state', 'start', 'end'].includes(action)) error(400, 'Unknown action.');
	const db = await adminDb();

	const { view, expired } = await runTransaction(db, async (tx) => {
		const [sSnap, stSnap, pSnap] = await Promise.all([
			tx.get(sessionRef(db, code)),
			tx.get(stateRef(db, code, playerId)),
			tx.get(playerRef(db, code, playerId))
		]);
		const s = sessionData(sSnap);
		const st = stSnap.data() as PrivateState | undefined;
		const p = pSnap.data() as FlapPlayer | undefined;
		const given = Buffer.from(sha256(token));
		const stored = Buffer.from(st?.tokenHash ?? '');
		if (!st || !p || given.length !== stored.length || !timingSafeEqual(given, stored)) {
			error(401, 'This device is no longer in the game. Join again.');
		}

		const now = Date.now();
		const endsAt = s.timerEndsAt ?? 0;
		const open = s.status === 'playing' && now < endsAt;
		let round = p.round;
		let score = p.score;
		let rounds = p.rounds;
		let flying = p.flying;
		let saved: number | undefined;
		let rejected: string | undefined;

		if (action === 'start') {
			if (!open) {
				rejected = s.status === 'lobby' ? 'The game hasn’t started yet.' : 'Time’s up — no more flights.';
			} else {
				// A new flight replaces the previous score.
				round = p.round + 1;
				score = 0;
				rounds = p.rounds + 1;
				flying = true;
				tx.update(playerRef(db, code, playerId), { score: 0, scoredAt: null, flying: true, rounds: increment(1), round, flightStartedAt: now });
			}
		} else if (action === 'end') {
			const r = Number(body.round);
			const reported = Math.floor(Number(body.score));
			if (r !== p.round || p.flightStartedAt === null) {
				rejected = 'That flight was already saved.';
			} else if (now > endsAt + GRACE_MS) {
				rejected = 'Time was up before this flight landed.';
				flying = false;
				tx.update(playerRef(db, code, playerId), { flying: false, flightStartedAt: null });
			} else {
				// Never more than the bird could have scored in the time it flew.
				const flown = Math.min(now, endsAt + GRACE_MS) - p.flightStartedAt + LATENCY_MS;
				const cap = maxScore(flown) + 1;
				saved = Math.max(0, Math.min(Number.isFinite(reported) ? reported : 0, cap, MAX_REPORTED));
				score = saved;
				flying = false;
				tx.update(playerRef(db, code, playerId), { score: saved, scoredAt: now, flying: false, flightStartedAt: null });
			}
		}

		return {
			view: { now, status: s.status, round, score, rounds, flying, ...(saved !== undefined ? { saved } : {}), ...(rejected ? { rejected } : {}) },
			// The presenter normally closes the game; this covers it being closed.
			expired: s.status === 'playing' && now > endsAt + GRACE_MS
		};
	});

	if (expired) await finish(db, code).catch((err) => console.error('[flappy] finish', err));
	return view;
}
