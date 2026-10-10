import { describe, expect, it } from 'vitest';
import { createSlide, duplicateSlide, sanitizeSlide, slideIssues } from './slides';
import { SLIDE_KINDS } from './types';

describe('createSlide', () => {
	it('creates a structurally valid default for every kind', () => {
		for (const kind of SLIDE_KINDS) {
			const slide = createSlide(kind);
			expect(sanitizeSlide(slide)).toEqual(slide);
		}
	});

	it('times and scores quiz slides only', () => {
		expect(createSlide('select_answer')).toMatchObject({ timeLimit: 20, maxPoints: 1000 });
		expect(createSlide('multiple_choice')).toMatchObject({ timeLimit: 0, maxPoints: 0 });
	});
});

describe('sanitizeSlide', () => {
	it('rejects unknown kinds and non-objects', () => {
		expect(sanitizeSlide(null)).toBeNull();
		expect(sanitizeSlide('x')).toBeNull();
		expect(sanitizeSlide({ kind: 'nope' })).toBeNull();
	});

	it('caps options at 5 and drops correct ids that are not options', () => {
		const s = sanitizeSlide({
			kind: 'select_answer',
			question: 'Q',
			config: {
				options: Array.from({ length: 8 }, (_, i) => ({ id: `o${i}`, text: `T${i}` })),
				correct: ['o1', 'o7', 'ghost', 'o1']
			}
		});
		expect(s?.kind).toBe('select_answer');
		if (s?.kind !== 'select_answer') return;
		expect(s.config.options).toHaveLength(5);
		expect(s.config.correct).toEqual(['o1']);
	});

	it('pads to the minimum number of options and items', () => {
		const tap = sanitizeSlide({ kind: 'multiple_choice', config: { options: [] } });
		const order = sanitizeSlide({ kind: 'lineup', config: { items: [{ id: 'a', text: 'A' }] } });
		expect(tap?.kind === 'multiple_choice' && tap.config.options.length).toBe(2);
		expect(order?.kind === 'lineup' && order.config.items.length).toBe(3);
	});

	it('truncates long text and clamps numbers', () => {
		const s = sanitizeSlide({ kind: 'pick_number', question: 'x'.repeat(500), timeLimit: 9999, maxPoints: -5, config: { min: 10, max: 5, correct: 99 } });
		expect(s?.question).toHaveLength(200);
		expect(s?.timeLimit).toBe(300);
		expect(s?.maxPoints).toBe(0);
		if (s?.kind !== 'pick_number') return;
		expect(s.config.max).toBeGreaterThan(s.config.min);
		expect(s.config.correct).toBeLessThanOrEqual(s.config.max);
	});

	it('replaces duplicate or malformed option ids', () => {
		const s = sanitizeSlide({ kind: 'ranking', config: { items: [{ id: 'a', text: '1' }, { id: 'a', text: '2' }, { id: '<script>', text: '3' }] } });
		if (s?.kind !== 'ranking') throw new Error('kind');
		const ids = s.config.items.map((i) => i.id);
		expect(new Set(ids).size).toBe(3);
		expect(ids.every((id) => /^[a-z0-9]+$/i.test(id))).toBe(true);
	});

	it('forces this_or_that to exactly two options', () => {
		const s = sanitizeSlide({ kind: 'this_or_that', config: { options: [{ id: 'a', text: 'A' }, { id: 'b', text: 'B' }, { id: 'c', text: 'C' }] } });
		expect(s?.kind === 'this_or_that' && s.config.options.length).toBe(2);
	});
});

describe('slideIssues', () => {
	it('flags a missing question, blank options and no correct answer', () => {
		const s = createSlide('select_answer');
		if (s.kind !== 'select_answer') throw new Error('kind');
		s.config.correct = [];
		expect(slideIssues(s)).toEqual(['Add a question.', 'Fill in or remove empty options.', 'Mark at least one correct option.']);
	});

	it('passes a complete slide', () => {
		const s = createSlide('this_or_that');
		if (s.kind !== 'this_or_that') throw new Error('kind');
		s.question = 'Tea or coffee?';
		s.config.options[0].text = 'Tea';
		s.config.options[1].text = 'Coffee';
		expect(slideIssues(s)).toEqual([]);
	});
});

it('duplicateSlide gives a new id and a deep copy', () => {
	const a = createSlide('lineup');
	const b = duplicateSlide(a);
	expect(b.id).not.toBe(a.id);
	if (b.kind !== 'lineup' || a.kind !== 'lineup') throw new Error('kind');
	b.config.items[0].text = 'changed';
	expect(a.config.items[0].text).toBe('');
});
