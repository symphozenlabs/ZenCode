import type { EventId } from '$lib/config/site';

/**
 * Registration storage, shared by the public forms and the admin.
 * One Firestore collection per event (defined on the pavithra branch).
 */
export const COLLECTIONS = {
	HACKATHON: 'hackathon_registered_participants',
	PITCH_FEST: 'pitchfest_registered_participants',
	/** Admin-only leader contact details, keyed by registration ID */
	CONTACTS: 'registration_contacts'
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
	'pitch-fest': [1, 2]
};

/** Teams are approved automatically on registration; admins can only reject (or restore). */
export const REGISTRATION_STATUSES = ['approved', 'rejected'] as const;
export type RegistrationStatus = (typeof REGISTRATION_STATUSES)[number];

export type { EventId } from '$lib/config/site';

export interface TeamLeader {
	name: string;
	admissionNumber: string;
	classSection: string;
	yearOfStudy?: string;
	email: string;
	/** 10-digit mobile number; empty on registrations made before it was collected */
	mobileNumber: string;
}

export interface TeamMember {
	memberNumber: number;
	name: string;
	admissionNumber: string;
	yearOfStudy?: string;
	classSection?: string;
	email: string;
}

export interface NormalizedParticipant {
	memberNumber: number;
	name: string;
	admissionNumber: string;
	yearOfStudy: string;
	classSection: string;
	email: string;
	isLeader: boolean;
}

/** Server-recorded outcome of the last check-in pass email to one address. */
export interface EmailDelivery {
	email: string;
	status: 'sent' | 'failed';
	resendId: string | null;
	error: string | null;
	sendCount: number;
	/** ms since epoch */
	lastAttemptAt: number;
}

/** Normalised registration as the admin works with it. */
export interface Registration {
	/** Firestore document ID */
	id: string;
	event: EventId;
	/** Empty on registrations made before team names were collected */
	teamName: string;
	teamSize: number;
	teamLeader: TeamLeader;
	/** All members including the leader (memberNumber 1) */
	members: TeamMember[];
	/** Anything other than 'rejected' (incl. older 'pending'/missing) → approved */
	status: RegistrationStatus;
	/** ms since epoch */
	createdAt: number;
	reviewedBy: string | null;
	/** Pass emails recorded by the server; empty for teams registered before tracking */
	emailDelivery: EmailDelivery[];
}

/** Every address a team's passes go to: the leader plus members, deduplicated (as the server sends). */
export function passRecipients(r: Pick<Registration, 'teamLeader' | 'members'>) {
	const seen = new Map<string, string>();
	for (const p of [r.teamLeader, ...r.members]) {
		const email = p.email.trim().toLowerCase();
		if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) && !seen.has(email)) seen.set(email, p.name);
	}
	return [...seen].map(([email, name]) => ({ email, name }));
}

/** Team name, falling back to the leader's name for older registrations. */
export function teamLabel(r: Pick<Registration, 'teamName' | 'teamLeader'>) {
	return r.teamName || (r.teamLeader.name ? `${r.teamLeader.name}'s team` : '—');
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

/** Returns all participants for a team, guaranteeing leader and all members are present and indexed. */
export function getAllTeamParticipants(r: Pick<Registration, 'teamLeader' | 'members'>): NormalizedParticipant[] {
	const leaderAdm = (r.teamLeader?.admissionNumber || '').trim().toUpperCase();
	const leaderEmail = (r.teamLeader?.email || '').trim().toLowerCase();
	const results: NormalizedParticipant[] = [];

	if (Array.isArray(r.members) && r.members.length > 0) {
		const hasLeaderDetails = Boolean(leaderAdm || leaderEmail);
		let foundLeader = false;
		r.members.forEach((m, idx) => {
			const mAdm = (m.admissionNumber || '').trim().toUpperCase();
			const mEmail = (m.email || '').trim().toLowerCase();
			const isLead = hasLeaderDetails
				? (Boolean(leaderAdm) && mAdm === leaderAdm) || (Boolean(leaderEmail) && mEmail === leaderEmail)
				: m.memberNumber === 1 || idx === 0;
			if (isLead) foundLeader = true;
			results.push({
				memberNumber: m.memberNumber || idx + 1,
				name: m.name || '',
				admissionNumber: m.admissionNumber || '',
				yearOfStudy: m.yearOfStudy || m.classSection || r.teamLeader?.yearOfStudy || r.teamLeader?.classSection || '',
				classSection: m.classSection || m.yearOfStudy || '',
				email: m.email || '',
				isLeader: isLead
			});
		});

		if (!foundLeader && (r.teamLeader?.name || r.teamLeader?.admissionNumber)) {
			results.unshift({
				memberNumber: 1,
				name: r.teamLeader.name || '',
				admissionNumber: r.teamLeader.admissionNumber || '',
				yearOfStudy: r.teamLeader.yearOfStudy || r.teamLeader.classSection || '',
				classSection: r.teamLeader.classSection || r.teamLeader.yearOfStudy || '',
				email: r.teamLeader.email || '',
				isLeader: true
			});
			results.forEach((p, i) => {
				p.memberNumber = i + 1;
			});
		}
	} else if (r.teamLeader?.name || r.teamLeader?.admissionNumber) {
		results.push({
			memberNumber: 1,
			name: r.teamLeader.name || '',
			admissionNumber: r.teamLeader.admissionNumber || '',
			yearOfStudy: r.teamLeader.yearOfStudy || r.teamLeader.classSection || '',
			classSection: r.teamLeader.classSection || r.teamLeader.yearOfStudy || '',
			email: r.teamLeader.email || '',
			isLeader: true
		});
	}

	return results;
}

