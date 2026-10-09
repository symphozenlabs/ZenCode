/**
 * Server-side scoring. Pure functions: the hub passes server timestamps only,
 * never anything a client measured or calculated.
 */
import { normalizeAnswer } from '$lib/live/slides';
import type { ResponseValue, ScoringMode, Slide } from '$lib/live/types';

export { normalizeAnswer };

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));

/** 1 at the instant responses open, 0.5 at the time limit. */
export function speedFactor(elapsedMs: number, timeLimitMs: number): number {
	if (!(timeLimitMs > 0)) return 1;
	return 1 - 0.5 * clamp01(elapsedMs / timeLimitMs);
}

/** pick_number accuracy: 1 - |guess - answer| / (max - min). */
export function numberAccuracy(guess: number, answer: number, min: number, max: number): number {
	const span = max - min;
	if (!(span > 0)) return guess === answer ? 1 : 0;
	return clamp01(1 - Math.abs(guess - answer) / span);
}

/** lineup: per item 1 - distance / (n - 1), averaged across items. */
export function lineupAccuracy(order: string[], key: string[]): number {
	const n = key.length;
	if (n < 2) return 1;
	const pos = new Map(order.map((id, i) => [id, i]));
	let sum = 0;
	key.forEach((id, correctIndex) => {
		const at = pos.get(id);
		if (at !== undefined) sum += 1 - Math.abs(at - correctIndex) / (n - 1);
	});
	return clamp01(sum / n);
}

export interface Scored {
	/** null = unscored slide kind. */
	correct: boolean | null;
	points: number;
}

/**
 * Score one (already validated) response. `elapsedMs` is server time from
 * responses opening to receipt.
 */
export function scoreResponse(slide: Slide, value: ResponseValue, elapsedMs: number, mode: ScoringMode): Scored {
	const max = slide.maxPoints;
	const speed = mode === 'speed' ? speedFactor(elapsedMs, slide.timeLimit * 1000) : 1;

	switch (slide.kind) {
		case 'select_answer': {
			if (value.input !== 'tap') return { correct: false, points: 0 };
			const picked = new Set(value.ids);
			const key = new Set(slide.config.correct);
			const correct = picked.size === key.size && [...picked].every((id) => key.has(id));
			return { correct, points: correct ? Math.round(max * speed) : 0 };
		}
		case 'type_answer': {
			if (value.input !== 'text') return { correct: false, points: 0 };
			const answer = normalizeAnswer(value.texts[0] ?? '');
			const correct = !!answer && slide.config.accepted.some((a) => normalizeAnswer(a) === answer);
			return { correct, points: correct ? Math.round(max * speed) : 0 };
		}
		case 'pick_number': {
			if (value.input !== 'number') return { correct: false, points: 0 };
			const c = slide.config;
			const accuracy = numberAccuracy(value.values[0], c.correct, c.min, c.max);
			return { correct: value.values[0] === c.correct, points: Math.round(max * accuracy * speed) };
		}
		case 'lineup': {
			if (value.input !== 'order') return { correct: false, points: 0 };
			const key = slide.config.items.map((i) => i.id);
			const accuracy = lineupAccuracy(value.ids, key);
			return { correct: accuracy === 1, points: Math.round(max * accuracy) };
		}
		default:
			return { correct: null, points: 0 };
	}
}
