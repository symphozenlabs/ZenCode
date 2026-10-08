import type { EventId } from '$lib/config/site';

/**
 * Registration storage, shared by the public forms and the admin.
 * One Firestore collection per event (defined on the pavithra branch).
 */
export const COLLECTIONS = {
	HACKATHON: 'hackathon_registered_participants',
	PITCH_FEST: 'pitchfest_registered_participants'
} as const;

export const COLLECTION_BY_EVENT: Record<EventId, string> = {
	hackathon: COLLECTIONS.HACKATHON,
	'pitch-fest': COLLECTIONS.PITCH_FEST
};

/** Value stored in the document's `event` field. */
export const EVENT_NAME: Record<EventId, 'Hackathon' | 'Pitch Fest'> = {
	hackathon: 'Hackathon',
	'pitch-fest': 'Pitch Fest'
};

/** Fixed team sizes enforced by the registration forms and firestore.rules. */
export const TEAM_SIZES: Record<EventId, number[]> = {
	hackathon: [3, 4],
	'pitch-fest': [2]
};

/** Teams are approved automatically on registration; admins can only reject (or restore). */
export const REGISTRATION_STATUSES = ['approved', 'rejected'] as const;
export type RegistrationStatus = (typeof REGISTRATION_STATUSES)[number];

export interface TeamLeader {
	name: string;
	admissionNumber: string;
	classSection: string;
	email: string;
}

export interface TeamMember {
	memberNumber: number;
	name: string;
	admissionNumber: string;
	email: string;
}

/** Normalised registration as the admin works with it. */
export interface Registration {
	/** Firestore document ID */
	id: string;
	event: EventId;
	teamSize: number;
	teamLeader: TeamLeader;
	/** All members including the leader (memberNumber 1) */
	members: TeamMember[];
	/** Anything other than 'rejected' (incl. older 'pending'/missing) → approved */
	status: RegistrationStatus;
	/** ms since epoch */
	createdAt: number;
	reviewedBy: string | null;
}

/** Short, human-friendly reference derived from the document ID. */
export function referenceId(id: string) {
	return `ZC-${id.slice(0, 6).toUpperCase()}`;
}

/** Keep the duplicate-check search arrays in sync with the member list. */
export function searchFields(members: Pick<TeamMember, 'admissionNumber' | 'email'>[]) {
	return {
		_searchAdmissionNumbers: members.map((m) => m.admissionNumber.trim().toUpperCase()),
		_searchEmails: members.map((m) => m.email.trim().toLowerCase())
	};
}
