import { describe, expect, it } from 'vitest';
import { createSlide } from '$lib/live/slides';
import type { Slide, SlideOf } from '$lib/live/types';
import { buildLeaderboard, rankOf } from './ranking';
import { lineupAccuracy, normalizeAnswer, numberAccuracy, scoreResponse, speedFactor } from './scoring';

function slide<K extends Slide['kind']>(kind: K, patch: (s: SlideOf<K>) => void): Slide {
	const s = createSlide(kind) as SlideOf<K>;
	s.timeLimit = 20;
	s.maxPoints = 1000;
	patch(s);
	return s as Slide;
}

describe('speedFactor', () => {
	it('is 1 at the start, 0.5 at the limit, linear between', () => {
		expect(speedFactor(0, 20_000)).toBe(1);
		expect(speedFactor(10_000, 20_000)).toBe(0.75);
		expect(speedFactor(20_000, 20_000)).toBe(0.5);
	});
	it('clamps out-of-range times and handles untimed slides', () => {
		expect(speedFactor(-500, 20_000)).toBe(1);
		expect(speedFactor(99_000, 20_000)).toBe(0.5);
		expect(speedFactor(5_000, 0)).toBe(1);
	});
});

describe('select_answer', () => {
	const s = slide('select_answer', (x) => (x.config.correct = [x.config.options[1].id]));
	const [a, b] = s.kind === 'select_answer' ? s.config.options.map((o) => o.id) : [];

	it('speed mode: max * (1 - 0.5 * t / T) for a correct answer', () => {
		expect(scoreResponse(s, { input: 'tap', ids: [b] }, 0, 'speed')).toEqual({ correct: true, points: 1000 });
		expect(scoreResponse(s, { input: 'tap', ids: [b] }, 5_000, 'speed')).toEqual({ correct: true, points: 875 });
		expect(scoreResponse(s, { input: 'tap', ids: [b] }, 20_000, 'speed')).toEqual({ correct: true, points: 500 });
	});
	it('equal mode: full points regardless of time', () => {
		expect(scoreResponse(s, { input: 'tap', ids: [b] }, 19_000, 'equal').points).toBe(1000);
	});
	it('wrong answers score 0', () => {
		expect(scoreResponse(s, { input: 'tap', ids: [a] }, 0, 'speed')).toEqual({ correct: false, points: 0 });
	});
	it('multiple correct options need the exact set', () => {
		const m = slide('select_answer', (x) => (x.config.correct = [x.config.options[0].id, x.config.options[2].id]));
		const ids = m.kind === 'select_answer' ? m.config.options.map((o) => o.id) : [];
		expect(scoreResponse(m, { input: 'tap', ids: [ids[0], ids[2]] }, 0, 'equal').correct).toBe(true);
		expect(scoreResponse(m, { input: 'tap', ids: [ids[2], ids[0]] }, 0, 'equal').correct).toBe(true);
		expect(scoreResponse(m, { input: 'tap', ids: [ids[0]] }, 0, 'equal').correct).toBe(false);
		expect(scoreResponse(m, { input: 'tap', ids: [ids[0], ids[1], ids[2]] }, 0, 'equal').correct).toBe(false);
	});
});

describe('type_answer', () => {
	const s = slide('type_answer', (x) => (x.config.accepted = ['New Delhi', 'Delhi']));
	it('matches case-insensitively with trimmed, collapsed spaces', () => {
		expect(normalizeAnswer('  NEW   delhi ')).toBe('new delhi');
		expect(scoreResponse(s, { input: 'text', texts: ['  new   DELHI '] }, 0, 'equal')).toEqual({ correct: true, points: 1000 });
		expect(scoreResponse(s, { input: 'text', texts: ['Mumbai'] }, 0, 'equal').correct).toBe(false);
		expect(scoreResponse(s, { input: 'text', texts: [''] }, 0, 'equal').correct).toBe(false);
	});
});

describe('pick_number', () => {
	const s = slide('pick_number', (x) => (x.config = { min: 0, max: 100, step: 1, correct: 40 }));
	it('scores max * (1 - |guess - answer| / (max - min))', () => {
		expect(numberAccuracy(40, 40, 0, 100)).toBe(1);
		expect(scoreResponse(s, { input: 'number', values: [40] }, 0, 'equal')).toEqual({ correct: true, points: 1000 });
		expect(scoreResponse(s, { input: 'number', values: [50] }, 0, 'equal')).toEqual({ correct: false, points: 900 });
		expect(scoreResponse(s, { input: 'number', values: [100] }, 0, 'equal').points).toBe(400);
	});
	it('then applies the speed factor in speed mode', () => {
		expect(scoreResponse(s, { input: 'number', values: [50] }, 10_000, 'speed').points).toBe(675); // 1000 * 0.9 * 0.75
	});
});

describe('lineup', () => {
	it('gives per-item partial credit 1 - distance / (n - 1), averaged', () => {
		expect(lineupAccuracy(['a', 'b', 'c', 'd'], ['a', 'b', 'c', 'd'])).toBe(1);
		expect(lineupAccuracy(['d', 'c', 'b', 'a'], ['a', 'b', 'c', 'd'])).toBeCloseTo((0 + 2 / 3 + 2 / 3 + 0) / 4);
		expect(lineupAccuracy(['b', 'a', 'c', 'd'], ['a', 'b', 'c', 'd'])).toBeCloseTo((2 / 3 + 2 / 3 + 1 + 1) / 4);
	});
	it('multiplies by max points and ignores speed', () => {
		const s = slide('lineup', (x) => (x.config.items = ['a', 'b', 'c', 'd'].map((id) => ({ id, text: id }))));
		expect(scoreResponse(s, { input: 'order', ids: ['a', 'b', 'c', 'd'] }, 19_000, 'speed')).toEqual({ correct: true, points: 1000 });
		expect(scoreResponse(s, { input: 'order', ids: ['b', 'a', 'c', 'd'] }, 0, 'speed')).toEqual({ correct: false, points: 833 });
	});
});

it('unscored kinds never score', () => {
	const s = slide('multiple_choice', () => {});
	expect(scoreResponse(s, { input: 'tap', ids: ['x'] }, 0, 'speed')).toEqual({ correct: null, points: 0 });
});

describe('ranking aggregation', () => {
	const p = (id: string, score: number, joinedAt: number) => ({ id, nickname: id, avatar: 'fox', score, joinedAt });

	it('shares ranks on ties (1, 2, 2, 4)', () => {
		const ranks = rankOf([p('a', 300, 1), p('b', 200, 2), p('c', 200, 3), p('d', 100, 4)], (x) => x.score);
		expect([...ranks.entries()]).toEqual([
			['a', 1],
			['b', 2],
			['c', 2],
			['d', 4]
		]);
	});

	it('reports previous rank, points gained and sorts by rank', () => {
		// Before the round: a 1000, b 900, c 0. Round: c +1000, b +0, a +500.
		const board = buildLeaderboard(
			[p('a', 1500, 1), p('b', 900, 2), p('c', 1000, 3)],
			new Map([
				['a', 500],
				['c', 1000]
			])
		);
		expect(board.map((e) => [e.id, e.rank, e.prevRank, e.gained])).toEqual([
			['a', 1, 1, 500],
			['c', 2, 3, 1000],
			['b', 3, 2, 0]
		]);
	});

	it('handles everyone on zero', () => {
		const board = buildLeaderboard([p('a', 0, 1), p('b', 0, 2)], new Map());
		expect(board.map((e) => e.rank)).toEqual([1, 1]);
	});
});
