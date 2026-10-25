import { IDLE_MS, type DrawPlayer, type DrawRankEntry, type DrawSession, type WordOption } from './types';
import type { Difficulty, WordEntry } from './words';

/**
 * Scribble Showdown rules, shared by the server (which referees) and the
 * screens (which show what the server will do). No I/O here.
 */

/** Harder words pay the guessers and the artist more. */
export const MULTIPLIER: Record<Difficulty, number> = { easy: 1, medium: 1.25, hard: 1.5 };
/** Extra points for the first, second and third to guess a turn. */
export const ORDER_BONUS = [50, 30, 15] as const;
/** Each turn in a row guessed right adds 10%, up to +50%. */
export const STREAK_STEP = 0.1;
export const STREAK_CAP = 5;
/** The artist's bonus when every player guessed. */
export const MASTERPIECE_BONUS = 100;
export const GUESS_MAX = 40;

/** Compare guesses on letters and digits only: "Ice-Cream" = "icecream" = "ice cream". */
export const normalizeGuess = (s: string) =>
	s
		.toLowerCase()
		.normalize('NFKD')
		.replace(/[̀-ͯ]/g, '')
		.replace(/[^a-z0-9]/g, '');

export const isCorrect = (guess: string, word: string) => {
	const g = normalizeGuess(guess);
	return g.length > 0 && g === normalizeGuess(word);
};

/** Levenshtein distance, giving up (returning max + 1) once it passes `max`. */
export function editDistance(a: string, b: string, max = 3): number {
	if (Math.abs(a.length - b.length) > max) return max + 1;
	let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
	for (let i = 1; i <= a.length; i++) {
		const row = [i];
		let best = i;
		for (let j = 1; j <= b.length; j++) {
			row[j] = Math.min(prev[j] + 1, row[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
			best = Math.min(best, row[j]);
		}
		if (best > max) return max + 1;
		prev = row;
	}
	return prev[b.length];
}

/** One letter off (two for long words) — told privately, never shown to the room. */
export function isClose(guess: string, word: string): boolean {
	const g = normalizeGuess(guess);
	const w = normalizeGuess(word);
	if (w.length < 4 || g === w) return false;
	const allowed = w.length >= 8 ? 2 : 1;
	return editDistance(g, w, allowed) <= allowed;
}

// ── The word on screen ─────────────────────────────────────────────────────

/** `_` for every hidden letter; spaces stay, revealed positions show their letter. */
export const maskOf = (word: string, revealed: readonly number[] = []) =>
	[...word].map((ch, i) => (ch === ' ' || revealed.includes(i) ? ch : '_')).join('');

const letterCount = (mask: string) => mask.replace(/ /g, '').length;

/** How many letters are given away over a turn: never most of a short word. */
export const hintCount = (letters: number) => (letters <= 3 ? 0 : letters <= 5 ? 1 : letters <= 8 ? 2 : 3);

const HINT_AT: Record<number, number[]> = { 0: [], 1: [0.6], 2: [0.5, 0.75], 3: [0.4, 0.6, 0.8] };

/** Server times at which each hint letter appears. */
export function hintTimes(startedAt: number, drawSeconds: number, mask: string): number[] {
	return HINT_AT[hintCount(letterCount(mask))].map((f) => startedAt + Math.round(f * drawSeconds * 1000));
}

/** A hidden letter position to give away, or null if none is left. */
export function pickHint(word: string, revealed: readonly number[], rand: () => number = Math.random): number | null {
	const hidden = [...word].flatMap((ch, i) => (ch !== ' ' && !revealed.includes(i) ? [i] : []));
	return hidden.length ? hidden[Math.floor(rand() * hidden.length)] : null;
}

/**
 * When the session next needs the server to act (pick timed out, a hint is
 * due, drawing ends, the reveal is over). Every screen nudges the server at
 * this time; the server checks the clock itself.
 */
export function dueAt(s: Pick<DrawSession, 'status' | 'phaseStartedAt' | 'phaseEndsAt' | 'drawSeconds' | 'mask' | 'hintsShown' | 'inked' | 'scoring'>): number | null {
	if (s.status === 'choosing') return s.phaseEndsAt;
	if (s.status === 'reveal') return s.scoring ? null : s.phaseEndsAt;
	if (s.status !== 'drawing' || s.phaseStartedAt === null || s.phaseEndsAt === null || !s.mask) return null;
	const times = [s.phaseEndsAt];
	const hint = hintTimes(s.phaseStartedAt, s.drawSeconds, s.mask)[s.hintsShown];
	if (hint !== undefined) times.push(hint);
	if (!s.inked) times.push(s.phaseStartedAt + IDLE_MS);
	return Math.min(...times);
}

// ── Points ────────────────────────────────────────────────────────────────

export const streakMultiplier = (streak: number) => 1 + STREAK_STEP * Math.min(Math.max(streak, 0), STREAK_CAP);

/**
 * A correct guess: 100–300 by how much time was left, times the word's
 * difficulty, times the streak the player brings into this turn.
 */
export function guessPoints(remainingMs: number, totalMs: number, difficulty: Difficulty, streak: number): number {
	const left = totalMs > 0 ? Math.min(1, Math.max(0, remainingMs / totalMs)) : 0;
	return Math.round((100 + 200 * left) * MULTIPLIER[difficulty] * streakMultiplier(streak));
}

/** The artist: 80–300 by the share of players who guessed, times difficulty. Nothing if nobody did. */
export function drawerPoints(guessed: number, eligible: number, difficulty: Difficulty): number {
	if (guessed <= 0) return 0;
	const share = Math.min(1, guessed / Math.max(1, eligible));
	return Math.round((80 + 220 * share) * MULTIPLIER[difficulty]);
}

export const isMasterpiece = (guessed: number, eligible: number) => eligible >= 2 && guessed >= eligible;

// ── Turns ─────────────────────────────────────────────────────────────────

/**
 * The next artist: someone who hasn't drawn this cycle (earliest joined
 * first, so the order is fair and predictable). Once everyone has drawn a
 * new cycle starts, never with the artist who just went.
 */
export function pickDrawer(
	players: readonly { id: string; joinedAt: number }[],
	drawnIds: readonly string[],
	lastDrawerId: string | null
): { id: string; drawnIds: string[] } | null {
	if (players.length < 2) return null;
	const byJoin = [...players].sort((a, b) => a.joinedAt - b.joinedAt);
	const fresh = byJoin.find((p) => !drawnIds.includes(p.id));
	if (fresh) return { id: fresh.id, drawnIds: [...drawnIds, fresh.id] };
	const next = byJoin.find((p) => p.id !== lastDrawerId)!;
	return { id: next.id, drawnIds: [next.id] };
}

/** Three words to choose from — one of each difficulty where the pool allows — none used before. */
export function pickOptions(pool: readonly WordEntry[], used: readonly string[], rand: () => number = Math.random): WordOption[] {
	const usedSet = new Set(used);
	let left = pool.filter((e) => !usedSet.has(e.w));
	if (left.length < 3) left = [...pool]; // the pool ran dry: allow repeats
	const take = (list: WordEntry[]) => list.splice(Math.floor(rand() * list.length), 1)[0];
	const out: WordEntry[] = [];
	for (const d of ['easy', 'medium', 'hard'] as const) {
		const bucket = left.filter((e) => e.d === d);
		if (bucket.length) {
			const e = take(bucket);
			out.push(e);
			left = left.filter((x) => x !== e);
		}
	}
	while (out.length < 3 && left.length) out.push(take(left));
	const order: Record<Difficulty, number> = { easy: 0, medium: 1, hard: 2 };
	return out.sort((a, b) => order[a.d] - order[b.d]).map((e) => ({ word: e.w, difficulty: e.d }));
}

/**
 * Standard competition ranking (1, 2, 2, 4) by score. Ties share a rank and
 * are listed by more correct guesses, then who joined first.
 */
export function rankPlayers(players: readonly (DrawPlayer & { id: string })[], previous: readonly DrawRankEntry[] = []): DrawRankEntry[] {
	const prev = new Map(previous.map((e) => [e.id, e.rank]));
	const sorted = [...players].sort((a, b) => b.score - a.score || b.guessed - a.guessed || a.joinedAt - b.joinedAt);
	let rank = 0;
	return sorted.map((p, i) => {
		if (i === 0 || p.score !== sorted[i - 1].score) rank = i + 1;
		return { id: p.id, name: p.name, score: p.score, rank, prevRank: prev.get(p.id) ?? null };
	});
}
