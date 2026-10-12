/**
 * Flappy Bird physics, shared by the browser game and the server's score
 * check. Pure and deterministic: the game calls `step` with a fixed time step
 * and draws whatever state it leaves behind.
 *
 * World units: the play field is WORLD_H tall; its width depends on the
 * screen, but pipes are placed by distance travelled, so every device sees the
 * same course at the same pace.
 */

export const WORLD_H = 720;
/** Top edge of the ground. */
export const GROUND_Y = 636;
export const BIRD_R = 15;
/** Simulation step (seconds). */
export const STEP = 1 / 120;

const GRAVITY = 1900;
const FLAP_VY = -560;
const MAX_FALL = 980;

export const PIPE_W = 84;
export const PIPE_SPACING = 250;
/** Distance to the first pipe's left edge: a few calm seconds to settle in. */
export const FIRST_PIPE = 560;
const BASE_SPEED = 170;
export const MAX_SPEED = 240;
const SPEED_PER_POINT = 2.2;
const GAP_START = 200;
const GAP_MIN = 158;
const GAP_PER_POINT = 1.3;
const GAP_MARGIN = 72;
const MAX_GAP_SHIFT = 160;

export type Phase = 'ready' | 'playing' | 'dying' | 'over';
export type GameEvent = 'flap' | 'score' | 'hit' | 'ground';

export interface Pipe {
	/** Distance at which the pipe's left edge reaches the bird. */
	d: number;
	/** Centre of the gap. */
	gapY: number;
	gap: number;
	passed: boolean;
	/** Stable per-pipe value for decoration (leaves). */
	seed: number;
}

export interface World {
	phase: Phase;
	/** Seconds since the world was created (drives idle animation). */
	time: number;
	y: number;
	vy: number;
	rot: number;
	/** Gameplay distance since the first flap. */
	distance: number;
	/** Visual scroll for ground and backdrop; keeps moving before the first flap. */
	scroll: number;
	speed: number;
	score: number;
	pipes: Pipe[];
	flapAt: number;
	hitAt: number;
	rng: number;
}

export const READY_Y = WORLD_H * 0.42;

/** mulberry32: small seeded PRNG, so a world can be replayed in tests. */
function random(w: World): number {
	let t = (w.rng = (w.rng + 0x6d2b79f5) | 0);
	t = Math.imul(t ^ (t >>> 15), t | 1);
	t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
	return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

export function createWorld(seed = (Math.random() * 2 ** 32) >>> 0): World {
	return {
		phase: 'ready',
		time: 0,
		y: READY_Y,
		vy: 0,
		rot: 0,
		distance: 0,
		scroll: 0,
		speed: BASE_SPEED,
		score: 0,
		pipes: [],
		flapAt: -1,
		hitAt: -1,
		rng: seed | 0
	};
}

export const gapFor = (index: number) => Math.max(GAP_MIN, GAP_START - index * GAP_PER_POINT);

function addPipe(w: World) {
	const prev = w.pipes[w.pipes.length - 1];
	const index = prev ? Math.round((prev.d - FIRST_PIPE) / PIPE_SPACING) + 1 : 0;
	const gap = gapFor(index);
	const lo = GAP_MARGIN + gap / 2;
	const hi = GROUND_Y - GAP_MARGIN - gap / 2;
	let gapY = lo + random(w) * (hi - lo);
	if (prev) gapY = Math.min(prev.gapY + MAX_GAP_SHIFT, Math.max(prev.gapY - MAX_GAP_SHIFT, gapY));
	w.pipes.push({ d: FIRST_PIPE + index * PIPE_SPACING, gapY, gap, passed: false, seed: random(w) });
}

/** Keep pipes generated `ahead` units past the bird; drop those far behind. */
export function ensurePipes(w: World, ahead: number) {
	if (w.phase === 'ready') return;
	while (!w.pipes.length || w.pipes[w.pipes.length - 1].d < w.distance + ahead) addPipe(w);
	while (w.pipes.length && w.pipes[0].d + PIPE_W < w.distance - 600) w.pipes.shift();
}

/** Tap: starts the round from `ready`, otherwise flaps. Returns false when ignored. */
export function flap(w: World): boolean {
	if (w.phase === 'ready') w.phase = 'playing';
	else if (w.phase !== 'playing') return false;
	w.vy = FLAP_VY;
	w.flapAt = w.time;
	return true;
}

function circleHitsRect(cy: number, left: number, right: number, top: number, bottom: number) {
	const nx = Math.max(left, Math.min(0, right));
	const ny = Math.max(top, Math.min(cy, bottom));
	return nx * nx + (cy - ny) * (cy - ny) < BIRD_R * BIRD_R;
}

/** Advance one step. The bird sits at x = 0; pipes are relative to it. */
export function step(w: World, dt: number, events: GameEvent[] = []): GameEvent[] {
	w.time += dt;

	if (w.phase === 'ready') {
		w.y = READY_Y + Math.sin(w.time * 5.5) * 7;
		w.rot = 0;
		w.scroll += BASE_SPEED * dt;
		return events;
	}
	if (w.phase === 'over') return events;

	w.vy = Math.min(w.vy + GRAVITY * dt, MAX_FALL);
	w.y += w.vy * dt;

	if (w.phase === 'dying') {
		w.rot += (Math.PI / 2 - w.rot) * Math.min(1, dt * 9);
		if (w.y + BIRD_R >= GROUND_Y) {
			w.y = GROUND_Y - BIRD_R;
			w.phase = 'over';
			events.push('ground');
		}
		return events;
	}

	// Playing
	if (w.y < BIRD_R) {
		w.y = BIRD_R;
		w.vy = Math.max(w.vy, 0);
	}
	w.speed = Math.min(MAX_SPEED, BASE_SPEED + w.score * SPEED_PER_POINT);
	w.distance += w.speed * dt;
	w.scroll += w.speed * dt;

	// Nose up just after a flap, then tip into a dive as the bird falls.
	const target = w.time - w.flapAt < 0.26 ? -0.42 : Math.min(1.45, -0.42 + (Math.max(0, w.vy) / MAX_FALL) * 2.2);
	w.rot += (target - w.rot) * Math.min(1, dt * (target > w.rot ? 7 : 16));

	ensurePipes(w, 1400);
	for (const p of w.pipes) {
		const left = p.d - w.distance;
		const right = left + PIPE_W;
		if (left > BIRD_R) break;
		if (right < -BIRD_R) {
			if (!p.passed) {
				p.passed = true;
				w.score++;
				events.push('score');
			}
			continue;
		}
		if (!p.passed && w.distance >= p.d + PIPE_W / 2) {
			p.passed = true;
			w.score++;
			events.push('score');
		}
		const top = p.gapY - p.gap / 2;
		const bottom = p.gapY + p.gap / 2;
		if (circleHitsRect(w.y, left, right, -1e4, top) || circleHitsRect(w.y, left, right, bottom, GROUND_Y)) {
			w.phase = 'dying';
			w.hitAt = w.time;
			w.vy = Math.min(w.vy, -140);
			events.push('hit');
			return events;
		}
	}

	if (w.y + BIRD_R >= GROUND_Y) {
		w.y = GROUND_Y - BIRD_R;
		w.phase = 'over';
		w.hitAt = w.time;
		events.push('hit', 'ground');
	}
	return events;
}

/**
 * The highest score reachable in `ms` of flying: even at top speed the bird
 * can only pass pipes so fast. The server caps reported scores with this.
 */
export function maxScore(ms: number): number {
	const d = (MAX_SPEED * Math.max(0, ms)) / 1000;
	const first = FIRST_PIPE + PIPE_W / 2;
	return d < first ? 0 : Math.floor((d - first) / PIPE_SPACING) + 1;
}

/**
 * Autopilot for the big-screen demo. Inside a pipe it hugs the side of the
 * gap nearest the next one, so a big drop or climb is already under way.
 */
export function autopilot(w: World) {
	if (w.phase !== 'playing') return;
	const i = w.pipes.findIndex((p) => p.d + PIPE_W - w.distance > -BIRD_R);
	const cur = w.pipes[i];
	if (!cur) {
		if (w.y > WORLD_H * 0.45 && w.vy > -60) flap(w);
		return;
	}
	// A flap lifts the bird ~85 units above where it fired, so aim low in the gap.
	const lo = cur.gapY - cur.gap / 2 + BIRD_R + 88;
	const hi = cur.gapY + cur.gap / 2 - BIRD_R - 14;
	const next = w.pipes[i + 1];
	const inside = cur.d - w.distance < BIRD_R + 40;
	const want = inside && next ? next.gapY + next.gap * 0.14 : cur.gapY + cur.gap * 0.14;
	const target = Math.max(lo, Math.min(hi, want));
	if (w.y > target && w.vy > -60) flap(w);
}
