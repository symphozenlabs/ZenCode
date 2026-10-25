import {
	FEED_SIZE,
	OPENING_TILES,
	type Board,
	type BoardWord,
	type CutoffTie,
	type FeedEntry,
	type HeistRules,
	type MoveKind,
	type MoveResult,
	type PlayerScore,
	type RankEntry,
	type RoomResult,
	type Tile,
	type TilePlan
} from './types';

/**
 * Word Heist rules (modelled on Merriam-Webster's Pilfer). Pure: the live
 * server runs these on a room's board in one synchronous step, and the tests
 * run them directly. The browser only uses the clock and letter helpers for
 * display — every decision is made on the server.
 *
 * Letter tiles drop into a shared row one at a time. A player types a word:
 * it either steals a word on the board (every letter of it, plus at least one
 * tile from the row) or is made from tiles alone. Tiles used leave the row.
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

/**
 * Pilfer's one exception: a word can't be stolen just by adding S to the end
 * (PAT → PATS). Using the S to rearrange is fine (PAT → PAST, TAPS).
 */
export const isJustS = (source: string, candidate: string) => candidate === source + 'S';

/** The oldest tiles in `pool` spelling `letters` (any order), or null if the row doesn't have them. */
export function takeTiles(pool: readonly Tile[], letters: readonly string[]): Tile[] | null {
	const used = new Set<number>();
	const out: Tile[] = [];
	for (const c of letters) {
		const t = pool.find((p) => p.c === c && !used.has(p.id));
		if (!t) return null;
		used.add(t.id);
		out.push(t);
	}
	return out;
}

// ── Tiles and the round clock ────────────────────────────────────────────

/**
 * Letter mix per 100 tiles, close to English letter frequency (about 40%
 * vowels). A bag of any size is scaled from it.
 */
export const LETTER_WEIGHTS: Record<string, number> = {
	A: 8, B: 2, C: 3, D: 4, E: 12, F: 2, G: 3, H: 3, I: 8, J: 1, K: 1, L: 5, M: 3,
	N: 6, O: 7, P: 2, Q: 1, R: 6, S: 5, T: 7, U: 4, V: 1, W: 2, X: 1, Y: 2, Z: 1
};

/** A shuffled bag of `count` tiles in LETTER_WEIGHTS proportions. Same `random` → same bag. */
export function makeBag(count: number, random: () => number): string {
	const total = Object.values(LETTER_WEIGHTS).reduce((a, b) => a + b, 0);
	const shares = Object.entries(LETTER_WEIGHTS).map(([c, w]) => {
		const exact = (w * count) / total;
		return { c, n: Math.floor(exact), rest: exact - Math.floor(exact) };
	});
	// Largest remainders get the tiles rounding left over.
	let left = count - shares.reduce((a, s) => a + s.n, 0);
	for (const s of [...shares].sort((a, b) => b.rest - a.rest || a.c.localeCompare(b.c))) {
		if (left-- <= 0) break;
		s.n++;
	}
	const tiles = shares.flatMap((s) => Array<string>(s.n).fill(s.c));
	for (let i = tiles.length - 1; i > 0; i--) {
		const j = Math.floor(random() * (i + 1));
		[tiles[i], tiles[j]] = [tiles[j], tiles[i]];
	}
	return tiles.join('');
}

/** Tiles that should be face up after `elapsedMs` of play (pauses excluded). */
export const tilesDue = (plan: TilePlan, elapsedMs: number) => Math.min(plan.count, OPENING_TILES + Math.max(0, Math.floor(elapsedMs / plan.everyMs)));

export interface RoundClock {
	/** Tiles face up by now. */
	drawn: number;
	tilesLeft: number;
	/** When the next tile drops (null once the bag is empty or the clock is stopped). */
	nextTileAt: number | null;
	/** Time left in the round. */
	remainingMs: number;
	/** The bag is empty: this is the final countdown. */
	finalCountdown: boolean;
}

/**
 * Where a round stands at `now`, from when it ends (`endsAt`, while running)
 * or the time that was left (`pausedRemainingMs`, while paused).
 */
export function roundClock(plan: TilePlan, endsAt: number | null, pausedRemainingMs: number | null, now: number): RoundClock {
	const remainingMs = Math.max(0, endsAt !== null ? endsAt - now : (pausedRemainingMs ?? plan.totalMs));
	const drawn = tilesDue(plan, plan.totalMs - remainingMs);
	const nextTileAt = endsAt !== null && drawn < plan.count ? Math.ceil(endsAt - plan.totalMs + (drawn - OPENING_TILES + 1) * plan.everyMs) : null;
	return { drawn, tilesLeft: plan.count - drawn, nextTileAt, remainingMs, finalCountdown: drawn >= plan.count };
}

/** Turn over the tiles that are due by `now`. Returns null when nothing changed. Never mutates. */
export function revealTiles(board: Board, now: number): Board | null {
	if (board.status !== 'playing' || board.endsAt === null) return null;
	const due = Math.min(board.bag.length, roundClock(board.tiles, board.endsAt, null, now).drawn);
	if (due <= board.drawn) return null;
	const fresh: Tile[] = [];
	for (let i = board.drawn; i < due; i++) fresh.push({ id: i, c: board.bag[i] });
	return { ...board, drawn: due, pool: [...board.pool, ...fresh] };
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
	text: string;
}

export const REQUESTS_KEPT = 300;

/** Checks that don't need the board: spelling, length, moderation, dictionary. */
export function precheck(raw: unknown, rules: Pick<HeistRules, 'minWordLength'>, deps: MoveDeps): { word: string } | { message: string } {
	const screened = typeof raw === 'string' ? deps.screen?.(raw.slice(0, 60)) : null;
	if (screened) return { message: screened };
	const word = normalizeWord(raw);
	if (!word) return { message: 'Use letters A–Z only.' };
	if (word.length < rules.minWordLength) return { message: `Words need at least ${rules.minWordLength} letters.` };
	const blocked = deps.moderate(word);
	if (blocked) return { message: blocked };
	if (!deps.isWord(word)) return { message: `${word} isn't in the dictionary.` };
	return { word };
}

export type MovePlan = { sourceId: string | null; tiles: Tile[] } | { message: string };

/**
 * Work out how `word` can be played on this board. A steal is tried first —
 * other players' words before your own, longer words first — then making it
 * from tiles alone. Each steal keeps every letter of its source and takes the
 * rest from the tile row.
 */
export function planMove(board: Pick<Board, 'words' | 'pool'>, word: string, playerId: string): MovePlan {
	const sources = Object.entries(board.words).sort(
		([ia, a], [ib, b]) => Number(a.owner === playerId) - Number(b.owner === playerId) || b.text.length - a.text.length || ia.localeCompare(ib, undefined, { numeric: true })
	);
	let justS: string | null = null;
	let rearranged: string | null = null;
	for (const [id, w] of sources) {
		const { missing, added } = letterDiff(w.text, word);
		if (missing.length) continue;
		if (!added.length) {
			rearranged ??= w.text;
			continue;
		}
		if (isJustS(w.text, word)) {
			justS ??= w.text;
			continue;
		}
		const tiles = takeTiles(board.pool, added);
		if (tiles) return { sourceId: id, tiles };
	}
	const tiles = takeTiles(board.pool, [...word]);
	if (tiles) return { sourceId: null, tiles };
	if (justS) return { message: `You can't steal ${justS} just by adding S — rearrange it into a new word.` };
	if (rearranged) return { message: `${word} only rearranges ${rearranged} — add at least one tile.` };
	return { message: `Letters not available for ${word}.` };
}

const clone = (b: Board): Board => structuredClone(b);

const reject = (message: string): { board: null; result: MoveResult } => ({ board: null, result: { ok: false, message } });

/**
 * Apply one move to a board. Returns the new board (null when nothing
 * changed) and the outcome. Never mutates its input.
 *
 * Ownership and score change together: a steal removes the source word and its
 * points from the previous owner and adds the new word and its points to the
 * thief, in the same step. Tiles used leave the row.
 */
export function applyMove(board: Board, move: MoveRequest, now: number, deps: MoveDeps): { board: Board | null; result: MoveResult } {
	const seen = board.requests[move.requestId];
	if (seen) return { board: null, result: { ok: seen.ok, message: seen.message, duplicate: true } };

	if (board.status === 'paused') return reject('The round is paused.');
	if (board.status !== 'playing' || board.endsAt === null || now >= board.endsAt) return reject('The round is not in progress.');
	const me = board.players[move.playerId];
	if (!me || me.removed) return reject("You're not playing in this room.");

	const pre = precheck(move.text, board.rules, deps);
	if ('message' in pre) return reject(pre.message);
	const word = pre.word;

	if (Object.values(board.words).some((w) => w.text === word)) return reject(`${word} is already on the board.`);

	const plan = planMove(board, word, move.playerId);
	if ('message' in plan) return reject(plan.message);
	const source = plan.sourceId ? board.words[plan.sourceId] : undefined;
	const kind: MoveKind = !source ? 'create' : source.owner === move.playerId ? 'extend' : 'steal';

	const next = clone(board);
	next.seq += 1;
	const seq = next.seq;
	const victimId = source && kind === 'steal' ? source.owner : undefined;

	if (plan.sourceId) delete next.words[plan.sourceId];
	next.words[`w${seq}`] = { text: word, owner: move.playerId, at: now, ...(source ? { from: source.text } : {}) };
	const used = new Set(plan.tiles.map((t) => t.id));
	next.pool = next.pool.filter((t) => !used.has(t.id));

	const mine = next.players[move.playerId];
	const gained = word.length - (kind === 'extend' && source ? source.text.length : 0);
	mine.score += gained;
	if (kind === 'steal') mine.steals += 1;
	if (word.length > mine.longest) {
		mine.longest = word.length;
		mine.longestAt = now;
	}
	if (victimId && source) {
		const victim = next.players[victimId];
		if (victim) victim.score -= source.text.length;
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
	next.players[playerId] = { ...p, removed: true, score: 0, longest: 0, longestAt: 0 };
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
 * Leaderboard order (Pilfer's tie-break):
 *   1. higher score
 *   2. longer longest word made this round
 *   3. made that word first
 * Players equal on all three share a rank. Name and id only fix the display
 * order between them — they never decide a qualification.
 */
const tieKey = (p: PlayerScore) => `${p.score}|${p.longest}|${p.longestAt ?? 0}`;

export function rankBoard(board: Pick<Board, 'players'>): RankEntry[] {
	const list = Object.entries(board.players)
		.filter(([, p]) => !p.removed)
		.sort(
			([ia, a], [ib, b]) =>
				b.score - a.score || b.longest - a.longest || (a.longestAt ?? 0) - (b.longestAt ?? 0) || a.name.localeCompare(b.name) || ia.localeCompare(ib)
		);
	const out: RankEntry[] = [];
	list.forEach(([playerId, p], i) => {
		const prev = i > 0 ? list[i - 1][1] : null;
		const rank = prev && tieKey(prev) === tieKey(p) ? out[i - 1].rank : i + 1;
		out.push({ playerId, name: p.name, score: p.score, longest: p.longest, longestAt: p.longestAt ?? 0, steals: p.steals, rank });
	});
	return out;
}

/** Places that matter: the podium (1st–3rd) in the final, else the players who go through. */
export const placesFor = (final: boolean, advance: number) => (final ? 3 : advance);

/**
 * Turn a finished room's ranking into its result. A group of fully tied
 * players that straddles a place that matters becomes a CutoffTie for an
 * organiser to decide; it is never settled silently. `resolved[i]` is the
 * organiser's pick for the i-th tie, if already made.
 */
export function roomResult(roomId: string, number: number, ranking: RankEntry[], places: number, final: boolean, resolved: (string[] | null)[] = []): RoomResult {
	const cap = Math.min(places, ranking.length);
	const boundaries = final ? Array.from({ length: places }, (_, i) => i + 1) : [places];
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
export function resolveTie(result: RoomResult, tieIndex: number, picks: unknown, places: number): RoomResult | string {
	const tie = result.ties[tieIndex];
	if (!tie) return 'There is no tie to decide here.';
	if (!Array.isArray(picks) || picks.some((p) => typeof p !== 'string')) return 'Choose the players who take the tied places.';
	const list = picks as string[];
	if (new Set(list).size !== list.length) return 'Each player can only be picked once.';
	if (list.length !== tie.slots) return `Pick exactly ${tie.slots} player${tie.slots === 1 ? '' : 's'}.`;
	if (!list.every((p) => tie.candidates.includes(p))) return 'Pick only from the tied players.';
	const ties = result.ties.map((t, i) => (i === tieIndex ? { ...t, resolved: list } : t));
	const cap = Math.min(places, result.ranking.length);
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

// ── New boards ───────────────────────────────────────────────────────────

/** Seeded PRNG (mulberry32): the same seed always gives the same bag. */
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

/** A fresh board for a room: everyone on 0, no tiles turned over yet. */
export function newBoard(params: {
	round: number;
	roomId: string;
	number: number;
	rules: HeistRules;
	tiles: TilePlan;
	players: { id: string; name: string; avatar?: number }[];
	bag: string;
}): Board {
	const players: Record<string, PlayerScore> = {};
	params.players.forEach((p, seat) => {
		players[p.id] = { name: p.name, score: 0, longest: 0, longestAt: 0, steals: 0, seat, avatar: p.avatar ?? 0 };
	});
	return {
		round: params.round,
		roomId: params.roomId,
		number: params.number,
		status: 'ready',
		endsAt: null,
		pausedRemainingMs: null,
		rules: params.rules,
		tiles: params.tiles,
		bag: params.bag,
		drawn: 0,
		pool: [],
		players,
		words: {},
		feed: [],
		seq: 0,
		startSeq: 0,
		requests: {}
	};
}
