import { describe, expect, it } from 'vitest';
import { HARD_ROOM_LIMIT, assignRooms, describeAllocation, roomCount, roomSizes } from './allocation';

const tally = (sizes: number[]) => {
	const m: Record<number, number> = {};
	for (const s of sizes) m[s] = (m[s] ?? 0) + 1;
	return m;
};

describe('room allocation', () => {
	it.each([
		[160, 16, { 10: 16 }],
		[145, 15, { 10: 10, 9: 5 }],
		[143, 13, { 11: 13 }],
		[146, 15, { 10: 11, 9: 4 }],
		[134, 13, { 11: 4, 10: 9 }],
		[30, 3, { 10: 3 }],
		[6, 1, { 6: 1 }]
	])('%i participants → %i rooms', (n, rooms, dist) => {
		expect(roomCount(n)).toBe(rooms);
		expect(tally(roomSizes(n))).toEqual(dist);
	});

	it('handles zero and one participant', () => {
		expect(roomSizes(0)).toEqual([]);
		expect(assignRooms([])).toEqual([]);
		expect(roomSizes(1)).toEqual([1]);
	});

	it('uses N/10 rooms of 10 for exact multiples', () => {
		for (const n of [10, 20, 50, 100, 200, 1000]) expect(roomSizes(n)).toEqual(Array(n / 10).fill(10));
	});

	it('follows the policy for every remainder 1–9', () => {
		for (let n = 1; n <= 1000; n++) {
			const r = n % 10;
			const expected = r === 0 ? n / 10 : r >= 5 ? Math.ceil(n / 10) : Math.ceil(n / 11);
			expect(roomCount(n), `n=${n}`).toBe(expected);
		}
	});

	it('always sums to N, stays balanced and within limits', () => {
		for (let n = 1; n <= 1000; n++) {
			const sizes = roomSizes(n);
			expect(sizes.reduce((a, b) => a + b, 0)).toBe(n);
			expect(Math.max(...sizes) - Math.min(...sizes)).toBeLessThanOrEqual(1);
			expect(Math.max(...sizes)).toBeLessThanOrEqual(11);
			expect(Math.max(...sizes)).toBeLessThanOrEqual(HARD_ROOM_LIMIT);
		}
	});

	it('assigns every participant exactly once, matching the room sizes', () => {
		for (const n of [1, 9, 11, 21, 134, 143, 145, 146, 160, 999]) {
			const ids = Array.from({ length: n }, (_, i) => `p${i}`);
			const rooms = assignRooms(ids);
			const flat = rooms.flat();
			expect(flat).toHaveLength(n);
			expect(new Set(flat).size).toBe(n);
			expect(rooms.map((r) => r.length)).toEqual(roomSizes(n));
		}
	});

	it('is deterministic and spreads neighbours apart', () => {
		const ids = Array.from({ length: 30 }, (_, i) => `p${i}`);
		expect(assignRooms(ids)).toEqual(assignRooms(ids));
		const rooms = assignRooms(ids);
		expect(rooms[0].slice(0, 2)).toEqual(['p0', 'p3']);
		expect(rooms[1][0]).toBe('p1');
	});

	it('rejects invalid counts and describes allocations', () => {
		expect(() => roomCount(-1)).toThrow();
		expect(() => roomCount(2.5)).toThrow();
		expect(describeAllocation(145)).toBe('10 rooms × 10, 5 rooms × 9');
		expect(describeAllocation(0)).toBe('No rooms');
	});
});
