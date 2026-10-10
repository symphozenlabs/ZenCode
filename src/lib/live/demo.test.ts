import { describe, expect, it } from 'vitest';
import { demoSlides } from './demo';
import { sanitizeSlide, slideIssues } from './slides';
import { SLIDE_KINDS } from './types';

describe('demo session', () => {
	it('covers every slide kind', () => {
		expect(new Set(demoSlides().map((s) => s.kind))).toEqual(new Set(SLIDE_KINDS));
	});

	it('is ready to present and survives sanitising unchanged', () => {
		for (const slide of demoSlides()) {
			expect(slideIssues(slide), slide.kind).toEqual([]);
			expect(sanitizeSlide(slide)).toEqual(slide);
		}
	});
});
