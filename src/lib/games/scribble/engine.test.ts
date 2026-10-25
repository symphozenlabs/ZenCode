import { describe, expect, it } from 'vitest';
import {
	dueAt,
	drawerPoints,
	editDistance,
	guessPoints,
	hintCount,
	hintTimes,
	isClose,
	isCorrect,
	isMasterpiece,
	maskOf,
	pickDrawer,
	pickHint,
	pickOptions,
	rankPlayers
} from './engine';
import { sanitizeOps } from './board';
import { IDLE_MS } from './types';
import { buildPool, cleanWord, parseCustomWords } from './words';
import { motionFor, timeline } from './life';

const seq = (...values: number[]) => {
	let i = 0;
	return () => values[i++ % values.length];
};

describe('guess matching', () => {
	it('ignores case, spaces and punctuation', () => {
		expect(isCorrect('Ice-Cream', 'ice cream')).toBe(true);
		expect(isCorrect('  ICECREAM ', 'ice cream')).toBe(true);
		expect(isCorrect('ice', 'ice cream')).toBe(false);
		expect(isCorrect('', 'ice cream')).toBe(false);
	});

	it('calls one typo close, never the answer itself', () => {
		expect(isClose('rockt', 'rocket')).toBe(true);
		expect(isClose('rocket', 'rocket')).toBe(false);
		expect(isClose('pocket', 'rocket')).toBe(true);
		expect(isClose('racket', 'rocket')).toBe(true);
		expect(isClose('rabbit', 'rocket')).toBe(false);
	});

	it('allows two typos on long words, none on very short ones', () => {
		expect(isClose('lighthuose', 'lighthouse')).toBe(true);
		expect(isClose('cot', 'cat')).toBe(false);
	});

	it('gives up on distance early', () => {
		expect(editDistance('a', 'abcdefgh', 2)).toBe(3);
		expect(editDistance('kitten', 'sitting')).toBe(3);
	});
});

describe('word mask and hints', () => {
	it('keeps spaces and revealed letters', () => {
		expect(maskOf('ice cream')).toBe('___ _____');
		expect(maskOf('ice cream', [0, 4])).toBe('i__ c____');
	});

	it('never gives away most of a short word', () => {
		expect(hintCount(3)).toBe(0);
		expect(hintCount(5)).toBe(1);
		expect(hintCount(8)).toBe(2);
		expect(hintCount(12)).toBe(3);
	});

	it('schedules hints in the later part of the turn', () => {
		expect(hintTimes(1000, 100, maskOf('rocket'))).toEqual([51_000, 76_000]);
		expect(hintTimes(0, 60, maskOf('cat'))).toEqual([]);
	});

	it('only reveals hidden letters', () => {
		expect(pickHint('a b', [0], seq(0))).toBe(2);
		expect(pickHint('ab', [0, 1])).toBeNull();
	});
});

describe('dueAt', () => {
	const drawing = {
		status: 'drawing' as const,
		phaseStartedAt: 0,
		phaseEndsAt: 80_000,
		drawSeconds: 80,
		mask: maskOf('rocket'),
		hintsShown: 0,
		inked: true,
		scoring: false
	};

	it('is the next hint, then the end of the turn', () => {
		expect(dueAt(drawing)).toBe(40_000);
		expect(dueAt({ ...drawing, hintsShown: 2 })).toBe(80_000);
	});

	it('checks on an artist who hasn’t drawn yet', () => {
		expect(dueAt({ ...drawing, inked: false })).toBe(IDLE_MS);
	});

	it('waits while a turn is being scored', () => {
		expect(dueAt({ ...drawing, status: 'reveal', scoring: true })).toBeNull();
		expect(dueAt({ ...drawing, status: 'reveal', phaseEndsAt: 5 })).toBe(5);
		expect(dueAt({ ...drawing, status: 'lobby' })).toBeNull();
	});
});

describe('points', () => {
	it('pays more for speed, harder words and streaks', () => {
		expect(guessPoints(60_000, 60_000, 'easy', 0)).toBe(300);
		expect(guessPoints(0, 60_000, 'easy', 0)).toBe(100);
		expect(guessPoints(30_000, 60_000, 'hard', 0)).toBe(300);
		expect(guessPoints(30_000, 60_000, 'easy', 2)).toBe(240);
		expect(guessPoints(30_000, 60_000, 'easy', 99)).toBe(300); // streak capped at +50%
	});

	it('pays the artist by the share who guessed', () => {
		expect(drawerPoints(0, 10, 'hard')).toBe(0);
		expect(drawerPoints(5, 10, 'easy')).toBe(190);
		expect(drawerPoints(12, 10, 'easy')).toBe(300);
		expect(isMasterpiece(4, 4)).toBe(true);
		expect(isMasterpiece(1, 1)).toBe(false);
	});
});

describe('turns', () => {
	const players = [
		{ id: 'b', joinedAt: 2 },
		{ id: 'a', joinedAt: 1 },
		{ id: 'c', joinedAt: 3 }
	];

	it('lets everyone draw once, in join order, before anyone draws twice', () => {
		let drawn: string[] = [];
		let last: string | null = null;
		const order: string[] = [];
		for (let i = 0; i < 4; i++) {
			const pick: { id: string; drawnIds: string[] } = pickDrawer(players, drawn, last)!;
			order.push(pick.id);
			drawn = pick.drawnIds;
			last = pick.id;
		}
		expect(order).toEqual(['a', 'b', 'c', 'a']);
	});

	it('never starts a new cycle with the artist who just drew', () => {
		expect(pickDrawer(players, ['a', 'b', 'c'], 'a')?.id).toBe('b');
		expect(pickDrawer([players[0]], [], null)).toBeNull();
	});

	it('offers one word per difficulty, skipping used ones', () => {
		const pool = buildPool(['everyday']);
		const options = pickOptions(pool, ['cat']);
		expect(options.map((o) => o.difficulty)).toEqual(['easy', 'medium', 'hard']);
		expect(options.map((o) => o.word)).not.toContain('cat');
	});

	it('repeats words once the pool runs dry', () => {
		const pool = parseCustomWords('one, two, three');
		expect(pickOptions(pool, ['one', 'two', 'three'])).toHaveLength(3);
	});

	it('ranks ties together and remembers the last rank', () => {
		const p = (id: string, score: number, joinedAt: number) => ({ id, name: id, score, joinedAt, streak: 0, guessed: 0, drew: 0 });
		const board = rankPlayers([p('a', 100, 1), p('b', 300, 2), p('c', 100, 3)], [{ id: 'a', name: 'a', score: 0, rank: 1, prevRank: null }]);
		expect(board.map((e) => [e.id, e.rank, e.prevRank])).toEqual([
			['b', 1, null],
			['a', 2, 1],
			['c', 2, null]
		]);
	});
});

describe('words', () => {
	it('cleans host words', () => {
		expect(cleanWord('  Pitch-Deck!! ')).toBe('pitchdeck');
		expect(cleanWord('Café  au lait')).toBe('cafe au lait');
		expect(cleanWord('x')).toBeNull();
		expect(parseCustomWords('a1, A1\nbig dog;')).toEqual([
			{ w: 'a1', d: 'easy' },
			{ w: 'big dog', d: 'hard' }
		]);
	});
});

describe('sanitizeOps', () => {
	it('clamps coordinates and keeps well-formed ops', () => {
		expect(sanitizeOps([{ t: 's', i: 1, c: 3, w: 2, p: [-5, 10.4, 900, 700] }, { t: 'u', i: 1 }, { t: 'c' }])).toEqual([
			{ t: 's', i: 1, c: 3, w: 2, p: [0, 10, 800, 600] },
			{ t: 'u', i: 1 },
			{ t: 'c' }
		]);
	});

	it('rejects anything malformed', () => {
		expect(sanitizeOps([])).toBeNull();
		expect(sanitizeOps([{ t: 's', i: 1, c: 0, w: 0, p: [1] }])).toBeNull();
		expect(sanitizeOps([{ t: 'x' }])).toBeNull();
		expect(sanitizeOps([{ t: 's', i: 1, c: 0, w: 0, p: Array(2402).fill(1) }])).toBeNull();
	});
});

describe('drawings come to life', () => {
	it('moves each drawing the way its word would', () => {
		expect(motionFor('rocket')).toBe('launch');
		expect(motionFor('Hot Air Balloon')).toBe('float');
		expect(motionFor('auto rickshaw')).toBe('drive');
		expect(motionFor('cricket bat')).toBe('bounce'); // not a bat that flies off
		expect(motionFor('rubber duck debugging')).toBe('swim');
		expect(motionFor('sun')).toBe('spin');
		expect(motionFor('fireflies')).toBe('dance');
	});

	it('starts and lands exactly where it was drawn', () => {
		const space = { left: 500, right: 500, top: 300, bottom: 300, width: 200, height: 150 };
		for (const motion of ['launch', 'fly', 'swim', 'drive', 'bounce', 'float', 'spin', 'shake', 'dance'] as const) {
			const { keyframes } = timeline(motion, space);
			const first = keyframes[0];
			const last = keyframes[keyframes.length - 1];
			expect(first.offset).toBe(0);
			expect(last.offset).toBe(1);
			expect(first.transform).toBe('translate(0.0px, 0.0px) rotate(0.0deg) scale(1.000, 1.000)');
			expect(last.transform).toMatch(/^translate\(0\.0px, 0\.0px\) rotate\(-?\d+(\.0)?deg\) scale\(1\.000, 1\.000\)$/);
			expect(Number.parseFloat(String(last.transform).split('rotate(')[1]) % 360).toBe(0);
			const offsets = keyframes.map((k) => k.offset as number);
			expect([...offsets].sort((a, b) => a - b)).toEqual(offsets);
		}
	});

	it('jumps from edge to edge out of sight', () => {
		const { keyframes } = timeline('drive', { left: 500, right: 500, top: 300, bottom: 300, width: 200, height: 150 });
		expect(keyframes.some((k) => k.opacity === 0)).toBe(true);
	});
});
