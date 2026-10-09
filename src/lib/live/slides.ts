import {
	LIMITS,
	QUIZ_KINDS,
	SLIDE_KINDS,
	type InputKind,
	type Option,
	type Slide,
	type SlideConfigMap,
	type SlideKind
} from './types';

export interface SlideMeta {
	label: string;
	description: string;
	group: 'quiz' | 'question';
	input: InputKind;
	scored: boolean;
}

export const SLIDE_META: Record<SlideKind, SlideMeta> = {
	select_answer: { label: 'Select answer', description: 'Pick the right option', group: 'quiz', input: 'tap', scored: true },
	type_answer: { label: 'Type answer', description: 'Type the right word', group: 'quiz', input: 'text', scored: true },
	pick_number: { label: 'Pick a number', description: 'Closest guess scores most', group: 'quiz', input: 'number', scored: true },
	lineup: { label: 'Line up', description: 'Put items in the right order', group: 'quiz', input: 'order', scored: true },
	multiple_choice: { label: 'Multiple choice', description: 'Vote and see a live chart', group: 'question', input: 'tap', scored: false },
	this_or_that: { label: 'This or that', description: 'Two options, one split bar', group: 'question', input: 'tap', scored: false },
	traffic_lights: { label: 'Traffic lights', description: 'Green, yellow or red check-in', group: 'question', input: 'tap', scored: false },
	truth_or_lie: { label: 'Truth or lie', description: 'Vote, then reveal', group: 'question', input: 'tap', scored: false },
	word_cloud: { label: 'Word cloud', description: 'Short answers, popular words grow', group: 'question', input: 'text', scored: false },
	open_ended: { label: 'Open ended', description: 'Full-sentence answers as cards', group: 'question', input: 'text', scored: false },
	scales: { label: 'Scales', description: 'Rate statements on a scale', group: 'question', input: 'number', scored: false },
	guess_number: { label: 'Guess a number', description: 'See the spread of estimates', group: 'question', input: 'number', scored: false },
	ranking: { label: 'Ranking', description: 'Order items, see the group ranking', group: 'question', input: 'order', scored: false },
	qa: { label: 'Q&A', description: 'Audience questions with upvotes', group: 'question', input: 'none', scored: false }
};

export const TRAFFIC_LIGHTS: Option[] = [
	{ id: 'green', text: 'All good' },
	{ id: 'yellow', text: 'Some doubts' },
	{ id: 'red', text: 'Lost' }
];
export const TRUTH_OPTIONS: Option[] = [
	{ id: 'true', text: 'Truth' },
	{ id: 'false', text: 'Lie' }
];

export const isQuiz = (kind: SlideKind) => (QUIZ_KINDS as readonly string[]).includes(kind);

/** Short non-secret id for slides and options. */
export function uid(): string {
	return Math.random().toString(36).slice(2, 10);
}

const opts = (...texts: string[]): Option[] => texts.map((text) => ({ id: uid(), text }));

export function defaultConfig<K extends SlideKind>(kind: K): SlideConfigMap[K] {
	const configs: { [P in SlideKind]: () => SlideConfigMap[P] } = {
		select_answer: () => {
			const options = opts('', '', '', '');
			return { options, correct: [options[0].id] };
		},
		type_answer: () => ({ accepted: [''] }),
		pick_number: () => ({ min: 0, max: 100, step: 1, correct: 50 }),
		lineup: () => ({ items: opts('', '', '') }),
		multiple_choice: () => ({ options: opts('', '', ''), multiple: false }),
		this_or_that: () => ({ options: opts('', '') }),
		traffic_lights: () => ({}),
		truth_or_lie: () => ({ isTrue: true }),
		word_cloud: () => ({ maxEntries: 1 }),
		open_ended: () => ({}),
		scales: () => ({ statements: opts(''), min: 1, max: 5, minLabel: 'Disagree', maxLabel: 'Agree' }),
		guess_number: () => ({ min: 0, max: 100, step: 1, answer: null }),
		ranking: () => ({ items: opts('', '', '') }),
		qa: () => ({})
	};
	return configs[kind]() as SlideConfigMap[K];
}

export function createSlide(kind: SlideKind): Slide {
	return {
		id: uid(),
		kind,
		question: '',
		timeLimit: isQuiz(kind) ? 20 : 0,
		maxPoints: isQuiz(kind) ? 1000 : 0,
		config: defaultConfig(kind)
	} as Slide;
}

export function duplicateSlide(slide: Slide): Slide {
	// JSON round-trip also unwraps Svelte state proxies
	const copy = JSON.parse(JSON.stringify(slide)) as Slide;
	copy.id = uid();
	return copy;
}

// ---------------------------------------------------------------------------
// What phones may see: the slide minus every answer key
// ---------------------------------------------------------------------------

export interface NumberInputSpec {
	id: string;
	label: string;
	min: number;
	max: number;
	step: number;
	minLabel?: string;
	maxLabel?: string;
}

export interface PublicSlide {
	id: string;
	kind: SlideKind;
	question: string;
	input: InputKind;
	scored: boolean;
	timeLimit: number;
	maxPoints: number;
	/** tap: choices. order: items, shuffled away from any answer order. */
	options: Option[];
	/** tap: more than one choice allowed. */
	multi: boolean;
	/** text: entries per person, and whether answers are sentences. */
	maxEntries: number;
	long: boolean;
	/** number: one slider (pick/guess) or one per statement (scales). */
	numbers: NumberInputSpec[];
}

/** Deterministic shuffle seeded by the slide id; never returns the input order. */
function shuffled<T>(list: T[], seed: string): T[] {
	if (list.length < 2) return [...list];
	let h = 2166136261;
	for (const ch of seed) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
	const rand = () => ((h = Math.imul(h ^ (h >>> 15), 2246822507) ^ Math.imul(h ^ (h >>> 13), 3266489909)) >>> 0) / 4294967296;
	const out = [...list];
	for (let i = out.length - 1; i > 0; i--) {
		const j = Math.floor(rand() * (i + 1));
		[out[i], out[j]] = [out[j], out[i]];
	}
	if (out.every((x, i) => x === list[i])) out.push(out.shift()!);
	return out;
}

export function publicSlide(slide: Slide): PublicSlide {
	const meta = SLIDE_META[slide.kind];
	const base: PublicSlide = {
		id: slide.id,
		kind: slide.kind,
		question: slide.question,
		input: meta.input,
		scored: meta.scored,
		timeLimit: slide.timeLimit,
		maxPoints: slide.maxPoints,
		options: [],
		multi: false,
		maxEntries: 1,
		long: false,
		numbers: []
	};
	switch (slide.kind) {
		case 'select_answer':
			return { ...base, options: slide.config.options, multi: slide.config.correct.length > 1 };
		case 'multiple_choice':
			return { ...base, options: slide.config.options, multi: slide.config.multiple };
		case 'this_or_that':
			return { ...base, options: slide.config.options };
		case 'traffic_lights':
			return { ...base, options: TRAFFIC_LIGHTS };
		case 'truth_or_lie':
			return { ...base, options: TRUTH_OPTIONS };
		case 'lineup':
		case 'ranking':
			return { ...base, options: shuffled(slide.config.items, slide.id) };
		case 'word_cloud':
			return { ...base, maxEntries: slide.config.maxEntries };
		case 'open_ended':
			return { ...base, long: true };
		case 'pick_number':
		case 'guess_number': {
			const { min, max, step } = slide.config;
			return { ...base, numbers: [{ id: 'value', label: slide.question, min, max, step }] };
		}
		case 'scales': {
			const { min, max, minLabel, maxLabel } = slide.config;
			return { ...base, numbers: slide.config.statements.map((s) => ({ id: s.id, label: s.text, min, max, step: 1, minLabel, maxLabel })) };
		}
		default:
			return base;
	}
}

/** Case-insensitive, trimmed, inner whitespace collapsed. */
export const normalizeAnswer = (s: string) => s.trim().replace(/\s+/g, ' ').toLowerCase();

/** Correct option ids to highlight after reveal (tap slides). */
export function correctIds(slide: Slide): string[] {
	if (slide.kind === 'select_answer') return slide.config.correct;
	if (slide.kind === 'truth_or_lie') return [slide.config.isTrue ? 'true' : 'false'];
	return [];
}

/** Slides whose answer can be revealed. */
export const hasAnswer = (slide: Slide) => isQuiz(slide.kind) || slide.kind === 'truth_or_lie' || (slide.kind === 'guess_number' && slide.config.answer != null);

// ---------------------------------------------------------------------------
// Sanitising untrusted input (server side, and the builder on load)
// ---------------------------------------------------------------------------

const str = (v: unknown, max: number) => (typeof v === 'string' ? v.slice(0, max) : '');
const num = (v: unknown, fallback: number) => (typeof v === 'number' && Number.isFinite(v) ? v : fallback);
const bool = (v: unknown, fallback: boolean) => (typeof v === 'boolean' ? v : fallback);
const idOf = (v: unknown) => (typeof v === 'string' && /^[a-z0-9]{1,16}$/i.test(v) ? v : uid());

function options(v: unknown, min: number, max: number): Option[] {
	const list = Array.isArray(v) ? v.slice(0, max) : [];
	const seen = new Set<string>();
	const out = list.map((o) => {
		let id = idOf((o as Option)?.id);
		if (seen.has(id)) id = uid();
		seen.add(id);
		return { id, text: str((o as Option)?.text, LIMITS.optionText) };
	});
	while (out.length < min) out.push({ id: uid(), text: '' });
	return out;
}

function range(c: Record<string, unknown>, d: { min: number; max: number; step: number }) {
	let min = num(c.min, d.min);
	let max = num(c.max, d.max);
	if (max <= min) max = min + 1;
	min = Math.max(-1e9, min);
	max = Math.min(1e9, max);
	const step = Math.min(Math.max(num(c.step, d.step), 0.001), max - min);
	return { min, max, step };
}

const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v));

/** Coerce anything into a structurally valid slide, or null if unusable. */
export function sanitizeSlide(input: unknown): Slide | null {
	if (!input || typeof input !== 'object') return null;
	const s = input as Record<string, unknown>;
	const kind = s.kind as SlideKind;
	if (!SLIDE_KINDS.includes(kind)) return null;
	const c = (s.config && typeof s.config === 'object' ? s.config : {}) as Record<string, unknown>;
	const quiz = isQuiz(kind);
	let config: SlideConfigMap[SlideKind];

	switch (kind) {
		case 'select_answer': {
			const o = options(c.options, LIMITS.minOptions, LIMITS.maxOptions);
			const ids = new Set(o.map((x) => x.id));
			const correct = (Array.isArray(c.correct) ? c.correct : []).filter((id): id is string => ids.has(id as string));
			config = { options: o, correct: [...new Set(correct)] };
			break;
		}
		case 'type_answer': {
			const accepted = (Array.isArray(c.accepted) ? c.accepted : []).slice(0, LIMITS.maxAccepted).map((a) => str(a, LIMITS.optionText));
			config = { accepted: accepted.length ? accepted : [''] };
			break;
		}
		case 'pick_number': {
			const r = range(c, { min: 0, max: 100, step: 1 });
			config = { ...r, correct: clamp(num(c.correct, r.min), r.min, r.max) };
			break;
		}
		case 'lineup':
		case 'ranking':
			config = { items: options(c.items, LIMITS.minOrderItems, LIMITS.maxOrderItems) };
			break;
		case 'multiple_choice':
			config = { options: options(c.options, LIMITS.minOptions, LIMITS.maxOptions), multiple: bool(c.multiple, false) };
			break;
		case 'this_or_that':
			config = { options: options(c.options, 2, 2) };
			break;
		case 'truth_or_lie':
			config = { isTrue: bool(c.isTrue, true) };
			break;
		case 'word_cloud':
			config = { maxEntries: clamp(Math.round(num(c.maxEntries, 1)), 1, 3) };
			break;
		case 'scales': {
			const min = clamp(Math.round(num(c.min, 1)), 0, 9);
			const max = clamp(Math.round(num(c.max, 5)), min + 1, 10);
			config = {
				statements: options(c.statements, 1, LIMITS.maxStatements),
				min,
				max,
				minLabel: str(c.minLabel, 24),
				maxLabel: str(c.maxLabel, 24)
			};
			break;
		}
		case 'guess_number': {
			const r = range(c, { min: 0, max: 100, step: 1 });
			const answer = c.answer == null || c.answer === '' ? null : clamp(num(c.answer, r.min), r.min, r.max);
			config = { ...r, answer };
			break;
		}
		default:
			config = {} as Record<string, never>;
	}

	const timeLimit = quiz ? clamp(Math.round(num(s.timeLimit, 20)), 5, 300) : clamp(Math.round(num(s.timeLimit, 0)), 0, 600);
	return {
		id: idOf(s.id),
		kind,
		question: str(s.question, LIMITS.question),
		timeLimit,
		maxPoints: quiz ? clamp(Math.round(num(s.maxPoints, 1000)), 0, 10000) : 0,
		config
	} as Slide;
}

/** Problems that block presenting a slide (shown in the builder). */
export function slideIssues(slide: Slide): string[] {
	const issues: string[] = [];
	if (slide.kind !== 'qa' && !slide.question.trim()) issues.push('Add a question.');
	const blank = (list: Option[]) => list.some((o) => !o.text.trim());
	switch (slide.kind) {
		case 'select_answer':
			if (blank(slide.config.options)) issues.push('Fill in or remove empty options.');
			if (!slide.config.correct.length) issues.push('Mark at least one correct option.');
			break;
		case 'type_answer':
			if (!slide.config.accepted.some((a) => a.trim())) issues.push('Add at least one accepted answer.');
			break;
		case 'multiple_choice':
		case 'this_or_that':
			if (blank(slide.config.options)) issues.push('Fill in or remove empty options.');
			break;
		case 'lineup':
		case 'ranking':
			if (blank(slide.config.items)) issues.push('Fill in or remove empty items.');
			break;
		case 'scales':
			if (blank(slide.config.statements)) issues.push('Fill in or remove empty statements.');
			break;
	}
	return issues;
}
