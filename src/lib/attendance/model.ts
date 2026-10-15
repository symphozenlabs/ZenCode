import type { EventId } from '$lib/config/site';
import { getAllTeamParticipants, type NormalizedParticipant, type Registration } from '$lib/registrations/model';

export const ATTENDANCE_COLLECTIONS = {
	RECORDS: 'attendance_records'
} as const;

export type ParticipantAttendanceStatus = 'present' | 'not-checked-in' | 'absent';
export type TeamAttendanceStatus = 'Fully Present' | 'Partially Present' | 'No Check-ins';

export interface AttendanceRecord {
	id: string; // deterministic: `${teamId}__${participantKey}`
	eventId: EventId;
	teamId: string;
	teamName: string;
	participantKey: string;
	studentName: string;
	admissionNumber: string;
	yearOfStudy: string;
	email: string;
	memberNumber: number;
	isLeader: boolean;
	status: 'present';
	checkedInAt: number;
	checkedInBy: string;
	createdAt: number;
	updatedAt: number;
	sessionId?: string;
}

export interface StudentAttendanceRow {
	eventId: EventId;
	eventName: 'Hackathon' | 'Pitch Fest';
	teamId: string;
	teamName: string;
	participantKey: string;
	memberNumber: number;
	studentName: string;
	admissionNumber: string;
	yearOfStudy: string;
	email: string;
	isLeader: boolean;
	status: 'present' | 'not-checked-in';
	checkedInAt: number | null;
	checkedInBy: string | null;
	sessionId?: string;
	sessionName?: string;
	isFinalized?: boolean;
}

export interface TeamAttendanceRow {
	eventId: EventId;
	eventName: 'Hackathon' | 'Pitch Fest';
	teamId: string;
	teamName: string;
	teamLeaderName: string;
	registeredMemberCount: number;
	presentCount: number;
	notCheckedInCount: number;
	absentCount?: number;
	attendancePercentage: number;
	status: TeamAttendanceStatus;
	members: StudentAttendanceRow[];
	sessionId?: string;
	sessionName?: string;
}

export interface AttendanceOverviewStats {
	totalRegisteredStudents: number;
	totalPresentStudents: number;
	totalAbsentStudents?: number;
	totalNotCheckedInStudents: number;
	overallAttendancePercentage: number;
	totalTeams: number;
	teamsFullyPresent: number;
	teamsPartiallyPresent: number;
	teamsNoCheckIns: number;
	isSessionFinalized?: boolean;
}

/**
 * Creates a deterministic, URL-safe participant key from admission number or email or memberNumber.
 */
export function getParticipantKey(member: Pick<NormalizedParticipant, 'admissionNumber' | 'email' | 'memberNumber'>): string {
	const adm = (member.admissionNumber || '').trim().toUpperCase();
	if (adm) {
		return adm.replace(/[^A-Z0-9]/g, '_');
	}
	const email = (member.email || '').trim().toLowerCase();
	if (email) {
		return email.replace(/[^a-z0-9]/g, '_');
	}
	return `M_${member.memberNumber || 1}`;
}

/**
 * Deterministic document ID preventing duplicates.
 * Supports both getRecordId(teamId, participantKey) and legacy getRecordId(sessionId, teamId, participantKey).
 */
export function getRecordId(teamId: string, participantKey: string): string;
export function getRecordId(sessionOrTeam: string, teamOrKey: string, maybeKey?: string): string;
export function getRecordId(a: string, b: string, c?: string): string {
	if (c) {
		const teamId = b.trim().replace(/[^a-zA-Z0-9_-]/g, '_');
		const key = c.trim().replace(/[^a-zA-Z0-9_-]/g, '_');
		return `${teamId}__${key}`;
	}
	const t = a.trim().replace(/[^a-zA-Z0-9_-]/g, '_');
	const p = b.trim().replace(/[^a-zA-Z0-9_-]/g, '_');
	return `${t}__${p}`;
}

/**
 * Extracts a team ID from various QR payload formats:
 * - Direct ID: "fH4k9xL2"
 * - URL: "https://zencode.symphozen.com/check-in/fH4k9xL2" or "/check-in/fH4k9xL2"
 * - JSON token: '{"type":"TEAM_ATTENDANCE","teamId":"fH4k9xL2"}'
 * - Query param URL: "...?teamId=fH4k9xL2"
 */
export function extractTeamIdFromQr(rawPayload: string): string {
	if (!rawPayload) return '';
	let input = decodeURIComponent(rawPayload).trim();

	// If JSON payload
	if (input.startsWith('{') && input.endsWith('}')) {
		try {
			const parsed = JSON.parse(input);
			if (parsed.teamId) return String(parsed.teamId).trim();
			if (parsed.id) return String(parsed.id).trim();
		} catch {
			// fallback
		}
	}

	// If contains /check-in/
	if (input.includes('/check-in/')) {
		const parts = input.split('/check-in/');
		const tail = parts[parts.length - 1];
		return tail.split('?')[0].split('/')[0].split('#')[0].trim();
	}

	// If contains ?teamId= or &teamId=
	const teamIdMatch = /[?&]teamId=([^&#]+)/i.exec(input);
	if (teamIdMatch?.[1]) {
		return teamIdMatch[1].trim();
	}

	return input;
}

/**
 * Formats epoch millis into readable timestamp.
 */
export function formatTimestamp(millis: number | null | undefined): string {
	if (!millis) return '—';
	try {
		return new Date(millis).toLocaleString('en-IN', {
			dateStyle: 'medium',
			timeStyle: 'short'
		});
	} catch {
		return '—';
	}
}

/**
 * Builds composite attendance data joining registrations with attendance records.
 * Pure logic shared across client store and tests.
 * Does NOT require sessions. Supports optional eventFilter ('all' | 'hackathon' | 'pitch-fest').
 */
export function buildAttendanceMatrix(
	registrations: Registration[],
	records: AttendanceRecord[],
	eventFilter: 'all' | 'hackathon' | 'pitch-fest' = 'all'
): {
	studentRows: StudentAttendanceRow[];
	teamRows: TeamAttendanceRow[];
	overview: AttendanceOverviewStats;
} {
	// Map records by `${teamId}__${participantKey}` and by `participantKey`
	const recordMap = new Map<string, AttendanceRecord>();
	for (const r of records) {
		recordMap.set(`${r.teamId}__${r.participantKey}`, r);
		recordMap.set(r.participantKey, r);
	}

	const studentRows: StudentAttendanceRow[] = [];
	const teamRows: TeamAttendanceRow[] = [];

	let totalRegisteredStudents = 0;
	let totalPresentStudents = 0;
	let totalNotCheckedInStudents = 0;
	let teamsFullyPresent = 0;
	let teamsPartiallyPresent = 0;
	let teamsNoCheckIns = 0;

	// Filter registrations by event and status
	const filteredRegistrations = registrations.filter(
		(r) => (eventFilter === 'all' || r.event === eventFilter) && r.status !== 'rejected'
	);

	for (const reg of filteredRegistrations) {
		const participants = getAllTeamParticipants({
			teamLeader: reg.teamLeader,
			members: reg.members
		});

		const teamName = reg.teamName || `${reg.teamLeader.name || 'ZenCode'}'s Team`;
		let teamPresentCount = 0;
		const teamMemberRows: StudentAttendanceRow[] = [];

		for (const p of participants) {
			const pKey = getParticipantKey(p);
			const rec = recordMap.get(`${reg.id}__${pKey}`) || recordMap.get(pKey);

			let status: 'present' | 'not-checked-in' = 'not-checked-in';
			let checkedInAt: number | null = null;
			let checkedInBy: string | null = null;

			if (rec && rec.status === 'present') {
				status = 'present';
				checkedInAt = rec.checkedInAt;
				checkedInBy = rec.checkedInBy;
				teamPresentCount += 1;
				totalPresentStudents += 1;
			} else {
				status = 'not-checked-in';
				totalNotCheckedInStudents += 1;
			}

			totalRegisteredStudents += 1;

			const row: StudentAttendanceRow = {
				eventId: reg.event,
				eventName: reg.event === 'pitch-fest' ? 'Pitch Fest' : 'Hackathon',
				teamId: reg.id,
				teamName,
				participantKey: pKey,
				memberNumber: p.memberNumber,
				studentName: p.name,
				admissionNumber: p.admissionNumber,
				yearOfStudy: p.yearOfStudy,
				email: p.email,
				isLeader: p.isLeader,
				status,
				checkedInAt,
				checkedInBy
			};

			studentRows.push(row);
			teamMemberRows.push(row);
		}

		const totalCount = participants.length;
		const notCheckedInCount = totalCount - teamPresentCount;
		const attendancePercentage = totalCount > 0 ? Math.round((teamPresentCount / totalCount) * 100) : 0;

		let teamStatus: TeamAttendanceStatus;
		if (teamPresentCount === totalCount && totalCount > 0) {
			teamStatus = 'Fully Present';
			teamsFullyPresent += 1;
		} else if (teamPresentCount > 0) {
			teamStatus = 'Partially Present';
			teamsPartiallyPresent += 1;
		} else {
			teamStatus = 'No Check-ins';
			teamsNoCheckIns += 1;
		}

		teamRows.push({
			eventId: reg.event,
			eventName: reg.event === 'pitch-fest' ? 'Pitch Fest' : 'Hackathon',
			teamId: reg.id,
			teamName,
			teamLeaderName: reg.teamLeader.name,
			registeredMemberCount: totalCount,
			presentCount: teamPresentCount,
			notCheckedInCount,
			attendancePercentage,
			status: teamStatus,
			members: teamMemberRows
		});
	}

	const overallAttendancePercentage =
		totalRegisteredStudents > 0 ? Math.round((totalPresentStudents / totalRegisteredStudents) * 100) : 0;

	const overview: AttendanceOverviewStats = {
		totalRegisteredStudents,
		totalPresentStudents,
		totalNotCheckedInStudents,
		overallAttendancePercentage,
		totalTeams: filteredRegistrations.length,
		teamsFullyPresent,
		teamsPartiallyPresent,
		teamsNoCheckIns
	};

	return { studentRows, teamRows, overview };
}
