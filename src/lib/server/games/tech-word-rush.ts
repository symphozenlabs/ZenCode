import { error, isHttpError, json } from '@sveltejs/kit';
import { createHash, randomBytes, randomInt, timingSafeEqual } from 'node:crypto';
import {
	collection,
	doc,
	getDoc,
	getDocs,
	increment,
	runTransaction,
	updateDoc,
	writeBatch,
	type DocumentSnapshot,
	type Firestore
} from 'firebase/firestore';
import { adminDb } from '$lib/server/admin-session';
import {
	MAX_GUESSES,
	applyGuess,
	applyHint,
	applySkip,
	freshQuestion,
	isValidWord,
	rankPlayers,
	settle,
	type Outcome,
	type QuestionState,
	type RankInput
} from '$lib/games/tech-word-rush/engine';
import {
	CATEGORIES,
	DEFAULT_QUESTIONS,
	DIFFICULTIES,
	QUESTIONS_PER_GAME,
	pickQuestions,
	type WordQuestion
} from '$lib/games/tech-word-rush/questions';
import {
	GAME_TYPE,
	QUESTIONS_COLLECTION,
	SESSIONS,
	type ControlAction,
	type LiveSession,
	type PlayAction,
	type PlayerDoc,
	type PlayerView,
	type QuestionStats
} from '$lib/games/tech-word-rush/types';

const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'; // no I, L, O, 0, 1
const CODE_PATTERN = /^ZC[A-Z2-9]{4}$/;
const MAX_PLAYERS = 300;
const NAME_MAX = 20;
/** Network allowance after the timer reaches zero. */
const GRACE_MS = 1500;
export const DURATIONS = [30, 45, 60, 90] as const;

// Every write goes through the server's organiser session (see admin-session.ts).
const sessionRef = (db: Firestore, code: string) => doc(db, SESSIONS, code);
const secretRef = (db: Firestore, code: string) => doc(db, SESSIONS, code, 'secret', 'questions');
const playerRef = (db: Firestore, code: string, id: string) => doc(db, SESSIONS, code, 'players', id);
const stateRef = (db: Firestore, code: string, id: string) => doc(db, SESSIONS, code, 'playerState', id);

interface PrivateState {
	tokenHash: string;
	q: QuestionState | null;
}

const sha256 = (s: string) => createHash('sha256').update(s).digest('hex');

/** Wrap a request handler: HTTP errors pass through, anything else becomes a plain message. */
export async function handle(fn: () => Promise<unknown>) {
	try {
		return json(await fn());
	} catch (err) {
		if (isHttpError(err)) return json({ message: err.body.message }, { status: err.status });
		console.error('[tech-word-rush]', err);
		return json({ message: 'Something went wrong. Please try again.' }, { status: 500 });
	}
}

export function parseCode(raw: string | undefined): string {
	const code = (raw ?? '').trim().toUpperCase();
	if (!CODE_PATTERN.test(code)) error(404, 'That game code does not exist.');
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

// ── Questions ────────────────────────────────────────────────────────────

function toQuestion(id: string, d: Record<string, unknown>): WordQuestion | null {
	const word = typeof d.word === 'string' ? d.word.trim().toUpperCase() : '';
	const description = typeof d.description === 'string' ? d.description.trim() : '';
	if (!isValidWord(word) || !description || description.toUpperCase().includes(word)) return null;
	const category = CATEGORIES.includes(d.category as never) ? (d.category as WordQuestion['category']) : 'Programming';
	const difficulty = DIFFICULTIES.includes(d.difficulty as never) ? (d.difficulty as WordQuestion['difficulty']) : 'medium';
	return { id, word, description, category, difficulty };
}

/** The selected words never change during a session, so cache them per instance. */
const wordCache = new Map<string, WordQuestion[]>();

async function sessionWords(db: Firestore, code: string): Promise<WordQuestion[]> {
	const hit = wordCache.get(code);
	if (hit) return hit;
	const snap = await getDoc(secretRef(db, code));
	const items = (snap.data()?.items ?? []) as WordQuestion[];
	if (!items.length) error(404, 'This game has no questions.');
	if (wordCache.size > 200) wordCache.clear();
	wordCache.set(code, items);
	return items;
}

// ── Sessions (admin) ─────────────────────────────────────────────────────

function newCode() {
	let s = 'ZC';
	for (let i = 0; i < 4; i++) s += CODE_ALPHABET[randomInt(CODE_ALPHABET.length)];
	return s;
}

export async function createSession(createdBy: string, duration: number): Promise<{ code: string; source: string }> {
	if (!DURATIONS.includes(duration as never)) error(400, 'Choose a valid time per word.');
	const db = await adminDb();
	const stored = (await getDocs(collection(db, QUESTIONS_COLLECTION))).docs
		.map((d) => toQuestion(d.id, d.data()))
		.filter((q): q is WordQuestion => !!q);
	const items = pickQuestions(stored, DEFAULT_QUESTIONS);
	if (items.length < QUESTIONS_PER_GAME) error(500, 'Not enough questions to start a game.');
	const source = stored.length >= QUESTIONS_PER_GAME ? 'bank' : stored.length ? 'bank+default' : 'default';

	for (let attempt = 0; attempt < 6; attempt++) {
		const code = newCode();
		const now = Date.now();
		const session: LiveSession = {
			code,
			gameType: GAME_TYPE,
			status: 'lobby',
			createdAt: now,
			createdBy,
			startedAt: null,
			endedAt: null,
			questionIndex: -1,
			totalQuestions: items.length,
			duration,
			current: null,
			timerEndsAt: null,
			answer: null,
			playerCount: 0,
			lastStats: null,
			leaderboard: [],
			winner: null
		};
		const created = await runTransaction(db, async (tx) => {
			if ((await tx.get(sessionRef(db, code))).exists()) return false; // code taken → try another
			tx.set(sessionRef(db, code), session);
			tx.set(secretRef(db, code), { items });
			return true;
		});
		if (created) {
			wordCache.set(code, items);
			return { code, source };
		}
	}
	error(500, 'Could not create a game code. Please try again.');
}

const sessionData = (snap: DocumentSnapshot) => {
	if (!snap.exists()) error(404, 'This game session no longer exists.');
	return snap.data() as LiveSession;
};

/**
 * Runs once the answer is public: judge every player's guesses for the current
 * word, pay out XP, then recompute rankings and stats. Settled players are
 * skipped, so a retry never pays twice.
 */
async function settleAndRank(db: Firestore, code: string, finished: boolean) {
	const [sessionSnap, playersSnap, statesSnap] = await Promise.all([
		getDoc(sessionRef(db, code)),
		getDocs(collection(db, SESSIONS, code, 'players')),
		getDocs(collection(db, SESSIONS, code, 'playerState'))
	]);
	const s = sessionData(sessionSnap);
	const players = new Map(playersSnap.docs.map((d) => [d.id, { id: d.id, ...(d.data() as PlayerDoc) }]));

	if (s.questionIndex >= 0) {
		const word = (await sessionWords(db, code))[s.questionIndex].word;
		const writes: { id: string; q: QuestionState }[] = [];
		for (const d of statesSnap.docs) {
			const q = (d.data() as PrivateState).q;
			if (q && q.index === s.questionIndex && q.status === 'playing' && players.has(d.id)) writes.push({ id: d.id, q: settle(word, q) });
		}
		// 2 writes per player; Firestore batches hold 500.
		for (let i = 0; i < writes.length; i += 200) {
			const batch = writeBatch(db);
			for (const { id, q } of writes.slice(i, i + 200)) {
				const p = players.get(id)!;
				const summary = { index: q.index, status: q.status, hintsUsed: q.hintsUsed, guesses: q.guesses.length };
				batch.update(stateRef(db, code, id), { q });
				batch.update(playerRef(db, code, id), {
					xp: increment(q.earned),
					correct: increment(q.status === 'correct' ? 1 : 0),
					failed: increment(q.status === 'failed' ? 1 : 0),
					q: summary
				});
				players.set(id, {
					...p,
					xp: p.xp + q.earned,
					correct: p.correct + (q.status === 'correct' ? 1 : 0),
					failed: p.failed + (q.status === 'failed' ? 1 : 0),
					q: summary
				});
			}
			await batch.commit();
		}
	}

	const all = [...players.values()];
	const leaderboard = rankPlayers(
		all.map((p): RankInput => ({ id: p.id, name: p.name, xp: p.xp, correct: p.correct, joinedAt: p.joinedAt })),
		s.leaderboard
	).slice(0, 500);
	const onCurrent = all.filter((p) => p.q?.index === s.questionIndex);
	const lastStats: QuestionStats = {
		players: all.length,
		correct: onCurrent.filter((p) => p.q?.status === 'correct').length,
		failed: onCurrent.filter((p) => p.q?.status === 'failed').length,
		skipped: onCurrent.filter((p) => p.q?.status === 'skipped').length
	};
	const update: Partial<LiveSession> & { ranking: boolean } = { leaderboard, lastStats, ranking: false };
	if (finished) update.winner = leaderboard[0] ? { name: leaderboard[0].name, xp: leaderboard[0].xp } : null;
	await updateDoc(sessionRef(db, code), update);
}

export async function control(code: string, action: ControlAction): Promise<{ now: number }> {
	const actions: ControlAction[] = ['sync', 'start', 'next', 'end', 'leaderboard', 'finish'];
	if (!actions.includes(action)) error(400, 'Unknown action.');
	const db = await adminDb();
	if (action === 'sync') {
		sessionData(await getDoc(sessionRef(db, code)));
		return { now: Date.now() };
	}
	const words = await sessionWords(db, code);

	const rank = await runTransaction(db, async (tx) => {
		const ref = sessionRef(db, code);
		const s = sessionData(await tx.get(ref));
		const now = Date.now();

		const goTo = (index: number) => {
			const w = words[index];
			tx.update(ref, {
				status: 'question',
				questionIndex: index,
				current: {
					index,
					description: w.description,
					category: w.category,
					difficulty: w.difficulty,
					length: w.word.length,
					first: w.word[0],
					last: w.word[w.word.length - 1]
				},
				answer: null,
				timerEndsAt: now + s.duration * 1000,
				startedAt: s.startedAt ?? now
			});
		};

		switch (action) {
			case 'start':
				if (s.status !== 'lobby') return false; // already started — idempotent
				goTo(0);
				return false;
			case 'next': {
				if (s.status === 'lobby' || s.status === 'finished') error(409, 'The game is not in progress.');
				if (s.status === 'question') error(409, 'Reveal the answer first.'); // guesses are scored on reveal
				const next = s.questionIndex + 1;
				if (next >= s.totalQuestions) error(409, 'That was the last word. Show the final results.');
				goTo(next);
				return false;
			}
			case 'end':
				if (s.status !== 'question') return false;
				tx.update(ref, { status: 'result', answer: words[s.questionIndex].word, timerEndsAt: null, ranking: true });
				return true;
			case 'leaderboard':
				if (s.status === 'leaderboard') return false;
				if (s.status !== 'result') error(409, 'Reveal the answer first.');
				tx.update(ref, { status: 'leaderboard' });
				return false;
			case 'finish':
				if (s.status === 'finished') return false;
				tx.update(ref, {
					status: 'finished',
					endedAt: now,
					timerEndsAt: null,
					answer: s.questionIndex >= 0 ? words[s.questionIndex].word : null,
					ranking: true
				});
				return true;
		}
		return false;
	});

	// Settled after the status change commits: any guess still in flight is
	// retried against the new status and rejected, so none is missed.
	if (rank) await settleAndRank(db, code, action === 'finish');
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
	return name;
}

export async function join(code: string, rawName: unknown) {
	const name = cleanName(rawName);
	const db = await adminDb();
	const sRef = sessionRef(db, code);
	const s = sessionData(await getDoc(sRef));
	if (s.status === 'finished') error(410, 'This game has ended.');
	if (s.playerCount >= MAX_PLAYERS) error(409, 'This game is full.');

	const id = doc(collection(db, SESSIONS, code, 'players')).id;
	const token = randomBytes(24).toString('base64url');
	const nameRef = doc(db, SESSIONS, code, 'names', sha256(name.toLowerCase()));
	const now = Date.now();

	await runTransaction(db, async (tx) => {
		if ((await tx.get(nameRef)).exists()) error(409, 'That name is already taken in this game. Try another.');
		const player: PlayerDoc = { name, joinedAt: now, xp: 0, correct: 0, failed: 0, skipped: 0, hintsUsed: 0, q: null };
		const state: PrivateState = { tokenHash: sha256(token), q: null };
		tx.set(nameRef, { playerId: id });
		tx.set(playerRef(db, code, id), player);
		tx.set(stateRef(db, code, id), state);
		tx.update(sRef, { playerCount: increment(1) });
	});
	return { playerId: id, token, name, now: Date.now() };
}

const REJECTIONS: Record<string, string> = {
	'not-active': 'Answers are closed for this word.',
	done: "You've finished this word.",
	'no-letters': 'There are no hidden letters left.',
	'insufficient-xp': 'You need at least 50 XP for another hint.',
	empty: 'Type an answer first.',
	duplicate: 'You already tried that word.',
	'no-guesses': `You've used all ${MAX_GUESSES} guesses.`,
	'has-guesses': "You've already guessed — wait for the reveal.",
	stale: ''
};

export async function play(code: string, body: Record<string, unknown>): Promise<PlayerView> {
	const playerId = typeof body.playerId === 'string' ? body.playerId : '';
	const token = typeof body.token === 'string' ? body.token : '';
	const action = body.action as PlayAction;
	if (!playerId || !/^[A-Za-z0-9]{10,40}$/.test(playerId) || !token) error(401, 'Join the game first.');
	if (!['state', 'hint', 'answer', 'skip'].includes(action)) error(400, 'Unknown action.');
	const expect = Number.isInteger(body.expect) ? (body.expect as number) : -1;
	const db = await adminDb();
	const words = await sessionWords(db, code);

	return runTransaction(db, async (tx) => {
		const [sSnap, stSnap, pSnap] = await Promise.all([
			tx.get(sessionRef(db, code)),
			tx.get(stateRef(db, code, playerId)),
			tx.get(playerRef(db, code, playerId))
		]);
		const s = sessionData(sSnap);
		const st = stSnap.data() as PrivateState | undefined;
		const p = pSnap.data() as PlayerDoc | undefined;
		const given = Buffer.from(sha256(token));
		const stored = Buffer.from(st?.tokenHash ?? '');
		if (!st || !p || given.length !== stored.length || !timingSafeEqual(given, stored)) {
			error(401, 'This device is no longer in the game. Join again.');
		}

		const now = Date.now();
		const idx = s.questionIndex;
		const word = idx >= 0 ? words[idx].word : '';
		const active = s.status === 'question' && s.timerEndsAt !== null && now <= s.timerEndsAt + GRACE_MS;
		let q = idx >= 0 ? (st.q && st.q.index === idx ? st.q : freshQuestion(idx)) : null;
		let xp = p.xp;
		let result: PlayerView['result'];
		let rejected: string | undefined;

		if (action !== 'state') {
			if (!q) {
				rejected = REJECTIONS['not-active'];
			} else {
				let out: Outcome;
				if (action === 'hint') out = applyHint(word, q, xp, active, expect);
				else if (action === 'skip') out = applySkip(q, xp, active);
				else out = applyGuess(q, xp, active, String(body.answer ?? '').slice(0, 60), expect);

				if (!out.ok) {
					rejected = REJECTIONS[out.reason] || undefined;
				} else {
					const next = out.q;
					result = action === 'hint' ? 'hint' : action === 'skip' ? 'skipped' : 'guess';
					tx.update(stateRef(db, code, playerId), { q: next });
					// Correct/failed are only counted when the answer is revealed.
					tx.update(playerRef(db, code, playerId), {
						xp: out.totalXp,
						q: { index: next.index, status: next.status, hintsUsed: next.hintsUsed, guesses: next.guesses.length },
						skipped: increment(result === 'skipped' ? 1 : 0),
						hintsUsed: increment(result === 'hint' ? 1 : 0)
					});
					q = next;
					xp = out.totalXp;
				}
			}
		}

		// Nothing about correctness leaves the server until the answer is public.
		const ended = s.status === 'result' || s.status === 'leaderboard' || s.status === 'finished';
		const shown = q && ended ? settle(word, q) : q;
		return {
			now,
			xp,
			q: shown && {
				index: shown.index,
				status: shown.status,
				hintsUsed: shown.hintsUsed,
				guesses: shown.guesses.map((g) => (ended ? { ...g, correct: g.text === word } : g)),
				reward: shown.reward,
				earned: shown.earned,
				revealed: Object.fromEntries(shown.revealed.map((i) => [i, word[i]]))
			},
			answer: q && ended ? word : null,
			...(rejected ? { rejected } : {}),
			...(result ? { result } : {})
		};
	});
}
