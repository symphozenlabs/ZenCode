/**
 * Live sessions — shared data model (client + server).
 *
 * A session is an ordered list of slides. Every slide kind maps onto one of
 * four participant inputs (tap / text / number / order) plus a scored flag,
 * so the phone UI and the server only implement four response shapes.
 */

export const QUIZ_KINDS = ['select_answer', 'type_answer', 'pick_number', 'lineup'] as const;
export const QUESTION_KINDS = [
	'multiple_choice',
	'this_or_that',
	'traffic_lights',
	'truth_or_lie',
	'word_cloud',
	'open_ended',
	'scales',
	'guess_number',
	'ranking',
	'qa'
] as const;
export const SLIDE_KINDS = [...QUIZ_KINDS, ...QUESTION_KINDS] as const;

export type QuizKind = (typeof QUIZ_KINDS)[number];
export type QuestionKind = (typeof QUESTION_KINDS)[number];
export type SlideKind = (typeof SLIDE_KINDS)[number];

/** The four participant input components. `none` = no answer (Q&A slide). */
export type InputKind = 'tap' | 'text' | 'number' | 'order' | 'none';

export interface Option {
	id: string;
	text: string;
}

export interface SlideConfigMap {
	select_answer: { options: Option[]; correct: string[] };
	type_answer: { accepted: string[] };
	pick_number: { min: number; max: number; step: number; correct: number };
	/** `items` is stored in the correct order; participants get a shuffle. */
	lineup: { items: Option[] };
	multiple_choice: { options: Option[]; multiple: boolean };
	this_or_that: { options: Option[] };
	traffic_lights: Record<string, never>;
	truth_or_lie: { isTrue: boolean };
	word_cloud: { maxEntries: number };
	open_ended: Record<string, never>;
	scales: { statements: Option[]; min: number; max: number; minLabel: string; maxLabel: string };
	guess_number: { min: number; max: number; step: number; answer: number | null };
	ranking: { items: Option[] };
	qa: Record<string, never>;
}

interface SlideBase<K extends SlideKind> {
	id: string;
	kind: K;
	question: string;
	/** Seconds. Quiz slides only; 0 = untimed for question slides. */
	timeLimit: number;
	/** Quiz slides only. */
	maxPoints: number;
	config: SlideConfigMap[K];
}

export type Slide = { [K in SlideKind]: SlideBase<K> }[SlideKind];
export type SlideOf<K extends SlideKind> = SlideBase<K>;

export type ScoringMode = 'speed' | 'equal';

export interface SessionSettings {
	scoring: ScoringMode;
	reactions: boolean;
	qa: boolean;
	moderation: boolean;
	profanityFilter: boolean;
}

export type SessionStatus = 'draft' | 'lobby' | 'live' | 'ended';

/**
 * Per-slide run state. `ready`: question shown, not accepting yet (timed
 * quiz slides wait for the host to start the timer). `open`: accepting.
 * `closed`: time's up or closed early.
 */
export type SlidePhase = 'ready' | 'open' | 'closed';

export interface SlideRun {
	phase: SlidePhase;
	/** Server timestamps (ms). Set when responses open; endsAt only if timed. */
	startedAt: number | null;
	endsAt: number | null;
	revealed: boolean;
	showResults: boolean;
}

export type LiveView = 'slide' | 'leaderboard';

/** Where a running session is. Persisted so a restart or refresh resumes. */
export interface LiveState {
	index: number;
	view: LiveView;
	runs: Record<string, SlideRun>;
	/** Slide whose points were added last — drives "gained" and rank arrows. */
	lastRevealed: string | null;
}

export interface LiveSession {
	id: string;
	title: string;
	status: SessionStatus;
	/** Present once the host starts the session. */
	live?: LiveState | null;
	/** Six digits while the session is open (lobby/live); null otherwise. */
	joinCode: string | null;
	settings: SessionSettings;
	slides: Slide[];
	createdBy: string;
	createdAt: number;
	updatedAt: number;
	startedAt: number | null;
	endedAt: number | null;
}

/** Card data for the session list (no slide bodies). */
export interface SessionSummary {
	id: string;
	title: string;
	status: SessionStatus;
	joinCode: string | null;
	slideCount: number;
	updatedAt: number;
}

/** What every client is allowed to know about a participant. */
export interface PublicParticipant {
	id: string;
	nickname: string;
	avatar: string;
	score: number;
	connected: boolean;
	joinedAt: number;
}

/** Server-side record; `secret` lets a phone resume after a refresh. */
export interface StoredParticipant extends Omit<PublicParticipant, 'connected'> {
	secret: string;
}

/** The four response shapes, one per input component. */
export type ResponseValue =
	| { input: 'tap'; ids: string[] }
	| { input: 'text'; texts: string[] }
	| { input: 'number'; values: number[] }
	| { input: 'order'; ids: string[] };

/** One response per participant per slide; id = `${slideId}_${participantId}`. */
export interface StoredResponse {
	id: string;
	slideId: string;
	participantId: string;
	value: ResponseValue;
	receivedAt: number;
	/** Server-measured time from responses opening to receipt. */
	elapsedMs: number;
	/** null for unscored slides. */
	correct: boolean | null;
	points: number;
}

/** Same answer from several people, merged (case and spacing ignored). */
export interface TextGroup {
	key: string;
	text: string;
	count: number;
	/** Server time the first of these arrived — keeps cloud/wall layout stable. */
	at: number;
}

/** One slider's spread: `bins` buckets across min..max (one per value on scales). */
export interface NumberSeries {
	id: string;
	bins: number[];
	mean: number | null;
	median: number | null;
	count: number;
}

/** Live aggregate for the presenter, one shape per participant input. */
export type SlideResults =
	| { input: 'tap'; counts: Record<string, number>; total: number }
	| { input: 'text'; groups: TextGroup[]; total: number }
	| { input: 'number'; series: NumberSeries[]; total: number }
	/** `avg` is the mean 0-based position each item was given. */
	| { input: 'order'; items: { id: string; avg: number }[]; total: number };

export interface LeaderboardEntry {
	id: string;
	nickname: string;
	avatar: string;
	score: number;
	/** Points earned on the most recently revealed slide. */
	gained: number;
	rank: number;
	/** Rank before that slide's points were added. */
	prevRank: number;
}

export const DEFAULT_SETTINGS: SessionSettings = {
	scoring: 'speed',
	reactions: true,
	qa: true,
	moderation: false,
	profanityFilter: true
};

export const LIMITS = {
	title: 80,
	question: 200,
	optionText: 80,
	minOptions: 2,
	maxOptions: 5,
	minOrderItems: 3,
	maxOrderItems: 8,
	maxStatements: 5,
	maxAccepted: 10,
	maxSlides: 100,
	nickname: 20,
	timeLimits: [5, 10, 15, 20, 30, 45, 60, 90, 120] as readonly number[],
	points: [0, 500, 1000, 2000] as readonly number[]
} as const;
