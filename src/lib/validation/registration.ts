import type { EventConfig, EventId } from '$lib/config/site';
import { isEventId } from '$lib/config/site';

export const REGISTRATION_STATUSES = ['pending', 'approved', 'rejected'] as const;
export type RegistrationStatus = (typeof REGISTRATION_STATUSES)[number];

export const ACADEMIC_YEARS = [
	'1st year',
	'2nd year',
	'3rd year',
	'4th year',
	'5th year',
	'Postgraduate',
	'Other'
] as const;

export interface TeamMember {
	name: string;
	email: string;
}

export interface RegistrationInput {
	event: EventId | '';
	personal: { name: string; email: string; phone: string };
	academic: { college: string; department: string; year: string };
	team: { name: string; track: string; members: TeamMember[] };
}

/** Shape stored in Firestore at registrations/{registrationId}. */
export interface Registration extends Omit<RegistrationInput, 'event'> {
	registrationId: string;
	event: EventId;
	emailLower: string;
	status: RegistrationStatus;
	createdAt: number;
	updatedAt: number;
	reviewedBy?: string | null;
}

export type Errors = Record<string, string>;

/** Doc ID in `registrationKeys` that makes (event, email) unique. */
export function registrationKeyId(event: string, emailLower: string) {
	return `${event}__${emailLower}`;
}

export function emptyRegistration(): RegistrationInput {
	return {
		event: '',
		personal: { name: '', email: '', phone: '' },
		academic: { college: '', department: '', year: '' },
		team: { name: '', track: '', members: [] }
	};
}

const EMAIL = /^[^\s@/]+@[^\s@/]+\.[^\s@/]{2,}$/;
const PHONE = /^\+?[0-9][0-9\s-]{6,17}$/;

const LIMITS = { name: 80, email: 120, phone: 20, text: 120 };

function required(errors: Errors, key: string, value: string, label: string, max = LIMITS.text) {
	const v = value.trim();
	if (!v) errors[key] = `Enter ${label}.`;
	else if (v.length > max) errors[key] = `Keep ${label} under ${max} characters.`;
}

export function validatePersonal(input: RegistrationInput): Errors {
	const e: Errors = {};
	required(e, 'personal.name', input.personal.name, 'your full name', LIMITS.name);
	if (!EMAIL.test(input.personal.email.trim())) e['personal.email'] = 'Enter a valid email address.';
	if (!PHONE.test(input.personal.phone.trim())) e['personal.phone'] = 'Enter a valid phone number.';
	return e;
}

export function validateAcademic(input: RegistrationInput): Errors {
	const e: Errors = {};
	required(e, 'academic.college', input.academic.college, 'your college');
	required(e, 'academic.department', input.academic.department, 'your department');
	if (!(ACADEMIC_YEARS as readonly string[]).includes(input.academic.year))
		e['academic.year'] = 'Choose your year of study.';
	return e;
}

export function validateEvent(input: RegistrationInput, config: EventConfig | null): Errors {
	const e: Errors = {};
	if (!isEventId(input.event)) {
		e['event'] = 'Choose an event.';
		return e;
	}
	if (config && !config.registrationOpen) e['event'] = 'Registration for this event is closed.';
	if (config && config.tracks.length > 0 && !config.tracks.includes(input.team.track))
		e['team.track'] = 'Choose a track.';
	return e;
}

export function isSoloEvent(config: EventConfig | null) {
	return !!config && config.teamMax <= 1;
}

export function validateTeam(input: RegistrationInput, config: EventConfig | null): Errors {
	const e: Errors = {};
	if (!config) return e;
	if (!isSoloEvent(config)) required(e, 'team.name', input.team.name, 'a team name', 60);

	const size = 1 + input.team.members.length;
	if (size < config.teamMin)
		e['team.members'] = `Teams need at least ${config.teamMin} people including you.`;
	if (size > config.teamMax)
		e['team.members'] = `Teams can have at most ${config.teamMax} people including you.`;

	const seen = new Set([input.personal.email.trim().toLowerCase()]);
	input.team.members.forEach((m, i) => {
		required(e, `team.members.${i}.name`, m.name, 'a name', LIMITS.name);
		const email = m.email.trim().toLowerCase();
		if (!EMAIL.test(email)) e[`team.members.${i}.email`] = 'Enter a valid email.';
		else if (seen.has(email)) e[`team.members.${i}.email`] = 'Each member needs a different email.';
		seen.add(email);
	});
	return e;
}

export function validateAll(input: RegistrationInput, config: EventConfig | null): Errors {
	return {
		...validatePersonal(input),
		...validateAcademic(input),
		...validateEvent(input, config),
		...validateTeam(input, config)
	};
}

/** Trim and keep only known fields — never trust the shape sent by a client. */
export function sanitizeRegistration(raw: unknown): RegistrationInput {
	const r = (raw ?? {}) as Partial<RegistrationInput>;
	const str = (v: unknown) => (typeof v === 'string' ? v.trim() : '');
	const members = Array.isArray(r.team?.members) ? r.team.members.slice(0, 10) : [];
	return {
		event: isEventId(r.event) ? r.event : '',
		personal: {
			name: str(r.personal?.name),
			email: str(r.personal?.email),
			phone: str(r.personal?.phone)
		},
		academic: {
			college: str(r.academic?.college),
			department: str(r.academic?.department),
			year: str(r.academic?.year)
		},
		team: {
			name: str(r.team?.name),
			track: str(r.team?.track),
			members: members.map((m) => ({ name: str(m?.name), email: str(m?.email) }))
		}
	};
}
