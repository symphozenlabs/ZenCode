import { error, isHttpError, json } from '@sveltejs/kit';
import { createHash, randomBytes, randomInt, timingSafeEqual } from 'node:crypto';
import {
	arrayUnion,
	collection,
	doc,
	getCountFromServer,
	getDoc,
	getDocs,
	increment,
	query,
	runTransaction,
	setDoc,
	updateDoc,
	where,
	writeBatch,
	type DocumentSnapshot,
	type Firestore
} from 'firebase/firestore';
import { adminDb, writerDb } from '$lib/server/admin-session';
import { withLock } from '$lib/server/lock';
import { hasProfanity } from '$lib/server/live/profanity';
import { sanitizeOps } from '$lib/games/scribble/board';
import {
	GUESS_MAX,
	MASTERPIECE_BONUS,
	ORDER_BONUS,
	dueAt,
	drawerPoints,
	guessPoints,
	hintTimes,
	isClose,
	isCorrect,
	isMasterpiece,
	maskOf,
	pickDrawer,
	pickHint,
	pickOptions,
	rankPlayers
} from '$lib/games/scribble/engine';
import { buildPool, isPackId, parseCustomWords, type Difficulty, type PackId, type WordEntry } from '$lib/games/scribble/words';
import {
	AWAY_MS,
	CHOOSE_MS,
	CODE_RE,
	DRAW_SECONDS,
	GAME_TYPE,
	IDLE_MS,
	OFFLINE_MS,
	REVEAL_MS,
	TURN_COUNTS,
	type DrawAction,
	type DrawControl,
	type DrawPlayer,
	type DrawSession,
	type DrawStatus,
	type DrawView,
	type EndReason,
	type GuessDoc,
	type TurnDoc,
	type WordOption
} from '$lib/games/scribble/types';
import { SESSIONS } from '$lib/games/tech-word-rush/types';
import { ROOM_JOIN_MESSAGE, type SeatedPlayer, type TournamentTag } from '$lib/games/tournament/types';

const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'; // no I, L, O, 0, 1
const MAX_PLAYERS = 300;
const NAME_MAX = 20;
const MIN_POOL = 10;
const LEADERBOARD_MAX = 100;
/** Wait after a turn ends before counting guesses, so ones already checked have landed. */
const SETTLE_MS = 1200;
/** Scoring that hasn't finished this long after it started was cut off: score again. */
const SCORING_LEASE_MS = 20_000;
/** A picked word is still accepted this long after the picking clock ran out. */
const CHOOSE_GRACE_MS = 1500;
/** Strokes in flight when the turn ends still land, so the reveal shows the whole drawing. */
const DRAW_GRACE_MS = 2500;
/** Fastest one player may guess. */
const GUESS_GAP_MS = 600;

const sessionRef = (db: Firestore, code: string) => doc(db, SESSIONS, code);
const playerRef = (db: Firestore, code: string, id: string) => doc(db, SESSIONS, code, 'players', id);
const stateRef = (db: Firestore, code: string, id: string) => doc(db, SESSIONS, code, 'playerState', id);
const wordsRef = (db: Firestore, code: string) => doc(db, SESSIONS, code, 'secret', 'words');
const secretTurnRef = (db: Firestore, code: string) => doc(db, SESSIONS, code, 'secret', 'turn');
const turnRef = (db: Firestore, code: string, turn: number) => doc(db, SESSIONS, code, 'turns', String(turn));
const guessesCol = (db: Firestore, code: string, turn: number) => collection(db, SESSIONS, code, 'turns', String(turn), 'guesses');

interface PrivateState {
	tokenHash: string;
	/** Last heartbeat from the player's phone (see sweepOffline). */
	lastSeen?: number;
	/** The last turn this player guessed right. */
	guessedTurn?: number;
	lastGuessAt?: number;
}

interface SecretWords {
	pool: WordEntry[];
	used: string[];
}

interface SecretTurn {
	turn: number;
	drawerId: string;
	options: WordOption[];
	word: string | null;
	difficulty: Difficulty | null;
	revealed: number[];
}

const sha256 = (s: string) => createHash('sha256').update(s).digest('hex');
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Wrap a request handler: HTTP errors pass through, anything else becomes a plain message. */
export async function handle(fn: () => Promise<unknown>) {
	try {
		return json(await fn());
	} catch (err) {
		if (isHttpError(err)) return json({ message: err.body.message }, { status: err.status });
		console.error('[scribble]', err);
		// The game writes under liveSessions/{code}/turns, which older rules don't allow.
		if ((err as { code?: string })?.code === 'permission-denied') {
			return json({ message: 'The game’s database rules are out of date. Ask the organiser to deploy firestore.rules.' }, { status: 503 });
		}
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
	const s = snap.data() as DrawSession | undefined;
	if (!snap.exists() || s?.gameType !== GAME_TYPE) error(404, 'This game session no longer exists.');
	return s;
};

async function listPlayers(db: Firestore, code: string) {
	const snap = await getDocs(collection(db, SESSIONS, code, 'players'));
	return snap.docs.map((d) => ({ id: d.id, ...(d.data() as DrawPlayer) }));
}

const countPlayers = async (db: Firestore, code: string) =>
	(await getCountFromServer(collection(db, SESSIONS, code, 'players'))).data().count;

/** The current word, once picked. It never changes within a turn, so it is cached per instance. */
const wordCache = new Map<string, string>();

async function currentWord(db: Firestore, code: string, turn: number): Promise<string | null> {
	const key = `${code}/${turn}`;
	const hit = wordCache.get(key);
	if (hit) return hit;
	const secret = (await getDoc(secretTurnRef(db, code))).data() as SecretTurn | undefined;
	if (secret?.turn !== turn || !secret.word) return null;
	if (wordCache.size > 500) wordCache.clear();
	wordCache.set(key, secret.word);
	return secret.word;
}

// ── Sessions (admin) ─────────────────────────────────────────────────────

function newCode() {
	let s = 'ZD';
	for (let i = 0; i < 4; i++) s += CODE_ALPHABET[randomInt(CODE_ALPHABET.length)];
	return s;
}

/** The host's settings for a game, checked (400 with a plain message if wrong). Also used by tournaments. */
export function parseDrawSettings(body: Record<string, unknown>) {
	const drawSeconds = Number(body.drawSeconds);
	const turns = Number(body.turns);
	if (!DRAW_SECONDS.includes(drawSeconds as never)) error(400, 'Choose a valid drawing time.');
	if (!TURN_COUNTS.includes(turns as never)) error(400, 'Choose how many turns to play.');
	const packs: PackId[] = [...new Set(Array.isArray(body.packs) ? body.packs.filter(isPackId) : [])];
	const customText = typeof body.custom === 'string' ? body.custom.slice(0, 8000) : '';
	const custom = parseCustomWords(customText);
	const pool = buildPool(packs, custom);
	if (pool.length < MIN_POOL) error(400, `Pick a word pack, or add at least ${MIN_POOL} words of your own.`);
	return { drawSeconds, turns, packs, custom, customText, pool };
}

/**
 * A tournament seats its players in this session: the same ids and device
 * tokens as in the tournament, so their phones carry straight on without
 * joining again. Nobody else can join a tagged session. Scribble's own rules
 * still apply: a phone that never checks in is removed when the game starts.
 */
export async function seedTournament(db: Firestore, code: string, tag: TournamentTag, members: readonly SeatedPlayer[]) {
	const now = Date.now();
	for (let i = 0; i < members.length; i += 120) {
		const batch = writeBatch(db); // 3 writes a player, under Firestore's 500
		for (const m of members.slice(i, i + 120)) {
			const player: DrawPlayer = { name: m.name, joinedAt: m.joinedAt, score: 0, streak: 0, guessed: 0, drew: 0 };
			batch.set(playerRef(db, code, m.id), player);
			batch.set(stateRef(db, code, m.id), { tokenHash: m.tokenHash, lastSeen: now } satisfies PrivateState);
			batch.set(doc(db, SESSIONS, code, 'names', sha256(m.name.toLowerCase())), { playerId: m.id });
		}
		await batch.commit();
	}
	await updateDoc(sessionRef(db, code), { tournament: tag, playerCount: members.length });
}

export async function createSession(createdBy: string, body: Record<string, unknown>): Promise<{ code: string }> {
	const { drawSeconds, turns, packs, custom, pool } = parseDrawSettings(body);

	const db = await adminDb();
	for (let attempt = 0; attempt < 6; attempt++) {
		const code = newCode();
		const session: DrawSession = {
			code,
			gameType: GAME_TYPE,
			status: 'lobby',
			createdAt: Date.now(),
			createdBy,
			startedAt: null,
			endedAt: null,
			drawSeconds,
			totalTurns: turns,
			packs,
			customCount: custom.length,
			playerCount: 0,
			turn: 0,
			drawCount: 0,
			drawerId: null,
			drawerName: null,
			difficulty: null,
			mask: null,
			phaseStartedAt: null,
			phaseEndsAt: null,
			inked: false,
			hintsShown: 0,
			eligible: 0,
			drawnIds: [],
			reveal: null,
			leaderboard: [],
			winner: null
		};
		const created = await runTransaction(db, async (tx) => {
			if ((await tx.get(sessionRef(db, code))).exists()) return false; // code taken → try another
			tx.set(sessionRef(db, code), session);
			tx.set(wordsRef(db, code), { pool, used: [] } satisfies SecretWords);
			return true;
		});
		if (created) return { code };
	}
	error(500, 'Could not create a game code. Please try again.');
}

/** Hand the pencil to the next artist, or end the game when every turn has been drawn. */
async function beginTurn(db: Firestore, code: string, expect: { status: DrawStatus; turn: number }) {
	// Never hand the pencil to someone who has left.
	await sweepOffline(db, code, { force: true }).catch((err) => console.error('[scribble] sweep', err));
	const [players, s] = await Promise.all([listPlayers(db, code), getDoc(sessionRef(db, code)).then(sessionData)]);
	if (s.status !== expect.status || s.turn !== expect.turn) return; // someone else moved it on
	const fromLobby = s.status === 'lobby';
	// Turns nobody picked a word for don't count, but can't go on forever.
	if (!fromLobby && (s.drawCount >= s.totalTurns || s.turn - (s.firstTurn ?? s.turn) >= s.totalTurns * 2 + 4)) return finishGame(db, code);
	const pick = pickDrawer(players, s.drawnIds, s.drawerId);
	if (!pick) {
		if (fromLobby) error(409, 'Wait for at least two players to join.');
		return finishGame(db, code);
	}
	const drawer = players.find((p) => p.id === pick.id)!;
	const words = (await getDoc(wordsRef(db, code))).data() as SecretWords | undefined;
	const options = pickOptions(words?.pool ?? [], words?.used ?? []);
	if (options.length === 0) error(500, 'This game has no words.');

	await runTransaction(db, async (tx) => {
		const cur = sessionData(await tx.get(sessionRef(db, code)));
		if (cur.status !== expect.status || cur.turn !== expect.turn) return;
		const now = Date.now();
		const turn = cur.turn + 1;
		tx.set(secretTurnRef(db, code), { turn, drawerId: drawer.id, options, word: null, difficulty: null, revealed: [] } satisfies SecretTurn);
		tx.update(sessionRef(db, code), {
			status: 'choosing',
			turn,
			drawerId: drawer.id,
			drawerName: drawer.name,
			difficulty: null,
			mask: null,
			phaseStartedAt: now,
			phaseEndsAt: now + CHOOSE_MS,
			inked: false,
			hintsShown: 0,
			drawnIds: pick.drawnIds,
			playerCount: players.length,
			...(fromLobby ? { startedAt: now, firstTurn: turn } : {})
		});
	});
}

async function finishGame(db: Firestore, code: string) {
	await runTransaction(db, async (tx) => {
		const s = sessionData(await tx.get(sessionRef(db, code)));
		if (s.status === 'finished') return;
		const top = s.leaderboard[0];
		tx.update(sessionRef(db, code), {
			status: 'finished',
			endedAt: Date.now(),
			phaseEndsAt: null,
			winner: top && top.score > 0 ? { name: top.name, score: top.score } : null
		});
	});
}

type Step = { kind: 'none' } | { kind: 'score'; turn: number } | { kind: 'next'; turn: number } | { kind: 'finish' };
const NONE: Step = { kind: 'none' };

/** Requests in this instance already moving a session on; later ones wait for it instead of piling up. */
const advancing = new Map<string, Promise<void>>();

/**
 * Move the session on if the clock (or the host) says so: the pick timed
 * out, a hint letter is due, the turn is over, or the reveal is done. Safe to
 * call any number of times — anything not yet due is left alone.
 */
function advance(
	db: Firestore,
	code: string,
	opts: { skip?: boolean; finish?: boolean; allGuessed?: number; offline?: boolean } = {}
): Promise<void> {
	const forced = opts.skip || opts.finish || opts.offline || opts.allGuessed !== undefined;
	const running = advancing.get(code);
	if (running && !forced) return running;
	const run = (async () => {
		if (!forced) {
			// Cheap check first: most nudges arrive when there is nothing to do.
			const s = sessionData(await getDoc(sessionRef(db, code)));
			const due = dueAt(s);
			const stuck = s.scoring && Date.now() - (s.scoringAt ?? 0) >= SCORING_LEASE_MS;
			if (!stuck && (due === null || Date.now() < due)) return;
		}
		const step = await runTransaction(db, async (tx): Promise<Step> => {
			const s = sessionData(await tx.get(sessionRef(db, code)));
			const secretSnap = s.status === 'drawing' ? await tx.get(secretTurnRef(db, code)) : null;
			const now = Date.now();
			const ref = sessionRef(db, code);

			if (s.status === 'finished') return NONE;
			if (s.status === 'lobby') {
				if (opts.finish) tx.update(ref, { status: 'finished', endedAt: now });
				return NONE;
			}

			if (s.status === 'choosing') {
				if (opts.finish) return { kind: 'finish' };
				if (!opts.skip && !opts.offline && now < (s.phaseEndsAt ?? 0)) return NONE;
				tx.update(ref, {
					status: 'reveal',
					mask: null,
					phaseStartedAt: now,
					phaseEndsAt: now + AWAY_MS,
					reveal: {
						turn: s.turn,
						word: null,
						drawerId: s.drawerId ?? '',
						drawerName: s.drawerName ?? '',
						difficulty: null,
						reason: opts.skip ? 'host' : opts.offline ? 'offline' : 'away',
						guessed: 0,
						eligible: 0,
						drawerPoints: 0,
						masterpiece: false,
						gains: []
					}
				});
				return NONE;
			}

			if (s.status === 'drawing') {
				const secret = secretSnap?.data() as SecretTurn | undefined;
				const word = secret?.turn === s.turn ? secret.word : null;
				if (!word) return NONE;
				const started = s.phaseStartedAt ?? now;
				const ends = s.phaseEndsAt ?? now;
				const idle = !s.inked && now >= Math.min(started + IDLE_MS, ends);
				const reason: EndReason | null =
					opts.finish || opts.skip
						? 'host'
						: opts.offline
							? 'offline'
							: opts.allGuessed === s.turn
								? 'all'
								: idle
									? 'idle'
									: now >= ends
										? 'time'
										: null;
				if (reason) {
					tx.update(ref, {
						status: opts.finish ? 'finished' : 'reveal',
						...(opts.finish ? { endedAt: now } : {}),
						mask: word,
						phaseStartedAt: now,
						phaseEndsAt: now + SETTLE_MS + REVEAL_MS,
						reveal: {
							turn: s.turn,
							word,
							drawerId: s.drawerId ?? '',
							drawerName: s.drawerName ?? '',
							difficulty: s.difficulty,
							reason,
							guessed: 0,
							eligible: s.eligible,
							drawerPoints: 0,
							masterpiece: false,
							gains: []
						},
						scoring: true,
						scoringAt: now
					});
					return { kind: 'score', turn: s.turn };
				}
				const hintAt = hintTimes(started, s.drawSeconds, s.mask ?? '')[s.hintsShown];
				if (hintAt !== undefined && now >= hintAt) {
					const revealed = [...(secret?.revealed ?? [])];
					const pos = pickHint(word, revealed);
					if (pos !== null) revealed.push(pos);
					tx.update(secretTurnRef(db, code), { revealed });
					tx.update(ref, { mask: maskOf(word, revealed), hintsShown: s.hintsShown + 1 });
				}
				return NONE;
			}

			// reveal
			if (s.scoring && now - (s.scoringAt ?? 0) < SCORING_LEASE_MS) {
				if (opts.finish) tx.update(ref, { status: 'finished', endedAt: now });
				return NONE;
			}
			if (s.scoring) {
				// The request scoring this turn was cut off. Scoring again can't pay twice.
				tx.update(ref, { scoringAt: now, ...(opts.finish ? { status: 'finished', endedAt: now } : {}) });
				return { kind: 'score', turn: s.turn };
			}
			if (opts.finish) return { kind: 'finish' };
			if (!opts.skip && now < (s.phaseEndsAt ?? 0)) return NONE;
			return { kind: 'next', turn: s.turn };
		});

		if (step.kind === 'score') await scoreTurn(db, code, step.turn);
		else if (step.kind === 'next') await beginTurn(db, code, { status: 'reveal', turn: step.turn });
		else if (step.kind === 'finish') await finishGame(db, code);
	})();
	if (!forced) {
		advancing.set(code, run);
		run.finally(() => advancing.get(code) === run && advancing.delete(code)).catch(() => {});
	}
	return run;
}

/**
 * Add up a finished turn: each guesser's points plus the bonus for guessing
 * first, second or third, the artist's share, streaks — then the leaderboard.
 * The points are written in one batch together with the turn's `scored`
 * mark, so scoring a turn again never pays twice.
 */
async function scoreTurn(db: Firestore, code: string, turn: number) {
	await sleep(SETTLE_MS);
	const [sSnap, tSnap, gSnap, players] = await Promise.all([
		getDoc(sessionRef(db, code)),
		getDoc(turnRef(db, code, turn)),
		getDocs(query(guessesCol(db, code, turn), where('ok', '==', true))),
		listPlayers(db, code)
	]);
	const s = sessionData(sSnap);
	if (s.turn !== turn || !s.scoring || !s.reveal) return; // restarted, or already done

	const firsts = new Map<string, GuessDoc>();
	for (const g of gSnap.docs.map((d) => d.data() as GuessDoc).sort((a, b) => a.at - b.at)) {
		if (g.pid !== s.drawerId && !firsts.has(g.pid)) firsts.set(g.pid, g);
	}
	const order = [...firsts.values()];
	const difficulty = s.reveal.difficulty ?? 'easy';
	const eligible = Math.max(order.length, s.eligible, 1);
	const masterpiece = isMasterpiece(order.length, eligible);
	const drawn = s.reveal.reason !== 'idle' && s.reveal.reason !== 'offline';
	const dPts = drawn ? drawerPoints(order.length, eligible, difficulty) + (masterpiece ? MASTERPIECE_BONUS : 0) : 0;
	const gains = order.map((g, i) => {
		const bonus = ORDER_BONUS[i] ?? 0;
		return { id: g.pid, name: g.name, points: (g.pts ?? 0) + bonus, bonus };
	});

	if (!(tSnap.data() as TurnDoc | undefined)?.scored) {
		const gainById = new Map(gains.map((g) => [g.id, g.points]));
		const w = await writerDb();
		const batch = writeBatch(w);
		for (const p of players) {
			const gain = gainById.get(p.id);
			if (gain !== undefined) {
				batch.update(playerRef(w, code, p.id), { score: increment(gain), streak: increment(1), guessed: increment(1) });
				p.score += gain;
				p.streak += 1;
				p.guessed += 1;
			} else if (p.id === s.drawerId) {
				batch.update(playerRef(w, code, p.id), { score: increment(dPts), drew: increment(1) });
				p.score += dPts;
				p.drew += 1;
			} else if (p.streak > 0) {
				batch.update(playerRef(w, code, p.id), { streak: 0 });
				p.streak = 0;
			}
		}
		batch.set(doc(w, turnRef(db, code, turn).path), { word: s.reveal.word ?? '', guessed: order.length, scored: true }, { merge: true });
		await batch.commit();
	}

	const leaderboard = rankPlayers(players, s.leaderboard).slice(0, LEADERBOARD_MAX);
	const top = leaderboard[0];
	await runTransaction(db, async (tx) => {
		const cur = sessionData(await tx.get(sessionRef(db, code)));
		if (cur.turn !== turn || !cur.scoring || !cur.reveal) return;
		tx.update(sessionRef(db, code), {
			reveal: { ...cur.reveal, guessed: order.length, eligible, drawerPoints: dPts, masterpiece, gains: gains.slice(0, 40) },
			leaderboard,
			playerCount: players.length,
			winner: top && top.score > 0 ? { name: top.name, score: top.score } : null,
			scoring: false,
			// The reveal runs its full length from when the points appear.
			...(cur.status === 'reveal' ? { phaseEndsAt: Date.now() + REVEAL_MS } : {})
		});
	});
}

/**
 * Back to the lobby on the same code: the QR on screen and every phone stay
 * valid, players keep their names, and all scores start again from zero.
 * `turn` keeps growing, so the old drawings stay apart from the new ones.
 */
async function restart(db: Firestore, code: string) {
	await runTransaction(db, async (tx) => {
		sessionData(await tx.get(sessionRef(db, code)));
		tx.update(sessionRef(db, code), {
			status: 'lobby',
			startedAt: null,
			endedAt: null,
			drawCount: 0,
			drawerId: null,
			drawerName: null,
			difficulty: null,
			mask: null,
			phaseStartedAt: null,
			phaseEndsAt: null,
			inked: false,
			hintsShown: 0,
			eligible: 0,
			drawnIds: [],
			reveal: null,
			leaderboard: [],
			winner: null,
			scoring: false,
			kicked: null,
			resets: increment(1)
		});
	});
	const players = await getDocs(collection(db, SESSIONS, code, 'players'));
	const cleared: Partial<DrawPlayer> = { score: 0, streak: 0, guessed: 0, drew: 0 };
	for (let i = 0; i < players.docs.length; i += 450) {
		const batch = writeBatch(db);
		for (const d of players.docs.slice(i, i + 450)) batch.update(d.ref, cleared);
		await batch.commit();
	}
	await updateDoc(sessionRef(db, code), { playerCount: players.size });
}

export async function control(code: string, action: DrawControl): Promise<{ now: number }> {
	if (!['sync', 'start', 'advance', 'skip', 'finish', 'restart', 'sweep'].includes(action)) error(400, 'Unknown action.');
	const db = await adminDb();
	if (action === 'sync') {
		sessionData(await getDoc(sessionRef(db, code)));
	} else if (action === 'start') {
		const s = sessionData(await getDoc(sessionRef(db, code)));
		if (s.status === 'lobby') await beginTurn(db, code, { status: 'lobby', turn: s.turn });
	} else if (action === 'restart') {
		await restart(db, code);
	} else if (action === 'sweep') {
		await sweepOffline(db, code);
	} else {
		await advance(db, code, { skip: action === 'skip', finish: action === 'finish' });
	}
	return { now: Date.now() };
}

// ── Participants ─────────────────────────────────────────────────────────

function cleanName(raw: unknown): string {
	const name = (typeof raw === 'string' ? raw : '')
		.replace(/[\u0000-\u001f\u007f<>]/g, '')
		.replace(/\s+/g, ' ')
		.trim();
	if (!name) error(400, 'Enter a display name.');
	if (name.length > NAME_MAX) error(400, `Keep your name under ${NAME_MAX} characters.`);
	if (hasProfanity(name)) error(400, 'Pick a different name.');
	return name;
}

export async function join(code: string, rawName: unknown) {
	const name = cleanName(rawName);
	const db = await adminDb();
	const s = sessionData(await getDoc(sessionRef(db, code)));
	if (s.status === 'finished') error(410, 'This game has ended.');
	if (s.tournament) error(403, ROOM_JOIN_MESSAGE);
	// Counted rather than kept on the session doc: a join must not write the
	// doc every phone is listening to (see flappy.ts).
	if ((await countPlayers(db, code)) >= MAX_PLAYERS) error(409, 'This game is full.');

	const id = doc(collection(db, SESSIONS, code, 'players')).id;
	const token = randomBytes(24).toString('base64url');
	const nameRef = doc(db, SESSIONS, code, 'names', sha256(name.toLowerCase()));

	await withLock(`${code}/name/${nameRef.id}`, async () => {
		if ((await getDoc(nameRef)).exists()) error(409, 'That name is already taken in this game. Try another.');
		const player: DrawPlayer = { name, joinedAt: Date.now(), score: 0, streak: 0, guessed: 0, drew: 0 };
		const state: PrivateState = { tokenHash: sha256(token), lastSeen: Date.now() };
		const w = await writerDb();
		const batch = writeBatch(w);
		batch.set(doc(w, nameRef.path), { playerId: id });
		batch.set(playerRef(w, code, id), player);
		batch.set(stateRef(w, code, id), state);
		await batch.commit();
	});
	return { playerId: id, token, name, now: Date.now() };
}

/** Device tokens already checked in this instance: the artist sends strokes several times a second. */
const trusted = new Set<string>();

function tokenMatches(token: string, st: PrivateState | undefined) {
	const given = Buffer.from(sha256(token));
	const stored = Buffer.from(st?.tokenHash ?? '');
	return !!st && given.length === stored.length && timingSafeEqual(given, stored);
}

async function checkToken(db: Firestore, code: string, playerId: string, token: string) {
	const key = `${code}/${playerId}/${sha256(token)}`;
	if (trusted.has(key)) return;
	const st = (await getDoc(stateRef(db, code, playerId))).data() as PrivateState | undefined;
	if (!tokenMatches(token, st)) error(401, 'This device is no longer in the game. Join again.');
	if (trusted.size > 5000) trusted.clear();
	trusted.add(key);
}

async function load(db: Firestore, code: string, playerId: string, token: string) {
	const [sSnap, stSnap, pSnap] = await Promise.all([getDoc(sessionRef(db, code)), getDoc(stateRef(db, code, playerId)), getDoc(playerRef(db, code, playerId))]);
	const s = sessionData(sSnap);
	const st = stSnap.data() as PrivateState | undefined;
	const p = pSnap.data() as DrawPlayer | undefined;
	if (!st || !p || !tokenMatches(token, st)) error(401, 'This device is no longer in the game. Join again.');
	return { s, st, p };
}

async function viewFor(db: Firestore, code: string, playerId: string, s: DrawSession, p: DrawPlayer, st: PrivateState): Promise<DrawView> {
	const isDrawer = s.drawerId === playerId && (s.status === 'choosing' || s.status === 'drawing');
	const view: DrawView = { now: Date.now(), status: s.status, turn: s.turn, score: p.score, streak: p.streak, isDrawer, guessed: st.guessedTurn === s.turn };
	if (isDrawer && s.status === 'choosing') {
		const secret = (await getDoc(secretTurnRef(db, code))).data() as SecretTurn | undefined;
		if (secret?.turn === s.turn) view.options = secret.options;
	} else if ((isDrawer || view.guessed) && s.status === 'drawing') {
		view.word = (await currentWord(db, code, s.turn)) ?? undefined;
	}
	return view;
}

function readIdentity(body: Record<string, unknown>) {
	const playerId = typeof body.playerId === 'string' ? body.playerId : '';
	const token = typeof body.token === 'string' ? body.token : '';
	if (!playerId || !/^[A-Za-z0-9]{10,40}$/.test(playerId) || !token) error(401, 'Join the game first.');
	return { playerId, token };
}

export async function play(code: string, body: Record<string, unknown>): Promise<DrawView | { now: number; closed?: boolean }> {
	const { playerId, token } = readIdentity(body);
	const action = body.action as DrawAction;
	if (!['state', 'choose', 'draw', 'guess', 'advance', 'ping'].includes(action)) error(400, 'Unknown action.');
	const db = await adminDb();

	if (action === 'draw') return draw(db, code, playerId, token, body);
	if (action === 'ping') return ping(db, code, playerId, token);

	if (action === 'advance') {
		await checkToken(db, code, playerId, token);
		await advance(db, code).catch((err) => console.error('[scribble] advance', err));
		const { s, st, p } = await load(db, code, playerId, token);
		return viewFor(db, code, playerId, s, p, st);
	}

	if (action === 'choose') {
		await choose(db, code, playerId, token, body);
		const { s, st, p } = await load(db, code, playerId, token);
		return viewFor(db, code, playerId, s, p, st);
	}

	if (action === 'state') {
		const { s, st, p } = await load(db, code, playerId, token);
		return viewFor(db, code, playerId, s, p, st);
	}

	// guess — one at a time per player, so the rate limit and "already guessed" hold.
	const result = await withLock(`${code}/${playerId}`, () => guess(db, code, playerId, token, body));
	if (result.result === 'correct' && result.eligible > 0) {
		// Everyone has it: end the turn now rather than waiting out the clock.
		const got = (await getCountFromServer(query(guessesCol(db, code, result.turn), where('ok', '==', true)))).data().count;
		if (got >= result.eligible) await advance(db, code, { allGuessed: result.turn }).catch((err) => console.error('[scribble] all guessed', err));
	}
	return result.view;
}

async function choose(db: Firestore, code: string, playerId: string, token: string, body: Record<string, unknown>) {
	await checkToken(db, code, playerId, token);
	const index = Number(body.index);
	const turn = Number(body.turn);
	if (!Number.isInteger(index) || index < 0 || index > 2 || !Number.isInteger(turn)) error(400, 'Pick one of the three words.');
	const players = await countPlayers(db, code);
	const problem = await runTransaction(db, async (tx) => {
		const s = sessionData(await tx.get(sessionRef(db, code)));
		const secret = (await tx.get(secretTurnRef(db, code))).data() as SecretTurn | undefined;
		if (s.status !== 'choosing' || s.turn !== turn || s.drawerId !== playerId) return 'Too late — this turn has moved on.';
		const now = Date.now();
		if (now > (s.phaseEndsAt ?? 0) + CHOOSE_GRACE_MS) return 'Time ran out to pick a word.';
		const opt = secret?.turn === turn ? secret.options[index] : undefined;
		if (!opt) return 'Pick one of the three words.';
		tx.update(secretTurnRef(db, code), { word: opt.word, difficulty: opt.difficulty, revealed: [] });
		tx.update(wordsRef(db, code), { used: arrayUnion(opt.word) });
		tx.set(turnRef(db, code, turn), {
			turn,
			drawerId: playerId,
			drawerName: s.drawerName ?? '',
			difficulty: opt.difficulty,
			startedAt: now
		} satisfies TurnDoc);
		tx.update(sessionRef(db, code), {
			status: 'drawing',
			difficulty: opt.difficulty,
			mask: maskOf(opt.word),
			phaseStartedAt: now,
			phaseEndsAt: now + s.drawSeconds * 1000,
			inked: false,
			hintsShown: 0,
			eligible: Math.max(1, players - 1),
			drawCount: s.drawCount + 1,
			playerCount: players
		});
		return null;
	});
	if (problem) error(409, problem);
}

async function guess(db: Firestore, code: string, playerId: string, token: string, body: Record<string, unknown>) {
	const { s, st, p } = await load(db, code, playerId, token);
	const base = await viewFor(db, code, playerId, s, p, st);
	const out = (view: DrawView) => ({ view, result: view.result, turn: s.turn, eligible: s.eligible });
	const text = (typeof body.text === 'string' ? body.text : '')
		.replace(/[\u0000-\u001f\u007f<>]/g, '')
		.replace(/\s+/g, ' ')
		.trim()
		.slice(0, GUESS_MAX);
	if (!text) error(400, 'Type a guess first.');

	const now = Date.now();
	if (s.status !== 'drawing' || now >= (s.phaseEndsAt ?? 0)) return out({ ...base, rejected: 'Guessing is closed for this turn.' });
	if (s.drawerId === playerId) return out({ ...base, rejected: 'You’re the artist — no guessing!' });
	if (base.guessed) return out({ ...base, rejected: 'You already got this one.' });
	if (st.lastGuessAt && now - st.lastGuessAt < GUESS_GAP_MS) return out({ ...base, rejected: 'Easy — one guess at a time.' });
	const word = await currentWord(db, code, s.turn);
	if (!word) return out({ ...base, rejected: 'Guessing is closed for this turn.' });

	const w = await writerDb();
	const gRef = doc(guessesCol(w, code, s.turn));
	if (isCorrect(text, word)) {
		const points = guessPoints((s.phaseEndsAt ?? now) - now, s.drawSeconds * 1000, s.difficulty ?? 'easy', p.streak);
		await Promise.all([
			setDoc(gRef, { pid: playerId, name: p.name, at: now, ok: true, pts: points, streak: p.streak + 1 } satisfies GuessDoc),
			updateDoc(stateRef(w, code, playerId), { guessedTurn: s.turn, lastGuessAt: now })
		]);
		return out({ ...base, guessed: true, word, result: 'correct', points, now: Date.now() });
	}
	const close = isClose(text, word);
	// Near misses are told privately, never shown to the room; neither is anything rude.
	const shown = !close && !hasProfanity(text);
	const writes: Promise<void>[] = [updateDoc(stateRef(w, code, playerId), { lastGuessAt: now })];
	if (close || shown) writes.push(setDoc(gRef, { pid: playerId, name: p.name, at: now, ok: false, close, text: shown ? text : null } satisfies GuessDoc));
	await Promise.all(writes);
	return out({ ...base, result: close ? 'close' : 'wrong', now: Date.now() });
}

async function draw(db: Firestore, code: string, playerId: string, token: string, body: Record<string, unknown>) {
	const turn = Number(body.turn);
	const seq = Number(body.seq);
	if (!Number.isInteger(turn) || !Number.isInteger(seq) || seq < 0 || seq > 1_000_000) error(400, 'Invalid drawing.');
	const ops = sanitizeOps(body.ops);
	if (!ops) error(400, 'Invalid drawing.');
	await checkToken(db, code, playerId, token);
	const s = sessionData(await getDoc(sessionRef(db, code)));
	const now = Date.now();
	const open = s.status === 'drawing' || (s.status === 'reveal' && now < (s.phaseStartedAt ?? 0) + DRAW_GRACE_MS);
	if (s.turn !== turn || s.drawerId !== playerId || !open) return { now, closed: true };
	const w = await writerDb();
	// The sequence number orders the chunks; the suffix keeps a resend after a reload from overwriting one.
	const id = `${String(seq).padStart(7, '0')}-${randomBytes(3).toString('hex')}`;
	const writes = [setDoc(doc(w, SESSIONS, code, 'turns', String(turn), 'strokes', id), { seq, ops, at: now })];
	if (!s.inked && s.status === 'drawing') writes.push(updateDoc(sessionRef(w, code), { inked: true }));
	await Promise.all(writes);
	return { now: Date.now() };
}

// ── Presence ─────────────────────────────────────────────────────────────

/**
 * The phone's heartbeat. It only touches the player's private state doc, so
 * a room full of phones never wakes the session doc everyone listens to.
 */
async function ping(db: Firestore, code: string, playerId: string, token: string) {
	await checkToken(db, code, playerId, token);
	const w = await writerDb();
	try {
		await updateDoc(stateRef(w, code, playerId), { lastSeen: Date.now() });
	} catch (err) {
		// Removed for going offline while this phone was asleep.
		if ((err as { code?: string })?.code === 'not-found') error(401, 'You were removed from the game. Join again.');
		throw err;
	}
	return { now: Date.now() };
}

/** Sessions swept recently in this instance; the big screen asks every 20 seconds. */
const lastSweep = new Map<string, number>();
const SWEEP_GAP_MS = 10_000;

/**
 * Remove players whose phone hasn't checked in for OFFLINE_MS: their player
 * doc, name and device token go, so they drop off the board and the next
 * artist is picked from people still here (and can rejoin with the same
 * name). If the artist was one of them the turn ends now; if everyone left
 * has already guessed, so does that.
 */
async function sweepOffline(db: Firestore, code: string, opts: { force?: boolean } = {}) {
	const now = Date.now();
	if (!opts.force && now - (lastSweep.get(code) ?? 0) < SWEEP_GAP_MS) return;
	lastSweep.set(code, now);
	if (lastSweep.size > 500) lastSweep.clear();

	const [s, states, players] = await Promise.all([
		getDoc(sessionRef(db, code)).then(sessionData),
		getDocs(collection(db, SESSIONS, code, 'playerState')),
		listPlayers(db, code)
	]);
	// Not while points are being added: those writes expect every player doc to exist.
	if (s.status === 'finished' || s.scoring) return;
	const gone = new Set(
		states.docs
			.filter((d) => {
				const seen = (d.data() as PrivateState).lastSeen;
				return typeof seen === 'number' && now - seen > OFFLINE_MS;
			})
			.map((d) => d.id)
	);
	if (!gone.size) return;

	const byId = new Map(players.map((p) => [p.id, p]));
	const ids = [...gone];
	const w = await writerDb();
	for (let i = 0; i < ids.length; i += 150) {
		// Three deletes each, under Firestore's 500 writes per batch.
		const batch = writeBatch(w);
		for (const id of ids.slice(i, i + 150)) {
			batch.delete(stateRef(w, code, id));
			batch.delete(playerRef(w, code, id));
			const p = byId.get(id);
			if (p) batch.delete(doc(w, SESSIONS, code, 'names', sha256(p.name.toLowerCase())));
		}
		await batch.commit();
	}
	for (const key of trusted) if (gone.has(key.split('/')[1])) trusted.delete(key);

	const names = ids.flatMap((id) => (byId.has(id) ? [byId.get(id)!.name] : []));
	const left = players.filter((p) => !gone.has(p.id)).length;
	const drawing = s.status === 'drawing';
	const eligible = Math.max(1, left - 1);
	await updateDoc(sessionRef(w, code), {
		playerCount: left,
		...(names.length ? { kicked: { names: names.slice(0, 20), count: names.length, at: now } } : {}),
		...(drawing ? { eligible } : {})
	});

	const artistLeft = !!s.drawerId && gone.has(s.drawerId) && (s.status === 'choosing' || drawing);
	if (artistLeft) {
		await advance(db, code, { offline: true });
	} else if (drawing) {
		const got = (await getCountFromServer(query(guessesCol(db, code, s.turn), where('ok', '==', true)))).data().count;
		if (got >= eligible) await advance(db, code, { allGuessed: s.turn });
	}
}
