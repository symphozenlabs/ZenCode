/**
 * Tech Word Rush rules — pure functions with no I/O.
 *
 * The server (src/lib/server/games/tech-word-rush.ts) is the only place these
 * are applied to real scores; the participant UI imports them read-only to
 * explain *why* a control is disabled. Keep this file import-free so it can be
 * unit-tested with plain Node (`npm run test:games`).
 */

export const BASE_REWARD = 100;
/** Each of the first FREE_HINTS hints lowers the question reward by this much. */
export const REWARD_STEP = 50;
export const FREE_HINTS = 2;
/** Every hint after FREE_HINTS costs this much from the accumulated total. */
export const PAID_HINT_COST = 50;
/** Guesses per word. Players get no feedback until the host reveals the answer. */
export const MAX_GUESSES = 3;

export const WORD_PATTERN = /^[A-Z]{3,20}$/;

/**
 * `playing` until the host reveals the answer (guesses are only judged then).
 * `missed` = the word ended with no guesses and no skip.
 */
export type QuestionStatus = 'playing' | 'correct' | 'failed' | 'skipped' | 'missed';

/** A submitted guess and the reward it locked in when it was sent. */
export interface Guess {
	text: string;
	reward: number;
}

/** One participant's progress on one question. */
export interface QuestionState {
	index: number;
	/** Revealed middle positions, in reveal order. */
	revealed: number[];
	hintsUsed: number;
	guesses: Guess[];
	status: QuestionStatus;
	/** XP a guess sent now would pay if it turns out correct. */
	reward: number;
	/** XP actually earned on this question (set when the answer is revealed). */
	earned: number;
}

export type HintBlock = 'not-active' | 'done' | 'no-letters' | 'insufficient-xp';
export type Rejection = HintBlock | 'empty' | 'stale' | 'duplicate' | 'no-guesses' | 'has-guesses';

export function freshQuestion(index: number): QuestionState {
	return { index, revealed: [], hintsUsed: 0, guesses: [], status: 'playing', reward: BASE_REWARD, earned: 0 };
}

export const normalizeAnswer = (s: string) => s.trim().toUpperCase();

export const isValidWord = (w: string) => WORD_PATTERN.test(w);

/** Reward left on the question after `hintsUsed` hints. Never below 0. */
export const rewardAfter = (hintsUsed: number) => Math.max(0, BASE_REWARD - REWARD_STEP * Math.min(hintsUsed, FREE_HINTS));

/** XP taken from the total for the *next* hint, given hints already used. */
export const nextHintCost = (hintsUsed: number) => (hintsUsed >= FREE_HINTS ? PAID_HINT_COST : 0);

/** Middle positions (never the first or last letter) not yet revealed. */
export function hiddenPositions(word: string, revealed: readonly number[]): number[] {
	const out: number[] = [];
	for (let i = 1; i < word.length - 1; i++) if (!revealed.includes(i)) out.push(i);
	return out;
}

/** Letters to display: first, last and revealed positions; null = hidden box. */
export function maskWord(word: string, revealed: readonly number[]): (string | null)[] {
	return [...word].map((ch, i) => (i === 0 || i === word.length - 1 || revealed.includes(i) ? ch : null));
}

/** Why a hint is not allowed right now, or null when it is. */
export function hintBlock(word: string, q: QuestionState, totalXp: number, active: boolean): HintBlock | null {
	if (!active) return 'not-active';
	if (q.status !== 'playing' || q.guesses.length >= MAX_GUESSES) return 'done';
	if (hiddenPositions(word, q.revealed).length === 0) return 'no-letters';
	if (totalXp < nextHintCost(q.hintsUsed)) return 'insufficient-xp';
	return null;
}

export type Outcome =
	| { ok: true; q: QuestionState; totalXp: number }
	| { ok: false; reason: Rejection };

/**
 * Reveal exactly one hidden middle letter.
 * `expectHints` is the hint count the client saw; a mismatch means a duplicate
 * or stale request and nothing changes (makes double-clicks idempotent).
 */
export function applyHint(
	word: string,
	q: QuestionState,
	totalXp: number,
	active: boolean,
	expectHints: number,
	random: () => number = Math.random
): Outcome & { position?: number } {
	if (expectHints !== q.hintsUsed) return { ok: false, reason: 'stale' };
	const block = hintBlock(word, q, totalXp, active);
	if (block) return { ok: false, reason: block };
	const hidden = hiddenPositions(word, q.revealed);
	const position = hidden[Math.min(hidden.length - 1, Math.floor(random() * hidden.length))];
	const hintsUsed = q.hintsUsed + 1;
	return {
		ok: true,
		position,
		totalXp: totalXp - nextHintCost(q.hintsUsed),
		q: { ...q, revealed: [...q.revealed, position], hintsUsed, reward: rewardAfter(hintsUsed) }
	};
}

/**
 * Record a guess without judging it — nobody learns if it's right until the
 * host reveals the answer (see `settle`). The guess keeps the reward that was
 * on offer when it was sent. `expectGuesses` is the guess count the client
 * saw, so a repeated submit is ignored instead of counted twice.
 */
export function applyGuess(
	q: QuestionState,
	totalXp: number,
	active: boolean,
	answer: string,
	expectGuesses: number
): Outcome {
	if (!active) return { ok: false, reason: 'not-active' };
	if (q.status !== 'playing') return { ok: false, reason: 'done' };
	if (expectGuesses !== q.guesses.length) return { ok: false, reason: 'stale' };
	if (q.guesses.length >= MAX_GUESSES) return { ok: false, reason: 'no-guesses' };
	const text = normalizeAnswer(answer);
	if (!text) return { ok: false, reason: 'empty' };
	if (q.guesses.some((g) => g.text === text)) return { ok: false, reason: 'duplicate' };
	return { ok: true, totalXp, q: { ...q, guesses: [...q.guesses, { text, reward: q.reward }] } };
}

/** Give up on the word before guessing: 0 XP, spent XP is not refunded. */
export function applySkip(q: QuestionState, totalXp: number, active: boolean): Outcome {
	if (!active) return { ok: false, reason: 'not-active' };
	if (q.status !== 'playing') return { ok: false, reason: 'done' };
	if (q.guesses.length) return { ok: false, reason: 'has-guesses' };
	return { ok: true, totalXp, q: { ...q, status: 'skipped', reward: 0 } };
}

/**
 * Judge a player's guesses once the answer is revealed. The first correct
 * guess pays the reward it locked in. Already-settled states are returned as is.
 */
export function settle(word: string, q: QuestionState): QuestionState {
	if (q.status !== 'playing') return q;
	const hit = q.guesses.find((g) => g.text === word);
	if (hit) return { ...q, status: 'correct', earned: hit.reward };
	return { ...q, status: q.guesses.length ? 'failed' : 'missed', reward: 0, earned: 0 };
}

export interface RankInput {
	id: string;
	name: string;
	xp: number;
	correct: number;
	joinedAt: number;
}
export interface RankEntry {
	id: string;
	name: string;
	xp: number;
	correct: number;
	rank: number;
	/** Rank on the previous leaderboard, null if not ranked before. */
	prevRank: number | null;
}

/**
 * Standard competition ranking (1, 2, 2, 4) by XP. Ties are listed by more
 * correct answers, then earliest join, but share the same rank number.
 */
export function rankPlayers(players: readonly RankInput[], previous: readonly RankEntry[] = []): RankEntry[] {
	const prev = new Map(previous.map((e) => [e.id, e.rank]));
	const sorted = [...players].sort((a, b) => b.xp - a.xp || b.correct - a.correct || a.joinedAt - b.joinedAt);
	let rank = 0;
	return sorted.map((p, i) => {
		if (i === 0 || p.xp !== sorted[i - 1].xp) rank = i + 1;
		return { id: p.id, name: p.name, xp: p.xp, correct: p.correct, rank, prevRank: prev.get(p.id) ?? null };
	});
}

/** Hint button copy shared by the participant UI. */
export function hintLabel(q: Pick<QuestionState, 'hintsUsed'>, block: HintBlock | null): string {
	if (block === 'no-letters') return 'No letters left';
	if (block === 'insufficient-xp') return `Need ${PAID_HINT_COST} XP`;
	if (q.hintsUsed >= FREE_HINTS) return `Hint · −${PAID_HINT_COST} XP`;
	return `Hint · reward ${rewardAfter(q.hintsUsed + 1)}`;
}
