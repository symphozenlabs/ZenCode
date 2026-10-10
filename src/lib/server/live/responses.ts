import { normalizeAnswer, publicSlide } from '$lib/live/slides';
import type { NumberSeries, ResponseValue, Slide, SlideResults, StoredResponse, TextGroup } from '$lib/live/types';
import { maskProfanity } from './profanity';

const MAX_TEXT = { short: 40, long: 280 };

/**
 * Validate an untrusted response against the slide. Returns a clean value,
 * or null if it doesn't fit the slide's input.
 */
export function validateResponse(slide: Slide, raw: unknown): ResponseValue | null {
	if (!raw || typeof raw !== 'object') return null;
	const v = raw as Record<string, unknown>;
	const pub = publicSlide(slide);
	if (v.input !== pub.input) return null;

	switch (pub.input) {
		case 'tap': {
			if (!Array.isArray(v.ids)) return null;
			const valid = new Set(pub.options.map((o) => o.id));
			const ids = [...new Set(v.ids)];
			if (!ids.length || !ids.every((id): id is string => typeof id === 'string' && valid.has(id))) return null;
			if (!pub.multi && ids.length !== 1) return null;
			return { input: 'tap', ids };
		}
		case 'text': {
			if (!Array.isArray(v.texts)) return null;
			const max = pub.long ? MAX_TEXT.long : MAX_TEXT.short;
			const texts = v.texts
				.filter((t): t is string => typeof t === 'string')
				.map((t) => t.replace(/[\p{C}]/gu, '').replace(/\s+/g, ' ').trim())
				.filter(Boolean);
			if (!texts.length || texts.length > pub.maxEntries || texts.some((t) => t.length > max)) return null;
			return { input: 'text', texts };
		}
		case 'number': {
			if (!Array.isArray(v.values) || v.values.length !== pub.numbers.length) return null;
			const values: number[] = [];
			for (let i = 0; i < pub.numbers.length; i++) {
				const n = v.values[i];
				const spec = pub.numbers[i];
				if (typeof n !== 'number' || !Number.isFinite(n) || n < spec.min || n > spec.max) return null;
				values.push(n);
			}
			return { input: 'number', values };
		}
		case 'order': {
			if (!Array.isArray(v.ids)) return null;
			const valid = pub.options.map((o) => o.id);
			const ids = v.ids.filter((id): id is string => typeof id === 'string');
			if (ids.length !== valid.length || new Set(ids).size !== ids.length || !ids.every((id) => valid.includes(id))) return null;
			return { input: 'order', ids };
		}
		default:
			return null;
	}
}

/** Live aggregate for the presenter: tap slides. */
export function tallyTap(slide: Slide, values: ResponseValue[]) {
	const counts: Record<string, number> = Object.fromEntries(publicSlide(slide).options.map((o) => [o.id, 0]));
	for (const v of values) if (v.input === 'tap') for (const id of v.ids) if (id in counts) counts[id]++;
	return { input: 'tap' as const, counts, total: values.length };
}

/** Most text groups sent to the presenter (a cloud or wall can't show more). */
export const MAX_TEXT_GROUPS = 80;
/** Histogram buckets for free-range number sliders. */
export const NUMBER_BINS = 20;

/** Text slides: merge identical answers; keep the most popular, then the newest. */
export function tallyText(responses: StoredResponse[], mask: boolean) {
	const groups = new Map<string, TextGroup>();
	for (const r of responses) {
		if (r.value.input !== 'text') continue;
		for (const raw of r.value.texts) {
			const key = normalizeAnswer(raw);
			if (!key) continue;
			const g = groups.get(key);
			if (g) {
				g.count++;
				g.at = Math.min(g.at, r.receivedAt);
			} else groups.set(key, { key, text: mask ? maskProfanity(raw) : raw, count: 1, at: r.receivedAt });
		}
	}
	const list = [...groups.values()].sort((a, b) => b.count - a.count || b.at - a.at).slice(0, MAX_TEXT_GROUPS);
	return { input: 'text' as const, groups: list, total: responses.length };
}

/** Number slides: one histogram + mean/median per slider. */
export function tallyNumbers(slide: Slide, values: ResponseValue[]) {
	const specs = publicSlide(slide).numbers;
	const series: NumberSeries[] = specs.map((spec, i) => {
		const integer = slide.kind === 'scales';
		const nBins = integer ? Math.round(spec.max - spec.min) + 1 : NUMBER_BINS;
		const bins = new Array<number>(nBins).fill(0);
		const nums: number[] = [];
		for (const v of values) {
			if (v.input !== 'number') continue;
			const n = v.values[i];
			if (typeof n !== 'number') continue;
			nums.push(n);
			const at = integer ? Math.round(n - spec.min) : Math.floor(((n - spec.min) / (spec.max - spec.min)) * nBins);
			bins[Math.min(nBins - 1, Math.max(0, at))]++;
		}
		nums.sort((a, b) => a - b);
		const count = nums.length;
		const mean = count ? nums.reduce((a, b) => a + b, 0) / count : null;
		const median = count ? (count % 2 ? nums[(count - 1) / 2] : (nums[count / 2 - 1] + nums[count / 2]) / 2) : null;
		return { id: spec.id, bins, mean, median, count };
	});
	return { input: 'number' as const, series, total: values.length };
}

/** Order slides: average position per item (lower = ranked higher). */
export function tallyOrder(slide: Slide, values: ResponseValue[]) {
	const ids = publicSlide(slide).options.map((o) => o.id);
	const sums = new Map(ids.map((id) => [id, 0]));
	let n = 0;
	for (const v of values) {
		if (v.input !== 'order') continue;
		n++;
		v.ids.forEach((id, pos) => sums.has(id) && sums.set(id, sums.get(id)! + pos));
	}
	const items = ids.map((id, i) => ({ id, avg: n ? sums.get(id)! / n : i }));
	return { input: 'order' as const, items, total: values.length };
}

/** The presenter's live aggregate for any slide, or null for Q&A. */
export function tally(slide: Slide, responses: StoredResponse[], mask: boolean): SlideResults | null {
	const values = responses.map((r) => r.value);
	switch (publicSlide(slide).input) {
		case 'tap':
			return tallyTap(slide, values);
		case 'text':
			return tallyText(responses, mask);
		case 'number':
			return tallyNumbers(slide, values);
		case 'order':
			return tallyOrder(slide, values);
		default:
			return null;
	}
}
