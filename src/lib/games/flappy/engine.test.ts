import { describe, expect, it } from 'vitest';
import { BIRD_R, GROUND_Y, STEP, autopilot, createWorld, flap, maxScore, step, type GameEvent } from './engine';

function fly(seed: number, seconds: number, pilot = true, radius?: number) {
	const w = createWorld(seed, radius);
	flap(w);
	const events: GameEvent[] = [];
	for (let t = 0; t < seconds && w.phase === 'playing'; t += STEP) {
		if (pilot) autopilot(w);
		step(w, STEP, events);
	}
	return { w, events };
}

describe('flappy engine', () => {
	it('waits in ready until the first flap', () => {
		const w = createWorld(1);
		for (let i = 0; i < 600; i++) step(w, STEP);
		expect(w.phase).toBe('ready');
		expect(w.distance).toBe(0);
		expect(w.pipes).toHaveLength(0);
	});

	it('falls to the ground without input', () => {
		const { w, events } = fly(2, 10, false);
		expect(w.phase).toBe('over');
		expect(w.y).toBe(GROUND_Y - BIRD_R);
		expect(w.score).toBe(0);
		expect(events).toContain('ground');
	});

	it('is deterministic for a seed', () => {
		const a = fly(7, 40).w;
		const b = fly(7, 40).w;
		expect(a.score).toBe(b.score);
		expect(a.distance).toBe(b.distance);
	});

	it('is passable: the autopilot clears many pipes', () => {
		for (const seed of [3, 11, 42, 99]) expect(fly(seed, 120).w.score).toBeGreaterThan(25);
	});

	it('is passable with the bigger Symba hitbox', () => {
		for (const seed of [3, 11, 42, 99]) expect(fly(seed, 120, true, 16).w.score).toBeGreaterThan(20);
	});

	it('never scores faster than maxScore allows', () => {
		const w = createWorld(5);
		flap(w);
		let t = 0;
		while (w.phase === 'playing' && t < 120) {
			autopilot(w);
			step(w, STEP);
			t += STEP;
			expect(w.score).toBeLessThanOrEqual(maxScore(t * 1000));
		}
	});

	it('cannot score at all in the first two seconds', () => {
		expect(maxScore(2000)).toBe(0);
		expect(maxScore(-1)).toBe(0);
	});

	it('ignores flaps once the bird has hit something', () => {
		const { w } = fly(2, 10, false);
		expect(flap(w)).toBe(false);
	});
});
