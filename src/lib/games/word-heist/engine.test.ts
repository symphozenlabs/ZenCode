import { describe, expect, it } from 'vitest';
import {
	LETTER_WEIGHTS,
	applyMove,
	letterDiff,
	makeBag,
	newBoard,
	nextRoster,
	normalizeWord,
	planMove,
	rankBoard,
	removeFromBoard,
	resolveTie,
	revealTiles,
	rng,
	roomDecided,
	roomResult,
	placesFor,
	roundClock,
	scoresFromWords,
	takeTiles,
	type MoveDeps,
	type MoveRequest
} from './engine';
import { assignRooms, fitStages } from './allocation';
import { DEFAULT_RULES, FINAL_SECONDS, OPENING_TILES, maxTilesFor, suggestedTiles, tilePace, tilePlan, tilesFor, type Board, type TilePlan } from './types';

// Small fixed dictionary so the rules are tested independently of SCOWL.
const WORDS = new Set(
	'CAT CATS ACT ACTS CARE RACE CRATER CARET TRACE TEA MATE TEAM MEAT STEAM PAT PATS PAST TAPS DOG GOD BRAIN TRAIN SEX'.split(' ')
);
const BLOCKED = new Set(['SEX']);
const deps: MoveDeps = { isWord: (w) => WORDS.has(w), moderate: (w) => (BLOCKED.has(w) ? 'Blocked.' : null) };
const T0 = 1_000_000;
/** Pilfer's pace: 60 tiles, one every 5 s, then 30 s. */
const TILES: TilePlan = { count: 60, everyMs: 5_000, totalMs: (57 * 5 + FINAL_SECONDS) * 1000 };

/** A live board with these words already owned and these tiles face up. */
function board(words: Record<string, string[]> = { a: ['CAT'], b: ['CARE'] }, pool = 'RTSMDOG'): Board {
	const b = newBoard({ round: 1, roomId: 'r1', number: 1, rules: DEFAULT_RULES, tiles: TILES, players: Object.keys(words).map((id) => ({ id, name: id.toUpperCase() })), bag: 'E'.repeat(60) });
	for (const [owner, list] of Object.entries(words)) {
		for (const text of list) {
			b.words[`w${++b.seq}`] = { text, owner, at: T0 };
			b.players[owner].score += text.length;
			b.players[owner].longest = Math.max(b.players[owner].longest, text.length);
		}
	}
	b.startSeq = b.seq;
	b.pool = [...pool].map((c, i) => ({ id: 100 + i, c }));
	return { ...b, status: 'playing', endsAt: T0 + 60_000 };
}

let n = 0;
const req = (playerId: string, text: string): MoveRequest => ({ requestId: `req-${++n}-xxxx`, playerId, text });
const poolOf = (b: Board) => b.pool.map((t) => t.c).join('');
const texts = (b: Board) => Object.values(b.words).map((w) => w.text).sort();

describe('words and letters', () => {
	it('normalises to A–Z and rejects anything else', () => {
		expect(normalizeWord(' crater ')).toBe('CRATER');
		expect(normalizeWord('café')).toBe('CAFE');
		expect(normalizeWord('s3x')).toBeNull();
		expect(normalizeWord('two words')).toBeNull();
		expect(normalizeWord('')).toBeNull();
		expect(normalizeWord(42)).toBeNull();
	});

	it('counts repeated letters', () => {
		expect(letterDiff('BERRY', 'BERY')).toEqual({ missing: ['R'], added: [] });
		expect(letterDiff('CARE', 'CRATER')).toEqual({ missing: [], added: ['T', 'R'] });
		expect(letterDiff('CARE', 'RACE')).toEqual({ missing: [], added: [] });
	});

	it('takes the oldest matching tiles, or none when a letter is short', () => {
		const pool = [
			{ id: 1, c: 'A' },
			{ id: 2, c: 'T' },
			{ id: 3, c: 'A' }
		];
		expect(takeTiles(pool, ['A', 'A'])!.map((t) => t.id)).toEqual([1, 3]);
		expect(takeTiles(pool, ['A', 'A', 'A'])).toBeNull();
	});
});

describe('tiles and the clock', () => {
	it('fills a bag of any size in English proportions, the same for the same seed', () => {
		for (const count of [40, 60, 120]) {
			const bag = makeBag(count, rng(9));
			expect(bag).toHaveLength(count);
			expect(bag).toMatch(/^[A-Z]+$/);
			const vowels = [...bag].filter((c) => 'AEIOU'.includes(c)).length / count;
			expect(vowels).toBeGreaterThan(0.35);
			expect(vowels).toBeLessThan(0.45);
		}
		const full = makeBag(100, rng(1));
		for (const [c, w] of Object.entries(LETTER_WEIGHTS)) expect([...full].filter((x) => x === c)).toHaveLength(w);
		expect(makeBag(60, rng(1))).toBe(makeBag(60, rng(1)));
		expect(makeBag(60, rng(1))).not.toBe(makeBag(60, rng(2)));
	});

	it('opens with three tiles, drops one per interval, then counts down 30 seconds', () => {
		const plan: TilePlan = { count: 40, everyMs: 5_000, totalMs: ((40 - OPENING_TILES) * 5 + FINAL_SECONDS) * 1000 };
		const end = T0 + plan.totalMs;
		expect(roundClock(plan, end, null, T0)).toMatchObject({ drawn: 3, tilesLeft: 37, nextTileAt: T0 + 5_000, finalCountdown: false });
		expect(roundClock(plan, end, null, T0 + 5_000)).toMatchObject({ drawn: 4, nextTileAt: T0 + 10_000 });
		expect(roundClock(plan, end, null, T0 + 37 * 5_000)).toMatchObject({ drawn: 40, tilesLeft: 0, nextTileAt: null, finalCountdown: true, remainingMs: 30_000 });
		// Paused: the time left fixes where the round stands.
		expect(roundClock(plan, null, plan.totalMs - 12_000, T0 + 999_999)).toMatchObject({ drawn: 5, nextTileAt: null });
	});

	it('suggests a bag that grows with the room, at a playable pace', () => {
		// Four players with 4:45 of tiles is Pilfer exactly: 60 tiles, one every 5 s.
		expect(suggestedTiles(4, 285)).toBe(60);
		expect(suggestedTiles(10, 300)).toBe(120);
		expect(suggestedTiles(12, 90)).toBe(63); // capped by the 1.5 s pace
		expect(suggestedTiles(2, 570)).toBe(75); // topped up to keep tiles coming
		expect(tilePace(285, 60)).toBe(5);
		expect(tilePace(60, 60)).toBeCloseTo(60 / 57); // a 1-minute round of tiles: about one a second
		expect(tilesFor(285, 5)).toBe(60);
	});

	it('allows 300 tiles for a 1-minute round, rising evenly to 3000 for 20 minutes', () => {
		expect([60, 120, 300, 600, 900, 1200].map(maxTilesFor)).toEqual([300, 440, 870, 1580, 2290, 3000]);
		expect(tilePace(60, 300)).toBeCloseTo(0.2); // 297 tiles drop in 60 s
		expect(tilePace(1200, 3000)).toBeCloseTo(0.4);
	});

	it("gives smaller rooms fewer tiles by size band (2–5, 6–10, 11–15), over the same round", () => {
		const rules = (roomSize: number) => ({ roundSeconds: 300, finalSeconds: 30, roomSize, tileCount: 150 });
		const counts = (roomSize: number, players: number[]) => players.map((p) => tilePlan(p, rules(roomSize)).count);
		// Set for 15: 150 for 11–15, 100 for 6–10, 50 for 2–5.
		expect(counts(15, [15, 11, 10, 6, 5, 2])).toEqual([150, 150, 100, 100, 50, 50]);
		// Set for 12: the same bands.
		expect(counts(12, [12, 11, 10, 6, 5, 2])).toEqual([150, 150, 100, 100, 50, 50]);
		// Set for 10 or 9: 150 for 6 and up, 75 for 2–5.
		expect(counts(10, [10, 6, 5, 2])).toEqual([150, 150, 75, 75]);
		expect(counts(9, [9, 6, 5])).toEqual([150, 150, 75]);
		// Set for 5 or fewer: one band.
		expect(counts(5, [5, 2])).toEqual([150, 150]);
		expect(tilePlan(15, rules(15))).toMatchObject({ totalMs: 330_000 }); // the countdown comes after the tiles
		for (const players of [2, 6, 11, 15]) {
			const plan = tilePlan(players, rules(15));
			// Every room's last tile drops at the end of the round length, whatever its size.
			expect((plan.count - OPENING_TILES) * plan.everyMs).toBeCloseTo(300_000);
		}
	});

	it('turns over due tiles in bag order and nothing else', () => {
		const b = { ...newBoard({ round: 1, roomId: 'r', number: 1, rules: DEFAULT_RULES, tiles: TILES, players: [{ id: 'a', name: 'A' }], bag: 'ABCDEFGHIJ'.repeat(6) }) };
		expect(revealTiles(b, T0)).toBeNull(); // not started
		const live = { ...b, status: 'playing' as const, endsAt: T0 + TILES.totalMs };
		const opened = revealTiles(live, T0)!;
		expect(poolOf(opened)).toBe('ABC');
		expect(revealTiles(opened, T0 + 100)).toBeNull();
		const later = revealTiles({ ...opened, pool: opened.pool.slice(1) }, T0 + 2 * TILES.everyMs)!;
		expect(later.drawn).toBe(5);
		expect(poolOf(later)).toBe('BCDE'); // a used tile stays used
		expect(revealTiles({ ...opened, status: 'paused' }, T0 + 60_000)).toBeNull();
	});
});

describe('moves', () => {
	it('makes a word from tiles only, and those tiles leave the row', () => {
		const out = applyMove(board({ a: [], b: [] }, 'GODX'), req('a', 'dog'), T0 + 1, deps);
		expect(out.result).toMatchObject({ ok: true, gained: 3 });
		expect(out.board!.players.a.score).toBe(3);
		expect(poolOf(out.board!)).toBe('X');
		expect(out.board!.feed[0]).toMatchObject({ kind: 'create', text: 'DOG' });
	});

	it('refuses a word whose letters are not face up — players cannot type anything they like', () => {
		const b = board({ a: [], b: [] }, 'DOX');
		const out = applyMove(b, req('a', 'DOG'), T0, deps);
		expect(out.board).toBeNull();
		expect(out.result.message).toMatch(/Letters not available/);
	});

	it('steals by adding tiles: CARE + T, R → CRATER moves the points', () => {
		const b = board({ a: ['CAT'], b: ['CARE'] }, 'RTX');
		const out = applyMove(b, req('a', 'crater'), T0 + 5, deps);
		expect(out.result).toMatchObject({ ok: true, gained: 6 });
		const next = out.board!;
		expect(next.players.a.score).toBe(3 + 6);
		expect(next.players.b.score).toBe(0);
		expect(next.players.a.steals).toBe(1);
		expect(texts(next)).toEqual(['CAT', 'CRATER']);
		expect(poolOf(next)).toBe('X');
		expect(next.feed[0]).toMatchObject({ kind: 'steal', from: 'CARE', text: 'CRATER', victim: 'b' });
		const fromWords = scoresFromWords(next);
		for (const [id, p] of Object.entries(next.players)) expect(p.score).toBe(fromWords[id]);
	});

	it("Pilfer's example: TEA + M → MATE, then MATE + S → STEAM", () => {
		const b = board({ a: [], b: ['TEA'] }, 'MS');
		const first = applyMove(b, req('a', 'MATE'), T0 + 1, deps);
		expect(first.result).toMatchObject({ ok: true, gained: 4 });
		expect(first.board!.players.b.score).toBe(0);
		const second = applyMove(first.board!, req('a', 'STEAM'), T0 + 2, deps);
		expect(second.result).toMatchObject({ ok: true, gained: 1 }); // own word: just the new letter
		expect(second.board!.feed[0].kind).toBe('extend');
		expect(second.board!.players.a.score).toBe(5);
	});

	it('the added letters must be in the row', () => {
		const out = applyMove(board({ a: [], b: ['CARE'] }, 'XYZ'), req('a', 'CRATER'), T0, deps);
		expect(out.result.message).toMatch(/Letters not available/);
	});

	it('rejects only S on the end: PAT → PATS no, PAT → PAST and TAPS yes', () => {
		const b = board({ a: [], b: ['PAT'] }, 'S');
		expect(applyMove(b, req('a', 'PATS'), T0, deps).result.message).toMatch(/just by adding S/);
		expect(applyMove(b, req('a', 'PAST'), T0, deps).result).toMatchObject({ ok: true, gained: 4 });
		expect(applyMove(b, req('a', 'TAPS'), T0, deps).result).toMatchObject({ ok: true });
	});

	it('a word made entirely from tiles is fine even if it pluralises a word on the board', () => {
		const out = applyMove(board({ a: [], b: ['CAT'] }, 'CATS'), req('a', 'CATS'), T0, deps);
		expect(out.result).toMatchObject({ ok: true, gained: 4 });
		expect(out.board!.feed[0].kind).toBe('create');
		expect(texts(out.board!)).toEqual(['CAT', 'CATS']);
	});

	it('rearranging a word without a new tile is not a steal', () => {
		const out = applyMove(board({ a: [], b: ['CARE'] }, 'X'), req('a', 'RACE'), T0, deps);
		expect(out.result.message).toMatch(/only rearranges CARE/);
	});

	it("prefers stealing another player's word, longest first, over extending your own", () => {
		// Both TEA (a's) and ATE (b's) + M make MATE: a takes b's.
		const b = board({ a: ['TEA'], b: ['ATE'] }, 'M');
		const plan = planMove(b, 'MATE', 'a');
		expect('sourceId' in plan && b.words[plan.sourceId!].owner).toBe('b');
	});

	it('rejects unknown, blocked, duplicate and too-short words', () => {
		const b = board({ a: ['CAT'], b: ['BRAIN'] }, 'CATSEXDOG');
		expect(applyMove(b, req('a', 'ZZZ'), T0, deps).result.message).toMatch(/dictionary/);
		expect(applyMove(b, req('a', 'SEX'), T0, deps).result.message).toBe('Blocked.');
		expect(applyMove(b, req('a', 'CAT'), T0, deps).result.message).toMatch(/already on the board/);
		expect(applyMove(b, req('a', 'AT'), T0, deps).result.message).toMatch(/at least 3/);
	});

	it('refuses moves outside a live round and from outsiders', () => {
		const b = board({ a: [], b: [] }, 'DOG');
		expect(applyMove({ ...b, status: 'paused' }, req('a', 'DOG'), T0, deps).result.message).toMatch(/paused/);
		expect(applyMove({ ...b, status: 'finished' }, req('a', 'DOG'), T0, deps).result.ok).toBe(false);
		expect(applyMove(b, req('a', 'DOG'), T0 + 60_000, deps).result.message).toMatch(/not in progress/);
		expect(applyMove(b, req('mallory', 'DOG'), T0, deps).result.message).toMatch(/not playing/);
	});

	it('only one of two players racing for the same word gets it', () => {
		const b = board({ a: [], b: [], c: ['CARE'] }, 'RT');
		const first = applyMove(b, req('a', 'CRATER'), T0 + 1, deps);
		const second = applyMove(first.board!, req('b', 'TRACE'), T0 + 2, deps);
		expect(first.result.ok).toBe(true);
		expect(second.result.ok).toBe(false); // CARE and the T are gone
		expect(first.board!.players.b.score).toBe(0);
	});

	it('a retried request is applied once', () => {
		const b = board({ a: ['CAT'], b: ['CARE'] }, 'RT');
		const move = req('a', 'CRATER');
		const first = applyMove(b, move, T0 + 1, deps);
		const retry = applyMove(first.board!, move, T0 + 2, deps);
		expect(retry.board).toBeNull();
		expect(retry.result).toMatchObject({ ok: true, duplicate: true });
		expect(first.board!.players.a.score).toBe(9);
	});

	it('never mutates the input board', () => {
		const b = board({ a: ['CAT'], b: ['CARE'] }, 'RT');
		const before = JSON.stringify(b);
		applyMove(b, req('a', 'CRATER'), T0, deps);
		expect(JSON.stringify(b)).toBe(before);
	});

	it('tracks the longest word each player made, and when', () => {
		const b = board({ a: [], b: [] }, 'DOGCATRE');
		const one = applyMove(b, req('a', 'DOG'), T0 + 1, deps).board!;
		const two = applyMove(one, req('a', 'CARET'), T0 + 2, deps).board!;
		expect(two.players.a).toMatchObject({ longest: 5, longestAt: T0 + 2 });
	});

	it('removing a player takes their words off the board', () => {
		const b = removeFromBoard(board(), 'b')!;
		expect(texts(b)).toEqual(['CAT']);
		expect(b.players.b.removed).toBe(true);
		expect(rankBoard(b).map((r) => r.playerId)).toEqual(['a']);
	});

	it('a new board starts everyone on 0 with no words and no tiles', () => {
		const b = newBoard({ round: 1, roomId: 'r', number: 1, rules: DEFAULT_RULES, tiles: TILES, players: [{ id: 'a', name: 'A' }, { id: 'b', name: 'B' }], bag: makeBag(60, rng(1)) });
		expect(Object.values(b.players).map((p) => p.score)).toEqual([0, 0]);
		expect(b.words).toEqual({});
		expect(b.pool).toEqual([]);
		expect(b.status).toBe('ready');
	});
});

describe('ranking and qualification', () => {
	const scored = (rows: [string, number, number, number][]) => ({
		players: Object.fromEntries(rows.map(([id, score, longest, at]) => [id, { name: id, score, longest, longestAt: at, steals: 0 }]))
	});

	it('orders by score, then longest word, then who made it first', () => {
		const r = rankBoard(scored([['a', 10, 5, 9], ['b', 12, 4, 9], ['c', 10, 6, 9], ['d', 10, 5, 3]]));
		expect(r.map((e) => e.playerId)).toEqual(['b', 'c', 'd', 'a']);
		expect(r.map((e) => e.rank)).toEqual([1, 2, 3, 4]);
	});

	it('top two advance; a full tie at the cutoff waits for an organiser', () => {
		const clear = roomResult('r', 1, rankBoard(scored([['a', 9, 3, 1], ['b', 8, 3, 1], ['c', 7, 3, 1]])), 2, false);
		expect(clear.advancing).toEqual(['a', 'b']);
		expect(clear.ties).toEqual([]);

		const tied = roomResult('r', 1, rankBoard(scored([['a', 9, 3, 1], ['b', 8, 3, 1], ['c', 8, 3, 1]])), 2, false);
		expect(tied.advancing).toEqual(['a']);
		expect(tied.ties).toEqual([{ candidates: ['b', 'c'], slots: 1, fromRank: 2, resolved: null }]);
		expect(roomDecided(tied)).toBe(false);

		expect(resolveTie(tied, 0, ['a'], 2)).toMatch(/only from the tied/);
		expect(resolveTie(tied, 0, ['b', 'c'], 2)).toMatch(/exactly 1/);
		const done = resolveTie(tied, 0, ['c'], 2);
		expect(typeof done).toBe('object');
		expect((done as ReturnType<typeof roomResult>).advancing).toEqual(['a', 'c']);
	});

	it('a tie for 1st inside the top two is not a cutoff tie', () => {
		const r = roomResult('r', 1, rankBoard(scored([['a', 9, 3, 1], ['b', 9, 3, 1], ['c', 7, 3, 1]])), 2, false);
		expect(r.ties).toEqual([]);
		expect(r.advancing.sort()).toEqual(['a', 'b']);
	});

	it('the tie-break settles what it can before asking', () => {
		const r = roomResult('r', 1, rankBoard(scored([['a', 9, 3, 1], ['b', 8, 3, 5], ['c', 8, 3, 2]])), 2, false);
		expect(r.advancing).toEqual(['a', 'c']); // c made the 3-letter word first
		expect(r.ties).toEqual([]);
	});

	it('the final decides 1st–3rd and flags each tied place', () => {
		const r = roomResult('f', 1, rankBoard(scored([['a', 9, 3, 1], ['b', 9, 3, 1], ['c', 7, 3, 1], ['d', 6, 3, 1], ['e', 6, 3, 1]])), 3, true);
		expect(r.ties.map((t) => [t.candidates, t.slots, t.fromRank])).toEqual([[['a', 'b'], 2, 1]]);
		expect(r.advancing).toEqual([]);
		const decided = resolveTie(r, 0, ['b', 'a'], 3) as ReturnType<typeof roomResult>;
		expect(decided.advancing).toEqual(['b', 'a', 'c']);
	});

	it('small rooms advance everyone they have', () => {
		expect(roomResult('r', 1, rankBoard(scored([['a', 3, 3, 1]])), 2, false).advancing).toEqual(['a']);
		expect(roomResult('r', 1, rankBoard(scored([['a', 3, 3, 1], ['b', 2, 2, 1]])), 3, true).advancing).toEqual(['a', 'b']);
	});

	it('145 players over 3 stages, 2 through: 13 rooms → 26 → 3 rooms → 6 in the final', () => {
		const random = rng(7);
		const ids = Array.from({ length: 145 }, (_, i) => `p${i}`);
		const play = (roster: string[], stagesLeft: number) => {
			const stage = fitStages(roster.length, stagesLeft, 2)![0];
			return assignRooms(roster, stage.sizes.length).map((members, i) => {
				const rows = members.map((id, j) => [id, Math.floor(random() * 40), 5, j] as [string, number, number, number]);
				return roomResult(`r${i}`, i + 1, rankBoard(scored(rows)), placesFor(stage.final, 2), stage.final);
			});
		};
		const r1 = play(ids, 3);
		expect(r1).toHaveLength(13);
		expect(r1.every(roomDecided)).toBe(true); // longestAt differs per player
		const q1 = nextRoster(r1);
		expect(q1).toHaveLength(26);
		expect(new Set(q1).size).toBe(26);
		const r2 = play(q1, 2);
		expect(r2).toHaveLength(3);
		const q2 = nextRoster(r2);
		expect(q2).toHaveLength(6);
		const final = play(q2, 1);
		expect(final).toHaveLength(1);
		expect(final[0].advancing).toHaveLength(3);
	});

	it('any number can go through from a room', () => {
		const rows: [string, number, number, number][] = ['a', 'b', 'c', 'd', 'e', 'f'].map((id, i) => [id, 20 - i, 3, 1]);
		expect(roomResult('r', 1, rankBoard(scored(rows)), 4, false).advancing).toEqual(['a', 'b', 'c', 'd']);
	});

	it('seeds 1st places before 2nd places for the next round', () => {
		const rooms = [
			roomResult('r1', 1, rankBoard(scored([['a', 9, 3, 1], ['b', 8, 3, 1]])), 2, false),
			roomResult('r2', 2, rankBoard(scored([['c', 7, 3, 1], ['d', 6, 3, 1]])), 2, false)
		];
		expect(nextRoster(rooms)).toEqual(['a', 'c', 'b', 'd']);
	});
});
