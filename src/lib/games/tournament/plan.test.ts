import { describe, expect, it } from 'vitest';
import { advancing, fitElimination, fitFor, nextRoster, parseRules, planElimination, planFor, podiumOf, rankingOf } from './plan';
import type { PlannedStage } from './types';

const ok = (plan: PlannedStage[] | string) => {
	if (typeof plan === 'string') throw new Error(plan);
	return plan;
};

describe('elimination', () => {
	it('cuts evenly in ratio down to the finalists', () => {
		expect(ok(planElimination(100, 3, 10)).map((s) => s.players)).toEqual([100, 32, 10]);
		expect(ok(planElimination(300, 4, 10)).map((s) => s.players)).toEqual([300, 97, 31, 10]);
		expect(ok(planElimination(20, 2, 5)).map((s) => s.players)).toEqual([20, 5]);
	});

	it('marks the final and how many go through', () => {
		const plan = ok(planElimination(100, 3, 10));
		expect(plan[0]).toMatchObject({ stage: 1, advance: 32, final: false, sizes: [100] });
		expect(plan[2]).toMatchObject({ stage: 3, advance: 0, final: true, sizes: [10] });
	});

	it('refuses plans that cannot knock anyone out', () => {
		expect(planElimination(10, 3, 10)).toMatch(/Not enough players/);
		expect(planElimination(11, 3, 10)).toMatch(/Not enough players/); // 11 → 10 → 10
		expect(planElimination(1, 2, 3)).toMatch(/At least 2/);
		expect(planElimination(50, 6, 10)).toMatch(/1–5 stages/);
		expect(planElimination(50, 2, 2)).toMatch(/Between 3 and 100/);
	});

	it('a single stage is just a final', () => {
		expect(ok(planElimination(8, 1, 10))).toEqual([{ stage: 1, players: 8, sizes: [8], advance: 0, final: true }]);
	});

	it('plays fewer stages for a small crowd', () => {
		expect(fitElimination(100, 3, 10)!.length).toBe(3);
		expect(fitElimination(11, 3, 10)!.map((s) => s.players)).toEqual([11, 10]);
		expect(fitElimination(6, 3, 10)!.map((s) => s.players)).toEqual([6]);
		expect(fitElimination(1, 3, 10)).toBeNull();
	});
});

describe('rooms', () => {
	it('uses the allocation with Scribble limits', () => {
		const plan = ok(planFor({ format: 'rooms', maxPlayers: 32, stages: 2, roomSize: 8, advance: 2 }, 32));
		expect(plan.map((s) => [s.players, s.sizes.length])).toEqual([
			[32, 4],
			[8, 1]
		]);
		expect(planFor({ format: 'rooms', maxPlayers: 32, stages: 2, roomSize: 13, advance: 2 }, 32)).toMatch(/Rooms hold 2–12/);
	});

	it('shortens when fewer turn up', () => {
		expect(fitFor({ format: 'rooms', maxPlayers: 32, stages: 3, roomSize: 8, advance: 2 }, 5)!.length).toBe(1);
	});
});

describe('parseRules', () => {
	it('accepts form strings and checks the full house fits', () => {
		expect(parseRules({ format: 'elimination', maxPlayers: '100', stages: '3', finalists: '10' })).toEqual({ format: 'elimination', maxPlayers: 100, stages: 3, finalists: 10 });
		expect(parseRules({ format: 'rooms', maxPlayers: 32, stages: 2, roomSize: 8, advance: 2 })).toMatchObject({ format: 'rooms', roomSize: 8 });
	});
	it('explains what is wrong', () => {
		expect(parseRules({ format: 'elimination', maxPlayers: 10, stages: 3, finalists: 10 })).toMatch(/Not enough players/);
		expect(parseRules({ format: 'elimination', maxPlayers: 400, stages: 3, finalists: 10 })).toMatch(/At most 300/);
		expect(parseRules({ format: 'elimination', maxPlayers: 'x', stages: 3, finalists: 10 })).toMatch(/Enter the number/);
		expect(parseRules({ format: 'rooms', maxPlayers: 32, stages: 1, roomSize: 8, advance: 2 })).toMatch(/2–5 stages/);
	});
});

describe('results', () => {
	const members = [
		{ id: 'a', name: 'A' },
		{ id: 'b', name: 'B' },
		{ id: 'c', name: 'C' },
		{ id: 'd', name: 'D' }
	];

	it('keeps the game order, maps xp or score, and places missing members last', () => {
		const r = rankingOf(
			[
				{ id: 'b', name: 'B', xp: 300 },
				{ id: 'zzz', name: 'Stranger', xp: 999 },
				{ id: 'a', name: 'A', xp: 300 },
				{ id: 'c', name: 'C', xp: 100 }
			],
			members
		);
		expect(r.map((e) => [e.id, e.score, e.rank])).toEqual([
			['b', 300, 1],
			['a', 300, 1],
			['c', 100, 3],
			['d', 0, 4]
		]);
	});

	it('advances the first N in the game order and makes the podium', () => {
		const r = rankingOf(
			[
				{ id: 'a', name: 'A', score: 5 },
				{ id: 'b', name: 'B', score: 4 },
				{ id: 'c', name: 'C', score: 4 }
			],
			members
		);
		expect(advancing(r, 2)).toEqual(['a', 'b']);
		expect(advancing(r, 10)).toEqual(['a', 'b', 'c', 'd']);
		expect(podiumOf(r).map((p) => [p.name, p.rank])).toEqual([
			['A', 1],
			['B', 2],
			['C', 3]
		]);
	});

	it('orders the next roster by place across rooms', () => {
		expect(nextRoster([{ advancing: ['a1', 'a2'] }, { advancing: ['b1', 'b2'] }, { advancing: ['c1'] }])).toEqual(['a1', 'b1', 'c1', 'a2', 'b2']);
	});
});
