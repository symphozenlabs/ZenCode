import { describe, expect, it } from 'vitest';
import {
	applyMove,
	dealStarters,
	isPluralOf,
	letterDiff,
	newBoard,
	nextRoster,
	normalizeWord,
	rankBoard,
	removeFromBoard,
	resolveTie,
	rng,
	roomDecided,
	roomResult,
	scoresFromWords,
	type MoveDeps,
	type MoveRequest
} from './engine';
import { assignRooms } from './allocation';
import { DEFAULT_RULES, type Board } from './types';

// Small fixed dictionary so the rules are tested independently of SCOWL.
const WORDS = new Set(
	'CAT CATS ACT ACTS CARE RACE CRATER CARET TRACE BOX BOXES BERRY BERRIES DOG GOD GODS DOGS COAST TACOS CART CARTS TART START STARE TEARS RATES ASTER BRAIN TRAIN STRAIN TRAINS RETRAIN TERRAIN SEX INNER WINNER'.split(' ')
);
const BLOCKED = new Set(['SEX']);
const deps: MoveDeps = { isWord: (w) => WORDS.has(w), moderate: (w) => (BLOCKED.has(w) ? 'Blocked.' : null) };
const T0 = 1_000_000;

function board(starters: Record<string, string[]> = { a: ['CAT'], b: ['CARE'] }): Board {
	const b = newBoard({
		round: 1,
		roomId: 'r1',
		number: 1,
		rules: DEFAULT_RULES,
		players: Object.keys(starters).map((id) => ({ id, name: id.toUpperCase() })),
		starters,
		now: T0
	});
	return { ...b, status: 'playing', endsAt: T0 + 60_000 };
}

let n = 0;
const req = (playerId: string, kind: 'create' | 'steal', text: string, sourceId?: string): MoveRequest => ({
	requestId: `req-${++n}-xxxx`,
	playerId,
	kind,
	text,
	sourceId
});
const idOf = (b: Board, text: string) => Object.entries(b.words).find(([, w]) => w.text === text)![0];

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

	it('detects plural-only changes without banning every S ending', () => {
		const isWord = deps.isWord;
		expect(isPluralOf('CAT', 'CATS', isWord)).toBe(true);
		expect(isPluralOf('BOX', 'BOXES', isWord)).toBe(true);
		expect(isPluralOf('BERRY', 'BERRIES', isWord)).toBe(true);
		expect(isPluralOf('CAT', 'ACTS', isWord)).toBe(false);
		expect(isPluralOf('COAST', 'TACOS', isWord)).toBe(false);
		expect(isPluralOf('DOG', 'GODS', isWord)).toBe(false);
	});
});

describe('moves', () => {
	it('creates a word and scores its length', () => {
		const out = applyMove(board(), req('a', 'create', 'dog'), T0 + 1, deps);
		expect(out.result).toMatchObject({ ok: true, gained: 3 });
		expect(out.board!.players.a.score).toBe(6);
	});

	it.each([
		['CARE', 'RACE', /Add at least one letter/],
		['CAT', 'CATS', /plural/],
		['BOX', 'BOXES', /plural/],
		['BERRY', 'BERRIES', /plural/]
	])('rejects %s → %s', (from, to, message) => {
		const b = board({ a: ['DOG'], b: [from] });
		const out = applyMove(b, req('a', 'steal', to, idOf(b, from)), T0 + 1, deps);
		expect(out.board).toBeNull();
		expect(out.result.ok).toBe(false);
		expect(out.result.message).toMatch(message);
	});

	it('accepts CARE → CRATER and moves points with ownership', () => {
		const b = board({ a: ['CAT'], b: ['CARE'] });
		const out = applyMove(b, req('a', 'steal', 'crater', idOf(b, 'CARE')), T0 + 5, deps);
		expect(out.result).toMatchObject({ ok: true, gained: 6 });
		const next = out.board!;
		expect(next.players.a.score).toBe(3 + 6);
		expect(next.players.b.score).toBe(0);
		expect(next.players.a.steals).toBe(1);
		expect(Object.values(next.words).map((w) => w.text).sort()).toEqual(['CAT', 'CRATER']);
		expect(next.feed[0]).toMatchObject({ kind: 'steal', from: 'CARE', text: 'CRATER', victim: 'b' });
		// Stored scores always equal the words owned.
		const fromWords = scoresFromWords(next);
		for (const [id, p] of Object.entries(next.players)) expect(p.score).toBe(fromWords[id]);
	});

	it('extending your own word only adds the new letters', () => {
		const b = board({ a: ['CARE'], b: ['DOG'] });
		const out = applyMove(b, req('a', 'steal', 'CRATER', idOf(b, 'CARE')), T0 + 1, deps);
		expect(out.result).toMatchObject({ ok: true, gained: 2 });
		expect(out.board!.players.a.score).toBe(6);
		expect(out.board!.players.a.steals).toBe(0);
	});

	it('rejects missing letters, unknown words, blocked words and duplicates', () => {
		const b = board({ a: ['CAT'], b: ['BRAIN'] });
		expect(applyMove(b, req('a', 'steal', 'TRAIN', idOf(b, 'BRAIN')), T0, deps).result.message).toMatch(/missing B/);
		expect(applyMove(b, req('a', 'create', 'ZZZ'), T0, deps).result.message).toMatch(/dictionary/);
		expect(applyMove(b, req('a', 'create', 'SEX'), T0, deps).result.message).toBe('Blocked.');
		expect(applyMove(b, req('a', 'create', 'CAT'), T0, deps).result.message).toMatch(/already on the board/);
		expect(applyMove(b, req('a', 'create', 'CRATER'), T0, deps).result.message).toMatch(/at most 5/);
		expect(applyMove(b, req('a', 'create', 'AT'), T0, deps).result.message).toMatch(/at least 3/);
	});

	it('refuses moves outside a live round and from outsiders', () => {
		const b = board();
		expect(applyMove({ ...b, status: 'paused' }, req('a', 'create', 'DOG'), T0, deps).result.message).toMatch(/paused/);
		expect(applyMove({ ...b, status: 'finished' }, req('a', 'create', 'DOG'), T0, deps).result.ok).toBe(false);
		expect(applyMove(b, req('a', 'create', 'DOG'), T0 + 60_000, deps).result.message).toMatch(/not in progress/);
		expect(applyMove(b, req('mallory', 'create', 'DOG'), T0, deps).result.message).toMatch(/not playing/);
	});

	it('only one of two simultaneous steals of the same word succeeds', () => {
		// Transactions serialise the two: the second runs on the board the first wrote.
		const b = board({ a: ['CAT'], b: ['DOG'], c: ['CARE'] });
		const src = idOf(b, 'CARE');
		const first = applyMove(b, req('a', 'steal', 'CRATER', src), T0 + 1, deps);
		const second = applyMove(first.board!, req('b', 'steal', 'TRACE', src), T0 + 2, deps);
		expect(first.result.ok).toBe(true);
		expect(second.result.ok).toBe(false);
		expect(second.result.message).toMatch(/changed hands/);
		expect(first.board!.players.b.score).toBe(3);
	});

	it('a retried request is applied once', () => {
		const b = board({ a: ['CAT'], b: ['CARE'] });
		const move = req('a', 'steal', 'CRATER', idOf(b, 'CARE'));
		const first = applyMove(b, move, T0 + 1, deps);
		const retry = applyMove(first.board!, move, T0 + 2, deps);
		expect(retry.board).toBeNull();
		expect(retry.result).toMatchObject({ ok: true, duplicate: true });
		expect(first.board!.players.a.score).toBe(9);
	});

	it('never mutates the input board', () => {
		const b = board();
		const before = JSON.stringify(b);
		applyMove(b, req('a', 'steal', 'CRATER', idOf(b, 'CARE')), T0, deps);
		expect(JSON.stringify(b)).toBe(before);
	});

	it('removing a player takes their words off the board', () => {
		const b = removeFromBoard(board(), 'b')!;
		expect(Object.values(b.words).map((w) => w.text)).toEqual(['CAT']);
		expect(b.players.b.removed).toBe(true);
		expect(rankBoard(b).map((r) => r.playerId)).toEqual(['a']);
	});
});

describe('ranking and qualification', () => {
	const scored = (rows: [string, number, number, number, number][]) => ({
		players: Object.fromEntries(rows.map(([id, score, longest, steals, at]) => [id, { name: id, score, longest, steals, lastScoreAt: at }]))
	});

	it('orders by score, longest word, steals, then who got there first', () => {
		const r = rankBoard(scored([['a', 10, 5, 0, 5], ['b', 12, 4, 0, 9], ['c', 10, 6, 0, 9], ['d', 10, 5, 1, 9], ['e', 10, 5, 0, 1]]));
		expect(r.map((e) => e.playerId)).toEqual(['b', 'c', 'd', 'e', 'a']);
		expect(r.map((e) => e.rank)).toEqual([1, 2, 3, 4, 5]);
	});

	it('top two advance; a full tie at the cutoff waits for an organiser', () => {
		const clear = roomResult('r', 1, rankBoard(scored([['a', 9, 3, 0, 1], ['b', 8, 3, 0, 1], ['c', 7, 3, 0, 1]])), false);
		expect(clear.advancing).toEqual(['a', 'b']);
		expect(clear.ties).toEqual([]);

		const tied = roomResult('r', 1, rankBoard(scored([['a', 9, 3, 0, 1], ['b', 8, 3, 0, 1], ['c', 8, 3, 0, 1]])), false);
		expect(tied.advancing).toEqual(['a']);
		expect(tied.ties).toEqual([{ candidates: ['b', 'c'], slots: 1, fromRank: 2, resolved: null }]);
		expect(roomDecided(tied)).toBe(false);

		expect(resolveTie(tied, 0, ['a'], false)).toMatch(/only from the tied/);
		expect(resolveTie(tied, 0, ['b', 'c'], false)).toMatch(/exactly 1/);
		const done = resolveTie(tied, 0, ['c'], false);
		expect(typeof done).toBe('object');
		expect((done as ReturnType<typeof roomResult>).advancing).toEqual(['a', 'c']);
	});

	it('a tie for 1st inside the top two is not a cutoff tie', () => {
		const r = roomResult('r', 1, rankBoard(scored([['a', 9, 3, 0, 1], ['b', 9, 3, 0, 1], ['c', 7, 3, 0, 1]])), false);
		expect(r.ties).toEqual([]);
		expect(r.advancing.sort()).toEqual(['a', 'b']);
	});

	it('the tie-breaks settle what they can before asking', () => {
		const r = roomResult('r', 1, rankBoard(scored([['a', 9, 3, 0, 1], ['b', 8, 3, 0, 5], ['c', 8, 3, 0, 2]])), false);
		expect(r.advancing).toEqual(['a', 'c']); // c reached 8 first
		expect(r.ties).toEqual([]);
	});

	it('the final decides 1st–3rd and flags each tied place', () => {
		const r = roomResult('f', 1, rankBoard(scored([['a', 9, 3, 0, 1], ['b', 9, 3, 0, 1], ['c', 7, 3, 0, 1], ['d', 6, 3, 0, 1], ['e', 6, 3, 0, 1]])), true);
		expect(r.ties.map((t) => [t.candidates, t.slots, t.fromRank])).toEqual([[['a', 'b'], 2, 1]]);
		expect(r.advancing).toEqual([]);
		const decided = resolveTie(r, 0, ['b', 'a'], true) as ReturnType<typeof roomResult>;
		expect(decided.advancing).toEqual(['b', 'a', 'c']);
	});

	it('small rooms advance everyone they have', () => {
		expect(roomResult('r', 1, rankBoard(scored([['a', 3, 3, 0, 1]])), false).advancing).toEqual(['a']);
		expect(roomResult('r', 1, rankBoard(scored([['a', 3, 3, 0, 1], ['b', 2, 2, 0, 1]])), true).advancing).toEqual(['a', 'b']);
	});

	it('145 players: 15 rooms → 30 qualifiers → 3 rooms → 6 finalists → 1 final room', () => {
		const random = rng(7);
		const ids = Array.from({ length: 145 }, (_, i) => `p${i}`);
		const play = (roster: string[], final: boolean) =>
			assignRooms(roster).map((members, i) => {
				const rows = members.map((id, j) => [id, Math.floor(random() * 40), 5, 0, j] as [string, number, number, number, number]);
				return roomResult(`r${i}`, i + 1, rankBoard(scored(rows)), final);
			});
		const r1 = play(ids, false);
		expect(r1).toHaveLength(15);
		expect(r1.every(roomDecided)).toBe(true); // lastScoreAt differs per player
		const q1 = nextRoster(r1);
		expect(q1).toHaveLength(30);
		expect(new Set(q1).size).toBe(30);
		const r2 = play(q1, false);
		expect(r2).toHaveLength(3);
		const q2 = nextRoster(r2);
		expect(q2).toHaveLength(6);
		const final = play(q2, true);
		expect(final).toHaveLength(1);
		expect(final[0].advancing).toHaveLength(3);
	});

	it('seeds 1st places before 2nd places for the next round', () => {
		const rooms = [
			roomResult('r1', 1, rankBoard(scored([['a', 9, 3, 0, 1], ['b', 8, 3, 0, 1]])), false),
			roomResult('r2', 2, rankBoard(scored([['c', 7, 3, 0, 1], ['d', 6, 3, 0, 1]])), false)
		];
		expect(nextRoster(rooms)).toEqual(['a', 'c', 'b', 'd']);
	});
});

describe('starter words', () => {
	const pools = {
		3: ['ANT', 'BAT', 'CAT', 'DOG', 'EEL', 'FOX', 'GNU', 'HEN', 'IMP', 'JAY', 'KIT', 'LAB'],
		4: ['BEAR', 'CRAB', 'DEER', 'DOVE', 'FROG', 'GOAT', 'HAWK', 'LION', 'MOLE', 'NEWT', 'ORCA', 'PUMA'],
		5: ['BISON', 'CAMEL', 'EAGLE', 'GECKO', 'HERON', 'HYENA', 'KOALA', 'LEMUR', 'MOOSE', 'OTTER', 'PANDA', 'RAVEN']
	};

	it('deals three balanced, unique words per player', () => {
		const ids = Array.from({ length: 11 }, (_, i) => `p${i}`);
		const dealt = dealStarters(ids, pools, rng(42));
		const all = Object.values(dealt).flat();
		expect(Object.keys(dealt)).toHaveLength(11);
		expect(all).toHaveLength(33);
		expect(new Set(all).size).toBe(33);
		for (const words of Object.values(dealt)) expect(words.map((w) => w.length)).toEqual([3, 4, 5]);
	});

	it('is deterministic for a seed and varies between seeds', () => {
		const ids = ['a', 'b', 'c'];
		expect(dealStarters(ids, pools, rng(1))).toEqual(dealStarters(ids, pools, rng(1)));
		expect(dealStarters(ids, pools, rng(1))).not.toEqual(dealStarters(ids, pools, rng(2)));
	});

	it('every player opens on the same score', () => {
		const ids = ['a', 'b', 'c', 'd'];
		const b = newBoard({ round: 1, roomId: 'r', number: 1, rules: DEFAULT_RULES, players: ids.map((id) => ({ id, name: id })), starters: dealStarters(ids, pools, rng(3)), now: 0 });
		expect(Object.values(b.players).map((p) => p.score)).toEqual([12, 12, 12, 12]);
		expect(Object.keys(b.words)).toHaveLength(12);
		expect(b.status).toBe('ready');
	});

	it('refuses to deal from too small a pool', () => {
		expect(() => dealStarters(['a', 'b'], { 3: ['ANT'], 4: ['BEAR', 'CRAB'], 5: ['BISON', 'CAMEL'] }, rng(1))).toThrow(/3-letter/);
	});
});
