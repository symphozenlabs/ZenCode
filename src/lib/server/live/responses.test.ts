import { describe, expect, it } from 'vitest';
import { createSlide } from '$lib/live/slides';
import type { ResponseValue, Slide, SlideOf, StoredResponse } from '$lib/live/types';
import { tally } from './responses';

function slide<K extends Slide['kind']>(kind: K, patch: (s: SlideOf<K>) => void = () => {}): Slide {
	const s = createSlide(kind) as SlideOf<K>;
	patch(s);
	return s as Slide;
}

let n = 0;
const resp = (value: ResponseValue, receivedAt = ++n): StoredResponse => ({
	id: `r${n}`,
	slideId: 's',
	participantId: `p${n}`,
	value,
	receivedAt,
	elapsedMs: 0,
	correct: null,
	points: 0
});

describe('tally', () => {
	it('merges text answers ignoring case and spacing, most popular first', () => {
		const s = slide('word_cloud', (x) => (x.config.maxEntries = 2));
		const r = tally(s, [resp({ input: 'text', texts: ['Svelte', 'fast'] }), resp({ input: 'text', texts: [' svelte '] })], false);
		expect(r).toMatchObject({ input: 'text', total: 2 });
		if (r?.input !== 'text') throw new Error();
		expect(r.groups.map((g) => [g.text, g.count])).toEqual([
			['Svelte', 2],
			['fast', 1]
		]);
	});

	it('masks profanity on the big screen when the filter is on', () => {
		const s = slide('open_ended');
		const r = tally(s, [resp({ input: 'text', texts: ['this is shit'] })], true);
		if (r?.input !== 'text') throw new Error();
		expect(r.groups[0].text).not.toContain('shit');
	});

	it('bins numbers and reports mean and median', () => {
		const s = slide('guess_number', (x) => Object.assign(x.config, { min: 0, max: 100, step: 1 }));
		const r = tally(s, [10, 20, 90].map((v) => resp({ input: 'number', values: [v] })), false);
		if (r?.input !== 'number') throw new Error();
		const [series] = r.series;
		expect(series.count).toBe(3);
		expect(series.mean).toBe(40);
		expect(series.median).toBe(20);
		expect(series.bins.reduce((a, b) => a + b, 0)).toBe(3);
		expect(series.bins[18]).toBe(1); // 90 lands in the 90–95 bucket
	});

	it('gives scales one bucket per scale value', () => {
		const s = slide('scales', (x) => Object.assign(x.config, { min: 1, max: 5 }));
		const r = tally(s, [resp({ input: 'number', values: [5] }), resp({ input: 'number', values: [1] })], false);
		if (r?.input !== 'number') throw new Error();
		expect(r.series[0].bins).toEqual([1, 0, 0, 0, 1]);
	});

	it('averages positions for order slides', () => {
		const s = slide('ranking', (x) => (x.config.items = [{ id: 'a', text: 'A' }, { id: 'b', text: 'B' }, { id: 'c', text: 'C' }]));
		const r = tally(s, [resp({ input: 'order', ids: ['a', 'b', 'c'] }), resp({ input: 'order', ids: ['b', 'a', 'c'] })], false);
		if (r?.input !== 'order') throw new Error();
		expect(Object.fromEntries(r.items.map((i) => [i.id, i.avg]))).toEqual({ a: 0.5, b: 0.5, c: 2 });
	});

	it('has nothing to tally on Q&A', () => {
		expect(tally(slide('qa'), [], false)).toBeNull();
	});
});
