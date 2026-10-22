import {
	FEED_SIZE,
	STARTERS_PER_PLAYER,
	type Board,
	type BoardWord,
	type CutoffTie,
	type FeedEntry,
	type HeistRules,
	type MoveKind,
	type MoveResult,
	type PlayerScore,
	type RankEntry,
	type RoomResult
} from './types';

/**
 * Word Heist rules. Pure: the server runs these inside a Firestore
 * transaction on the room's board, and the tests run them directly. The
 * browser only uses the letter helpers (to show which letters are still
 * needed) — every decision is made on the server.
 */

// ── Words and letters ────────────────────────────────────────────────────

/** A–Z only, upper case. Accents are stripped; anything else is rejected (null). */
export function normalizeWord(raw: unknown): string | null {
	if (typeof raw !== 'string') return null;
	const w = raw
		.normalize('NFKD')
		.replace(/[̀-ͯ]/g, '')
		.trim()
		.toUpperCase();
	return /^[A-Z]{1,40}$/.test(w) ? w : null;
}

export function letterCounts(word: string): Map<string, number> {
	const m = new Map<string, number>();
	for (const c of word) m.set(c, (m.get(c) ?? 0) + 1);
	return m;
}

/**
 * Compare a candidate with a source word. `missing`: source letters the
 * candidate doesn't keep (repeats counted). `added`: letters beyond the source.
 */
export function letterDiff(source: string, candidate: string): { missing: string[]; added: string[] } {
	const need = letterCounts(source);
	const added: string[] = [];
	for (const c of candidate) {
		const n = need.get(c) ?? 0;
		if (n > 0) need.set(c, n - 1);
		else added.push(c);
	}
	const missing: string[] = [];
	for (const [c, n] of need) for (let i = 0; i < n; i++) missing.push(c);
	return { missing, added };
}

const VOWELS = new Set(['A', 'E', 'I', 'O', 'U']);

/**
 * Regular English plural spellings of a noun (conservative). Irregular
 * plurals (MAN → MEN, MOUSE → MICE) drop a source letter, so they already
 * fail as steals.
 */
export function pluralForms(word: string): string[] {
	const w = word.toUpperCase();
	const forms = new Set<string>();
	if (/(S|X|Z|CH|SH)$/.test(w)) forms.add(w + 'ES');
	else forms.add(w + 'S');
	if (w.endsWith('Y') && w.length > 1 && !VOWELS.has(w[w.length - 2])) forms.add(w.slice(0, -1) + 'IES');
	if (w.endsWith('O')) forms.add(w + 'ES');
	if (w.endsWith('F')) forms.add(w.slice(0, -1) + 'VES');
	if (w.endsWith('FE')) forms.add(w.slice(0, -2) + 'VES');
	return [...forms];
}

/**
 * True when `candidate` is just the plural of `source`: it must be one of the
 * source's regular plural spellings AND be a dictionary word. This rejects
 * CAT → CATS, BOX → BOXES and BERRY → BERRIES, but not every word ending in
 * S: CAT → ACTS is a real rearrangement and is allowed.
 */
export function isPluralOf(source: string, candidate: string, isWord: (w: string) => boolean): boolean {
	return pluralForms(source).includes(candidate) && isWord(candidate);
}

// ── Moves ────────────────────────────────────────────────────────────────

export interface MoveDeps {
	isWord: (w: string) => boolean;
	/** Plain-language reason when a word is blocked, else null. */
	moderate: (w: string) => string | null;
	/** Optional screen of the raw input (disguised words), run before normalising. */
	screen?: (raw: string) => string | null;
}

export interface MoveRequest {
	requestId: string;
	playerId: string;
	kind: 'create' | 'steal';
	text: string;
	/** steal: id of the word on the board being taken. */
	sourceId?: string;
}

export const REQUESTS_KEPT = 300;

/** Checks that don't need the board (done before a transaction is opened). */
export function precheck(kind: 'create' | 'steal', raw: unknown, rules: HeistRules, deps: MoveDeps): { word: string } | { message: string } {
	const screened = typeof raw === 'string' ? deps.screen?.(raw.slice(0, 60)) : null;
	if (screened) return { message: screened };
	const word = normalizeWord(raw);
	if (!word) return { message: 'Use letters A–Z only.' };
	if (word.length < rules.minWordLength) return { message: `Words need at least ${rules.minWordLength} letters.` };
	if (kind === 'create' && word.length > rules.maxCreateLength) {
		return { message: `New words can be at most ${rules.maxCreateLength} letters — steal a word to go longer.` };
	}
	if (word.length > rules.maxWordLength) return { message: `Words can be at most ${rules.maxWordLength} letters.` };
	const blocked = deps.moderate(word);
	if (blocked) return { message: blocked };
	if (!deps.isWord(word)) return { message: `${word} isn't in the dictionary.` };
	return { word };
}

const clone = (b: Board): Board => structuredClone(b);

function longestOwned(words: Record<string, BoardWord>, owner: string) {
	let n = 0;
	for (const w of Object.values(words)) if (w.owner === owner && w.text.length > n) n = w.text.length;
	return n;
}

const reject = (message: string): { board: null; result: MoveResult } => ({ board: null, result: { ok: false, message } });

/**
 * Apply one move to a board. Returns the new board (null when nothing
 * changed) and the outcome. Never mutates its input.
 *
 * Ownership and score change together: a steal removes the source word and its
 * points from the previous owner and adds the new word and its points to the
 * thief, in the same document write.
 */
export function applyMove(board: Board, move: MoveRequest, now: number, deps: MoveDeps): { board: Board | null; result: MoveResult } {
	const seen = board.requests[move.requestId];
	if (seen) return { board: null, result: { ok: seen.ok, message: seen.message, duplicate: true } };

	if (board.status === 'paused') return reject('The round is paused.');
	if (board.status !== 'playing' || board.endsAt === null || now >= board.endsAt) return reject('The round is not in progress.');
	const me = board.players[move.playerId];
	if (!me || me.removed) return reject("You're not playing in this room.");

	const pre = precheck(move.kind, move.text, board.rules, deps);
	if ('message' in pre) return reject(pre.message);
	const word = pre.word;

	const active = Object.values(board.words);
	if (active.some((w) => w.text === word)) return reject(`${word} is already on the board.`);

	let kind: MoveKind = 'create';
	let source: BoardWord | undefined;
	if (move.kind === 'steal') {
		source = move.sourceId ? board.words[move.sourceId] : undefined;
		if (!source) return reject('That word just changed hands — pick it again.');
		if (isPluralOf(source.text, word, deps.isWord)) return reject(`${word} is just the plural of ${source.text}.`);
		const { missing, added } = letterDiff(source.text, word);
		if (missing.length) return reject(`Keep every letter of ${source.text} (missing ${missing.join(', ')}).`);
		if (!added.length) return reject(`Add at least one letter to ${source.text}.`);
		kind = source.owner === move.playerId ? 'extend' : 'steal';
	}

	const next = clone(board);
	next.seq += 1;
	const seq = next.seq;
	const victimId = source && kind === 'steal' ? source.owner : undefined;

	if (source && move.sourceId) delete next.words[move.sourceId];
	next.words[`w${seq}`] = { text: word, owner: move.playerId, at: now, ...(source ? { from: source.text } : {}) };

	const mine = next.players[move.playerId];
	const gained = word.length - (kind === 'extend' && source ? source.text.length : 0);
	mine.score += gained;
	mine.lastScoreAt = now;
	if (kind === 'steal') mine.steals += 1;
	mine.longest = longestOwned(next.words, move.playerId);

	if (victimId && source) {
		const victim = next.players[victimId];
		if (victim) {
			victim.score -= source.text.length;
			victim.lastScoreAt = now;
			victim.longest = longestOwned(next.words, victimId);
		}
	}

	const entry: FeedEntry = {
		seq,
		kind,
		by: move.playerId,
		byName: mine.name,
		text: word,
		at: now,
		...(source ? { from: source.text } : {}),
		...(victimId ? { victim: victimId, victimName: next.players[victimId]?.name ?? '' } : {})
	};
	next.feed = [entry, ...next.feed].slice(0, FEED_SIZE);

	const message =
		kind === 'create' ? `${word} is yours (+${gained}).` : kind === 'extend' ? `${source!.text} → ${word} (+${gained}).` : `Stole ${source!.text} → ${word} (+${gained}).`;
	next.requests[move.requestId] = { seq, ok: true, message };
	const ids = Object.keys(next.requests);
	if (ids.length > REQUESTS_KEPT) {
		ids.sort((a, b) => next.requests[a].seq - next.requests[b].seq);
		for (const id of ids.slice(0, ids.length - REQUESTS_KEPT)) delete next.requests[id];
	}
	return { board: next, result: { ok: true, message, gained } };
}

/** Remove a player from a running room: their words leave the board. */
export function removeFromBoard(board: Board, playerId: string): Board | null {
	const p = board.players[playerId];
	if (!p || p.removed) return null;
	const next = clone(board);
	for (const [id, w] of Object.entries(next.words)) if (w.owner === playerId) delete next.words[id];
	next.players[playerId] = { ...p, removed: true, score: 0, longest: 0 };
	return next;
}

/** Recompute every score from the words owned (consistency check for tests and audits). */
export function scoresFromWords(board: Board): Record<string, number> {
	const out: Record<string, number> = {};
	for (const id of Object.keys(board.players)) out[id] = 0;
	for (const w of Object.values(board.words)) out[w.owner] = (out[w.owner] ?? 0) + w.text.length;
	return out;
}

// ── Ranking and qualification ────────────────────────────────────────────

/**
 * Leaderboard order (documented tie-break policy):
 *   1. higher score
 *   2. longer longest word currently owned
 *   3. more successful steals
 *   4. earlier time the score last changed (reached it first)
 * Players equal on all four share a rank. Name and id only fix the display
 * order between them — they never decide a qualification.
 */
const tieKey = (p: PlayerScore) => `${p.score}|${p.longest}|${p.steals}|${p.lastScoreAt}`;

export function rankBoard(board: Pick<Board, 'players'>): RankEntry[] {
	const list = Object.entries(board.players)
		.filter(([, p]) => !p.removed)
		.sort(
			([ia, a], [ib, b]) =>
				b.score - a.score ||
				b.longest - a.longest ||
				b.steals - a.steals ||
				a.lastScoreAt - b.lastScoreAt ||
				a.name.localeCompare(b.name) ||
				ia.localeCompare(ib)
		);
	const out: RankEntry[] = [];
	list.forEach(([playerId, p], i) => {
		const prev = i > 0 ? list[i - 1][1] : null;
		const rank = prev && tieKey(prev) === tieKey(p) ? out[i - 1].rank : i + 1;
		out.push({ playerId, name: p.name, score: p.score, longest: p.longest, steals: p.steals, lastScoreAt: p.lastScoreAt, rank });
	});
	return out;
}

/** Places that matter: top 2 advance from a qualifying room; the final decides 1st–3rd. */
export const placesFor = (final: boolean) => (final ? 3 : 2);

/**
 * Turn a finished room's ranking into its result. A group of fully tied
 * players that straddles a place that matters becomes a CutoffTie for an
 * organiser to decide; it is never settled silently. `resolved[i]` is the
 * organiser's pick for the i-th tie, if already made.
 */
export function roomResult(roomId: string, number: number, ranking: RankEntry[], final: boolean, resolved: (string[] | null)[] = []): RoomResult {
	const cap = Math.min(placesFor(final), ranking.length);
	const boundaries = final ? [1, 2, 3] : [placesFor(false)];
	const ties: CutoffTie[] = [];
	for (const [start, end] of tieGroups(ranking)) {
		if (end - start > 1 && boundaries.some((b) => start < b && b < end && b <= cap)) {
			ties.push({
				candidates: ranking.slice(start, end).map((r) => r.playerId),
				slots: Math.min(end, cap) - start,
				fromRank: start + 1,
				resolved: resolved[ties.length] ?? null
			});
		}
	}
	return { roomId, number, ranking, advancing: decideAdvancing(ranking, cap, ties), ties };
}

/** [start, end) index ranges of players sharing a rank. */
function tieGroups(ranking: RankEntry[]): [number, number][] {
	const out: [number, number][] = [];
	let start = 0;
	while (start < ranking.length) {
		let end = start + 1;
		while (end < ranking.length && ranking[end].rank === ranking[start].rank) end++;
		out.push([start, end]);
		start = end;
	}
	return out;
}

/** Places decided so far, in order; stops at the first tie still open. */
function decideAdvancing(ranking: RankEntry[], cap: number, ties: CutoffTie[]): string[] {
	const out: string[] = [];
	let i = 0;
	while (i < ranking.length && out.length < cap) {
		const tie = ties.find((t) => t.fromRank === i + 1);
		if (!tie) {
			out.push(ranking[i].playerId);
			i++;
			continue;
		}
		if (!tie.resolved) break;
		out.push(...tie.resolved);
		i += tie.candidates.length;
	}
	return out.slice(0, cap);
}

/** Validate an organiser's pick for one tie and return the updated result. */
export function resolveTie(result: RoomResult, tieIndex: number, picks: unknown, final: boolean): RoomResult | string {
	const tie = result.ties[tieIndex];
	if (!tie) return 'There is no tie to decide here.';
	if (!Array.isArray(picks) || picks.some((p) => typeof p !== 'string')) return 'Choose the players who take the tied places.';
	const list = picks as string[];
	if (new Set(list).size !== list.length) return 'Each player can only be picked once.';
	if (list.length !== tie.slots) return `Pick exactly ${tie.slots} player${tie.slots === 1 ? '' : 's'}.`;
	if (!list.every((p) => tie.candidates.includes(p))) return 'Pick only from the tied players.';
	const ties = result.ties.map((t, i) => (i === tieIndex ? { ...t, resolved: list } : t));
	const cap = Math.min(placesFor(final), result.ranking.length);
	return { ...result, ties, advancing: decideAdvancing(result.ranking, cap, ties) };
}

export const roomDecided = (r: RoomResult) => r.ties.every((t) => !!t.resolved);

/**
 * Next round's roster, in seeding order: every room's 1st place, then every
 * 2nd place; within each, higher score first, then room number. Dealt
 * round-robin, this keeps last round's winners apart.
 */
export function nextRoster(rooms: RoomResult[]): string[] {
	const seeds: { id: string; place: number; score: number; room: number }[] = [];
	for (const r of rooms) {
		r.advancing.forEach((id, place) => {
			const entry = r.ranking.find((e) => e.playerId === id);
			seeds.push({ id, place, score: entry?.score ?? 0, room: r.number });
		});
	}
	seeds.sort((a, b) => a.place - b.place || b.score - a.score || a.room - b.room);
	return seeds.map((s) => s.id);
}

// ── Starter words ────────────────────────────────────────────────────────

/** Seeded PRNG (mulberry32): the same seed always deals the same words. */
export function rng(seed: number): () => number {
	let a = seed >>> 0;
	return () => {
		a = (a + 0x6d2b79f5) >>> 0;
		let t = a;
		t = Math.imul(t ^ (t >>> 15), t | 1);
		t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
	};
}

/** Word lengths every player starts with: one of each, so everyone opens on the same score. */
export const STARTER_LENGTHS = [3, 4, 5] as const;

/**
 * Deal STARTERS_PER_PLAYER words to each player: one 3-, one 4- and one
 * 5-letter word (12 points each), no word twice in a room.
 */
export function dealStarters(playerIds: readonly string[], pools: Record<number, readonly string[]>, random: () => number): Record<string, string[]> {
	const decks = new Map<number, string[]>();
	for (const len of STARTER_LENGTHS) {
		const deck = [...new Set(pools[len] ?? [])];
		for (let i = deck.length - 1; i > 0; i--) {
			const j = Math.floor(random() * (i + 1));
			[deck[i], deck[j]] = [deck[j], deck[i]];
		}
		if (deck.length < playerIds.length) throw new Error(`Not enough ${len}-letter starter words.`);
		decks.set(len, deck);
	}
	const out: Record<string, string[]> = {};
	playerIds.forEach((id, i) => {
		out[id] = STARTER_LENGTHS.slice(0, STARTERS_PER_PLAYER).map((len) => decks.get(len)![i]);
	});
	return out;
}

/** A fresh board for a room, starter words already owned. */
export function newBoard(params: {
	round: number;
	roomId: string;
	number: number;
	rules: HeistRules;
	players: { id: string; name: string }[];
	starters: Record<string, string[]>;
	now: number;
}): Board {
	const players: Record<string, PlayerScore> = {};
	const words: Record<string, BoardWord> = {};
	let seq = 0;
	for (const p of params.players) {
		const mine = params.starters[p.id] ?? [];
		for (const text of mine) words[`w${++seq}`] = { text, owner: p.id, at: params.now, starter: true };
		players[p.id] = {
			name: p.name,
			score: mine.reduce((n, w) => n + w.length, 0),
			longest: mine.reduce((n, w) => Math.max(n, w.length), 0),
			steals: 0,
			lastScoreAt: params.now
		};
	}
	return {
		round: params.round,
		roomId: params.roomId,
		number: params.number,
		status: 'ready',
		endsAt: null,
		pausedRemainingMs: null,
		rules: params.rules,
		players,
		words,
		feed: [],
		seq,
		startSeq: seq,
		requests: {}
	};
}
