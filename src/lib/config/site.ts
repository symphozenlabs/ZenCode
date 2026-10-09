/**
 * Site configuration. Real event facts (dates, venue, prizes, sponsors,
 * capacity) are never hard-coded — admins set them in /admin/settings and
 * they live in Firestore at `config/site`. These defaults only describe the
 * format and deliberately leave every fact empty ("To be announced").
 */

export const EVENT_IDS = ['hackathon', 'pitch-fest'] as const;
export type EventId = (typeof EVENT_IDS)[number];

export interface Prize {
	place: string;
	reward: string;
}

export interface EventConfig {
	title: string;
	summary: string;
	description: string;
	/** ISO date (yyyy-mm-dd) or empty when not announced */
	startDate: string;
	endDate: string;
	/** Free text such as "24 hours" */
	duration: string;
	registrationOpen: boolean;
	/** ISO date or empty */
	registrationDeadline: string;
	/** Maximum active registrations; null = unlimited (not enforced by the forms) */
	capacity: number | null;
	teamMin: number;
	teamMax: number;
	tracks: string[];
	prizes: Prize[];
	rules: string[];
}

export interface ScheduleItem {
	id: string;
	day: string;
	time: string;
	title: string;
	event: EventId | 'general';
	location: string;
}

export interface Sponsor {
	name: string;
	url: string;
}

export interface SiteConfig {
	name: string;
	tagline: string;
	edition: string;
	venue: string;
	city: string;
	contactEmail: string;
	organizers: string[];
	sponsors: Sponsor[];
	schedule: ScheduleItem[];
	generalRules: string[];
	events: Record<EventId, EventConfig>;
}

export const DEFAULT_SITE_CONFIG: SiteConfig = {
	name: 'ZenCode',
	tagline: 'Code. Create. Compete.',
	edition: '',
	venue: '',
	city: '',
	contactEmail: '',
	organizers: [],
	sponsors: [],
	schedule: [],
	generalRules: [],
	events: {
		hackathon: {
			title: 'Hackathon',
			summary: 'Form a team, pick a track and ship a working product before the clock runs out.',
			description:
				'Teams take a problem from idea to working prototype within a fixed build window, then demo it to the judges.',
			startDate: '',
			endDate: '',
			duration: '',
			registrationOpen: true,
			registrationDeadline: '',
			capacity: null,
			teamMin: 3,
			teamMax: 4,
			tracks: [],
			prizes: [],
			rules: []
		},
		'pitch-fest': {
			title: 'Pitch Fest',
			summary: 'Pitch your startup idea on stage and defend it in front of a panel.',
			description:
				'Founders and teams present an idea, its market and its plan in a timed pitch, followed by questions from the panel.',
			startDate: '',
			endDate: '',
			duration: '',
			registrationOpen: true,
			registrationDeadline: '',
			capacity: null,
			teamMin: 2,
			teamMax: 2,
			tracks: [],
			prizes: [],
			rules: []
		}
	}
};

export const EVENT_LABELS: Record<EventId, string> = {
	hackathon: 'Hackathon',
	'pitch-fest': 'Pitch Fest'
};

export function isEventId(value: unknown): value is EventId {
	return typeof value === 'string' && (EVENT_IDS as readonly string[]).includes(value);
}

/** Merge a partial config (from Firestore) over the defaults, field by field. */
export function mergeSiteConfig(stored: unknown): SiteConfig {
	const base = structuredClone(DEFAULT_SITE_CONFIG);
	if (!stored || typeof stored !== 'object') return base;
	const s = stored as Partial<SiteConfig>;
	const events = { ...base.events };
	for (const id of EVENT_IDS) {
		events[id] = {
			...base.events[id],
			...(s.events?.[id] ?? {}),
			// Team sizes are fixed by the registration forms, not configurable.
			teamMin: base.events[id].teamMin,
			teamMax: base.events[id].teamMax
		};
	}
	return { ...base, ...s, events };
}

/** Fields an admin edits on the general settings page. */
export type GeneralSettings = Omit<SiteConfig, 'events'>;
