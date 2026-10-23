/**
 * Word Heist room allocation. Pure and deterministic: the same participant
 * count always gives the same rooms, and the same ordered roster always gives
 * the same assignment.
 *
 * Policy for N participants (r = N mod 10):
 *   N = 0          → no rooms
 *   r = 0          → N / 10 rooms
 *   r = 5…9        → ceil(N / 10) rooms
 *   r = 1…4        → ceil(N / 11) rooms (so no room needs more than 11)
 * then participants are spread as evenly as possible: room sizes differ by at
 * most one, larger rooms first.
 * E.g. 134 → 13 rooms: 4 × 11 and 9 × 10.
 */

/** Never exceeded, even though normal allocation stays at 8–11. */
export const HARD_ROOM_LIMIT = 20;

export function roomCount(n: number): number {
	if (!Number.isInteger(n) || n < 0) throw new RangeError('Participant count must be a non-negative integer.');
	if (n === 0) return 0;
	const r = n % 10;
	if (r === 0) return n / 10;
	if (r >= 5) return Math.ceil(n / 10);
	return Math.ceil(n / 11);
}

/** Room sizes for N participants, largest first. Sums to N. */
export function roomSizes(n: number): number[] {
	const k = roomCount(n);
	if (!k) return [];
	const base = Math.floor(n / k);
	const extra = n % k;
	const sizes = Array.from({ length: k }, (_, i) => base + (i < extra ? 1 : 0));
	if (sizes.some((s) => s > HARD_ROOM_LIMIT)) throw new RangeError('Room size limit exceeded.');
	return sizes;
}

/**
 * Deal an ordered roster into rooms, round-robin: participant i goes to room
 * i mod k. This produces exactly roomSizes(N) (the first N mod k rooms get the
 * extra person) and spreads neighbours in the order — e.g. last round's top
 * finishers — across different rooms.
 */
export function assignRooms<T>(ordered: readonly T[]): T[][] {
	const k = roomCount(ordered.length);
	const rooms: T[][] = Array.from({ length: k }, () => []);
	ordered.forEach((p, i) => rooms[i % k].push(p));
	return rooms;
}

/** Human summary, e.g. "10 rooms × 10, 5 rooms × 9". */
export function describeAllocation(n: number): string {
	const sizes = roomSizes(n);
	if (!sizes.length) return 'No rooms';
	const groups = new Map<number, number>();
	for (const s of sizes) groups.set(s, (groups.get(s) ?? 0) + 1);
	return [...groups.entries()].map(([size, count]) => `${count} room${count === 1 ? '' : 's'} × ${size}`).join(', ');
}
