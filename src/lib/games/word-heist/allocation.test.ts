import { describe, expect, it } from 'vitest';
import { assignRooms, autoAdvance, describeSizes, fitStages, maxParticipants, planStages, solveShape, splitSizes, type Stage } from './allocation';
import { MAX_PLAYERS, ROOM_MAX } from './types';

const ok = (plan: Stage[] | string) => {
	if (typeof plan === 'string') throw new Error(plan);
	return plan;
};
const shape = (plan: Stage[]) => plan.map((s) => [s.players, s.sizes.length]);

describe('rooms', () => {
	it('splits evenly, largest first', () => {
		expect(splitSizes(25, 3)).toEqual([9, 8, 8]);
		expect(splitSizes(24, 2)).toEqual([12, 12]);
		expect(splitSizes(0, 0)).toEqual([]);
	});

	it('deals an ordered roster round-robin, so neighbours land in different rooms', () => {
		const ids = Array.from({ length: 25 }, (_, i) => i);
		const rooms = assignRooms(ids, 3);
		expect(rooms.map((r) => r.length)).toEqual(splitSizes(25, 3));
		expect(rooms[0].slice(0, 3)).toEqual([0, 3, 6]);
		expect(assignRooms(ids, 3)).toEqual(rooms);
	});

	it('describes room sizes', () => {
		expect(describeSizes([12, 12, 11])).toBe('2 rooms × 12, 1 room × 11');
		expect(describeSizes([])).toBe('No rooms');
	});
});

describe('stages', () => {
	it('a game is one room of up to 12', () => {
		expect(shape(ok(planStages(12, 1, 0)))).toEqual([[12, 1]]);
		expect(planStages(13, 1, 0)).toMatch(/at most 12/);
		expect(planStages(1, 1, 0)).toMatch(/At least 2/);
	});

	it('every stage before the final has rooms of at most 12, and the final is one room', () => {
		const plan = ok(planStages(432, 3, 2));
		expect(shape(plan)).toEqual([
			[432, 36],
			[72, 6],
			[12, 1]
		]);
		expect(plan[0].sizes.every((n) => n === 12)).toBe(true);
		expect(plan.map((s) => s.final)).toEqual([false, false, true]);
	});

	it('explains why a plan cannot work', () => {
		expect(planStages(200, 2, 2)).toMatch(/final would have 34/);
		expect(planStages(6, 3, 2)).toMatch(/Not enough players/);
		expect(planStages(50, 7, 1)).toMatch(/1–5 stages/);
		expect(planStages(50, 2, 12)).toMatch(/Between 1 and 11/);
	});

	it('max participants fits exactly, and one more does not', () => {
		for (let stages = 2; stages <= 4; stages++) {
			for (let advance = 1; advance <= 6; advance++) {
				const max = maxParticipants(stages, advance);
				if (!max) {
					expect(typeof planStages(ROOM_MAX * 2, stages, advance)).toBe('string');
					continue;
				}
				expect(typeof planStages(max, stages, advance), `${stages}/${advance}`).not.toBe('string');
				if (max < MAX_PLAYERS) expect(typeof planStages(max + 1, stages, advance), `${stages}/${advance}`).toBe('string');
			}
		}
		expect(maxParticipants(2, 2)).toBe(72);
		expect(maxParticipants(3, 2)).toBe(432);
		expect(maxParticipants(2, 7)).toBe(0); // two rooms × 7 > 12 in the final
		expect(maxParticipants(5, 2)).toBe(MAX_PLAYERS);
	});

	it('works out how many go through from participants and stages', () => {
		expect(autoAdvance(100, 3)).toBe(4); // 9 rooms → 36 → 3 rooms → 12 in the final
		expect(shape(ok(planStages(100, 3, 4)))).toEqual([
			[100, 9],
			[36, 3],
			[12, 1]
		]);
		expect(autoAdvance(72, 2)).toBe(2);
		expect(autoAdvance(1000, 3)).toBe(1);
		expect(autoAdvance(1000, 2)).toBeNull(); // 84 rooms can't fit one final
		expect(autoAdvance(8, 1)).toBe(0);
	});

	it('follows the room size the organiser chose (2–15)', () => {
		expect(shape(ok(planStages(225, 3, 3, 15)))).toEqual([
			[225, 15],
			[45, 3],
			[9, 1]
		]);
		expect(maxParticipants(3, 2, 15)).toBe(15 * Math.floor((15 * Math.floor(15 / 2)) / 2)); // 15 → 105 → 780
		expect(maxParticipants(2, 2, 6)).toBe(18); // 3 rooms of 6 → 6 in the final
		expect(maxParticipants(2, 6, 6)).toBe(0); // can't send a whole room through
		expect(planStages(20, 1, 0, 15)).toMatch(/at most 15/);
		expect(planStages(10, 2, 1, 16)).toMatch(/2–15/);
		expect(planStages(4, 2, 1, 2)).not.toBeTypeOf('string'); // pairs: 2 rooms of 2 → final of 2
		expect(autoAdvance(60, 2, 15)).toBe(3); // 4 rooms of 15 → 12 in the final
	});

	it('fills only the boxes the organiser left free, up or down', () => {
		const start = { participants: 432, stages: 3, roomSize: 12, advance: 2 };
		expect(solveShape(start, new Set())).toEqual(start);
		// Stages set: free participants follow — fewer stages take fewer, more take more.
		expect(solveShape({ ...start, stages: 2 }, new Set(['stages']))).toEqual({ ...start, stages: 2, participants: 72 });
		expect(solveShape({ ...start, stages: 4 }, new Set(['stages']))).toEqual({ ...start, stages: 4, participants: MAX_PLAYERS });
		// Participants and stages set, and the rest already works: nothing moves.
		const set = { participants: 100, stages: 3, roomSize: 12, advance: 2 };
		expect(solveShape(set, new Set(['participants', 'stages']))).toEqual(set);
		// Only participants set: the fewest other boxes change (here just the stages).
		expect(solveShape({ ...start, participants: 1000, stages: 2 }, new Set(['participants']))).toEqual({ participants: 1000, stages: 4, roomSize: 12, advance: 2 });
	});

	it("says which of the organiser's boxes clash instead of changing them", () => {
		const out = solveShape({ participants: 1000, stages: 2, roomSize: 12, advance: 2 }, new Set(['participants', 'stages', 'roomSize']));
		expect(out).toMatch(/^1000 participants, 2 stages and rooms of 12 can't work together \(too many players: the final would have 168/);
		expect(out).toMatch(/Change one of them, or unlock it so it can adjust\.$/);
	});

	it('a smaller crowd than planned plays fewer stages', () => {
		expect(fitStages(200, 3, 2)!.length).toBe(3);
		expect(fitStages(9, 3, 2)!.length).toBe(2); // 2 rooms (5, 4) → 4 in the final
		expect(fitStages(5, 3, 2)!.length).toBe(1); // straight to the final
		expect(fitStages(30, 3, 6)).not.toBeNull();
		expect(fitStages(13, 1, 0)).toBeNull();
	});
});
