import { DEFAULT_ROOM_SIZE, MAX_PLAYERS, MAX_STAGES, ROOM_MAX, ROOM_MIN } from './types';

/**
 * Word Heist rooms and stages. Pure and deterministic: the same numbers
 * always give the same plan, and the same ordered roster always gives the
 * same rooms.
 *
 * A stage that isn't the last splits its players into the fewest rooms of at
 * most `roomSize` (never fewer than two), sizes differing by at most one; the
 * top `advance` of each room go through. The last stage is one final room of
 * at most `roomSize`. Every room of a qualifying stage needs more than
 * `advance` players, or nobody would be knocked out.
 */

export interface Stage {
	/** 1-based. */
	stage: number;
	players: number;
	/** Room sizes, largest first (sums to `players`). */
	sizes: number[];
	/** Players who go through from each room (0 in the final). */
	advance: number;
	final: boolean;
}

/** Room sizes for `n` players in `rooms` rooms, largest first. */
export function splitSizes(n: number, rooms: number): number[] {
	if (!rooms) return [];
	const base = Math.floor(n / rooms);
	return Array.from({ length: rooms }, (_, i) => base + (i < n % rooms ? 1 : 0));
}

/**
 * The stages for `n` players over exactly `stages` stages with `advance`
 * going through from each room, or a plain reason why that can't work.
 */
export function planStages(n: number, stages: number, advance: number, roomSize = DEFAULT_ROOM_SIZE): Stage[] | string {
	if (!Number.isInteger(roomSize) || roomSize < ROOM_MIN || roomSize > ROOM_MAX) return `Rooms hold ${ROOM_MIN}–${ROOM_MAX} players.`;
	if (!Number.isInteger(n) || n < 2) return 'At least 2 players are needed.';
	if (!Number.isInteger(stages) || stages < 1 || stages > MAX_STAGES) return `Choose 1–${MAX_STAGES} stages.`;
	if (stages > 1 && (!Number.isInteger(advance) || advance < 1 || advance >= roomSize)) return `Between 1 and ${roomSize - 1} players can go through from each room of ${roomSize}.`;
	const out: Stage[] = [];
	let players = n;
	for (let stage = 1; stage <= stages; stage++) {
		if (stage === stages) {
			if (players > roomSize) return stages === 1 ? `One room holds at most ${roomSize} players.` : `Too many players: the final would have ${players} (max ${roomSize}). Add a stage, send fewer through or allow bigger rooms.`;
			out.push({ stage, players, sizes: [players], advance: 0, final: true });
			break;
		}
		const rooms = Math.max(2, Math.ceil(players / roomSize));
		const sizes = splitSizes(players, rooms);
		if (sizes[sizes.length - 1] <= advance) return `Not enough players: stage ${stage} would have rooms of ${sizes[sizes.length - 1]}, but ${advance} go through from each. Use fewer stages or send fewer through.`;
		out.push({ stage, players, sizes, advance, final: false });
		players = rooms * advance;
	}
	return out;
}

/** Most players `stages` stages with `advance` going through can take (capped at MAX_PLAYERS). 0 if impossible. */
export function maxParticipants(stages: number, advance: number, roomSize = DEFAULT_ROOM_SIZE): number {
	if (stages > 1 && advance >= roomSize) return 0;
	let max = roomSize;
	for (let k = stages - 1; k >= 1; k--) {
		const rooms = Math.floor(max / advance);
		if (rooms < 2) return 0;
		max = rooms * roomSize;
		if (max >= MAX_PLAYERS) return MAX_PLAYERS;
	}
	return max;
}

/**
 * The most players that can go through from each room so `n` players fill
 * exactly `stages` stages (more go through → closer games), or null if none.
 */
export function autoAdvance(n: number, stages: number, roomSize = DEFAULT_ROOM_SIZE): number | null {
	if (stages === 1) return typeof planStages(n, 1, 0, roomSize) === 'string' ? null : 0;
	for (let a = roomSize - 1; a >= 1; a--) if (typeof planStages(n, stages, a, roomSize) !== 'string') return a;
	return null;
}

/**
 * The plan actually played with the players who turned up: `stages` if it
 * works, else as many fewer stages as needed (a small crowd goes straight to
 * the final). Null only if even one room can't hold them.
 */
export function fitStages(n: number, stages: number, advance: number, roomSize = DEFAULT_ROOM_SIZE): Stage[] | null {
	for (let s = Math.max(1, stages); s >= 1; s--) {
		const plan = planStages(n, s, advance, roomSize);
		if (typeof plan !== 'string') return plan;
	}
	return null;
}

/**
 * Deal an ordered roster into `rooms` rooms, round-robin: participant i goes
 * to room i mod k. This gives exactly splitSizes(N, k) and spreads neighbours
 * in the order — e.g. last round's top finishers — across different rooms.
 */
export function assignRooms<T>(ordered: readonly T[], rooms: number): T[][] {
	const out: T[][] = Array.from({ length: rooms }, () => []);
	ordered.forEach((p, i) => out[i % rooms].push(p));
	return out;
}

/** Human summary, e.g. "4 rooms × 12, 2 rooms × 11". */
export function describeSizes(sizes: readonly number[]): string {
	if (!sizes.length) return 'No rooms';
	const groups = new Map<number, number>();
	for (const s of sizes) groups.set(s, (groups.get(s) ?? 0) + 1);
	return [...groups.entries()].map(([size, count]) => `${count} room${count === 1 ? '' : 's'} × ${size}`).join(', ');
}

/**
 * A tournament for `n` players with rooms of up to `roomSize`: the stages
 * asked for if some number going through works, else the nearest number of
 * stages that does (more first). Null if no tournament can take them.
 */
export function fitTournament(n: number, stages: number, roomSize = DEFAULT_ROOM_SIZE): { stages: number; advance: number } | null {
	const order = [stages];
	for (let d = 1; d < MAX_STAGES; d++) order.push(stages + d, stages - d);
	for (const s of order) {
		if (s < 2 || s > MAX_STAGES) continue;
		const advance = autoAdvance(n, s, roomSize);
		if (advance) return { stages: s, advance };
	}
	return null;
}

export interface Shape {
	participants: number;
	stages: number;
	roomSize: number;
	advance: number;
}
export type ShapeKey = keyof Shape;

const SHAPE_LABELS: Record<ShapeKey, (s: Shape) => string> = {
	participants: (s) => `${s.participants} participants`,
	stages: (s) => `${s.stages} stages`,
	roomSize: (s) => `rooms of ${s.roomSize}`,
	advance: (s) => `${s.advance} going through`
};

/** Lexicographic order of two cost lists. */
function lessThan(a: number[], b: number[]) {
	const i = a.findIndex((x, j) => x !== b[j]);
	return i >= 0 && a[i] < b[i];
}

/** "a, b and c". */
const listOf = (items: string[]) => (items.length < 2 ? items.join('') : `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`);

/**
 * The organiser's boxes: the ones they set are `locked` and never change;
 * the rest are filled in so the plan works, changing as few as possible and
 * staying close to what they were. Unlocked participants become the most the
 * plan takes; with participants locked, the most players going through that
 * works is preferred. Returns the shape, or a plain reason naming the locked
 * boxes that can't work together.
 */
export function solveShape(current: Shape, locked: ReadonlySet<ShapeKey>): Shape | string {
	const range = (lo: number, hi: number) => Array.from({ length: hi - lo + 1 }, (_, i) => lo + i);
	const stagesList = locked.has('stages') ? [current.stages] : range(2, MAX_STAGES);
	const sizes = locked.has('roomSize') ? [current.roomSize] : range(ROOM_MIN, ROOM_MAX);
	let best: { shape: Shape; cost: number[] } | null = null;
	for (const stages of stagesList) {
		for (const roomSize of sizes) {
			for (const advance of locked.has('advance') ? [current.advance] : range(1, roomSize - 1)) {
				if (advance < 1 || advance >= roomSize) continue;
				let participants: number;
				if (locked.has('participants')) {
					participants = current.participants;
					if (typeof planStages(participants, stages, advance, roomSize) === 'string') continue;
				} else {
					participants = maxParticipants(stages, advance, roomSize);
					if (!participants) continue;
				}
				const cost = [
					Number(stages !== current.stages) + Number(roomSize !== current.roomSize) + Number(advance !== current.advance),
					Math.abs(stages - current.stages),
					Math.abs(roomSize - current.roomSize),
					locked.has('participants') ? -advance : Math.abs(advance - current.advance)
				];
				if (!best || lessThan(cost, best.cost)) {
					best = { shape: { participants, stages, roomSize, advance }, cost };
				}
			}
		}
	}
	if (best) return best.shape;
	const keys = (['participants', 'stages', 'roomSize', 'advance'] as const).filter((k) => locked.has(k));
	const why = planStages(current.participants, current.stages, current.advance, current.roomSize);
	return `${listOf(keys.map((k) => SHAPE_LABELS[k](current)))} can't work together${typeof why === 'string' ? ` (${why.replace(/\.$/, '').replace(/^./, (c) => c.toLowerCase())})` : ''}. Change one of them, or unlock it so it can adjust.`;
}
