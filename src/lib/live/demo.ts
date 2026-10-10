/**
 * A ready-to-present session with one slide of every kind — for rehearsing
 * the live flow (and checking a deployment) without building slides by hand.
 */
import { createSlide } from './slides';
import type { Option, Slide, SlideConfigMap, SlideKind } from './types';

const opts = (...texts: string[]): Option[] => texts.map((text, i) => ({ id: `o${i + 1}`, text }));

function slide<K extends SlideKind>(kind: K, question: string, config: SlideConfigMap[K], timeLimit?: number): Slide {
	const base = createSlide(kind);
	return { ...base, question, config, timeLimit: timeLimit ?? base.timeLimit } as Slide;
}

export const DEMO_TITLE = 'Demo — every slide type';

export function demoSlides(): Slide[] {
	return [
		slide('traffic_lights', 'Warm-up: how is your connection right now?', {}),
		slide('select_answer', 'Which language does SvelteKit compile components from?', { options: opts('Svelte', 'Elm', 'Dart', 'Haskell'), correct: ['o1'] }, 20),
		slide('type_answer', 'What does the “S” in HTTPS stand for?', { accepted: ['Secure', 'Secured'] }, 20),
		slide('pick_number', 'In what year was the first website published?', { min: 1980, max: 2000, step: 1, correct: 1991 }, 20),
		slide('lineup', 'Order these from smallest to largest.', { items: opts('Bit', 'Byte', 'Kilobyte', 'Megabyte') }, 30),
		slide('multiple_choice', 'Which track are you most excited about?', { options: opts('AI', 'Agritech', 'FinTech', 'Open innovation'), multiple: false }),
		slide('this_or_that', 'Tabs or spaces?', { options: opts('Tabs', 'Spaces') }),
		slide('truth_or_lie', 'The first computer bug was an actual moth.', { isTrue: true }),
		slide('word_cloud', 'One word to describe hackathons?', { maxEntries: 2 }),
		slide('open_ended', 'What would you build with 24 hours and unlimited coffee?', {}),
		slide('scales', 'Rate the following.', { statements: opts('I slept enough', 'I am ready to ship'), min: 1, max: 5, minLabel: 'Disagree', maxLabel: 'Agree' }),
		slide('guess_number', 'How many lines of code will your team write today?', { min: 0, max: 5000, step: 50, answer: null }),
		slide('ranking', 'Rank what matters most in a demo.', { items: opts('Working product', 'Clean UI', 'Clear pitch', 'Tech depth') }),
		slide('qa', '', {})
	];
}
