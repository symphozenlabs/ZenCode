import type { EventId } from '$lib/config/site';
import { getAllTeamParticipants, type NormalizedParticipant, type Registration } from '$lib/registrations/model';

export const ATTENDANCE_COLLECTIONS = {
	SESSIONS: 'attendance_sessions',
	RECORDS: 'attendance_records',
	AUDIT_LOGS: 'attendance_audit_logs'
} as const;

export type AttendanceSessionStatus = 'open' | 'finalized';

export interface AttendanceSession {
	id: string;
	eventId: EventId;
	eventName: 'Hackathon' | 'Pitch Fest';
	name: string;
	date: string; // YYYY-MM-DD
	status: AttendanceSessionStatus;
	notes?: string;
	createdBy: string;
	createdAt: number;
	updatedAt: number;
	finalizedAt?: number | null;
	finalizedBy?: string | null;
}

export type ParticipantAttendanceStatus = 'present' | 'not-checked-in' | 'absent';

export interface AttendanceRecord {
	id: string; // deterministic: `${sessionId}__${teamId}__${participantKey}`
	sessionId: string;
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
}

export interface AttendanceAuditLog {
	id: string;
	recordId: string;
	sessionId: string;
	eventId: EventId;
	teamId: string;
	teamName?: string;
	participantKey: string;
	studentName: string;
	admissionNumber: string;
	previousStatus: string;
	newStatus: string;
	reason: string;
	changedBy: string;
	timestamp: number;
}

export type TeamAttendanceStatus = 'Fully Present' | 'Partially Present' | 'No Check-ins' | 'Attendance Pending';

export interface StudentAttendanceRow {
	sessionId: string;
	sessionName: string;
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
	status: ParticipantAttendanceStatus;
	checkedInAt: number | null;
	checkedInBy: string | null;
	isFinalized: boolean;
}

export interface TeamAttendanceRow {
	sessionId: string;
	sessionName: string;
	eventId: EventId;
	eventName: 'Hackathon' | 'Pitch Fest';
	teamId: string;
	teamName: string;
	teamLeaderName: string;
	registeredMemberCount: number;
	presentCount: number;
	notCheckedInCount: number;
	absentCount: number;
	attendancePercentage: number;
	status: TeamAttendanceStatus;
	members: StudentAttendanceRow[];
}

export interface AttendanceOverviewStats {
	totalRegisteredStudents: number;
	totalPresentStudents: number;
	totalAbsentStudents: number;
	totalNotCheckedInStudents: number;
	overallAttendancePercentage: number;
	totalTeams: number;
	teamsFullyPresent: number;
	teamsPartiallyPresent: number;
	teamsNoCheckIns: number;
	isSessionFinalized: boolean;
}

/**
 * Creates a deterministic, URL-safe participant key from their admission number or email or memberNumber.
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
 * Deterministic document ID preventing race-condition duplicates.
 */
export function getRecordId(sessionId: string, teamId: string, participantKey: string): string {
	const s = sessionId.trim().replace(/[^a-zA-Z0-9_-]/g, '_');
	const t = teamId.trim().replace(/[^a-zA-Z0-9_-]/g, '_');
	const p = participantKey.trim().replace(/[^a-zA-Z0-9_-]/g, '_');
	return `${s}__${t}__${p}`;
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
 * RFC 4180 CSV cell escaper.
 */
function escapeCsvCell(val: unknown): string {
	if (val === null || val === undefined) return '""';
	const str = String(val);
	// If contains comma, quote, or newline, escape quotes and wrap in quotes
	if (str.includes(',') || str.includes('"') || str.includes('\n') || str.includes('\r')) {
		return `"${str.replace(/"/g, '""')}"`;
	}
	return `"${str}"`;
}

/**
 * Formats CSV string with header and rows.
 */
export function generateCsv(headers: string[], rows: (string | number | boolean | null | undefined)[][]): string {
	const headerLine = headers.map(escapeCsvCell).join(',');
	const dataLines = rows.map((r) => r.map(escapeCsvCell).join(','));
	return [headerLine, ...dataLines].join('\r\n');
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
 * Builds composite attendance data joining registrations with session records.
 * Pure logic shared across client store and server exports.
 */
export function buildAttendanceMatrix(
	registrations: Registration[],
	session: AttendanceSession,
	records: AttendanceRecord[]
): {
	studentRows: StudentAttendanceRow[];
	teamRows: TeamAttendanceRow[];
	overview: AttendanceOverviewStats;
} {
	const recordMap = new Map<string, AttendanceRecord>();
	for (const r of records) {
		recordMap.set(r.participantKey, r);
	}

	const studentRows: StudentAttendanceRow[] = [];
	const teamRows: TeamAttendanceRow[] = [];

	let totalRegisteredStudents = 0;
	let totalPresentStudents = 0;
	let totalAbsentStudents = 0;
	let totalNotCheckedInStudents = 0;
	let teamsFullyPresent = 0;
	let teamsPartiallyPresent = 0;
	let teamsNoCheckIns = 0;

	// Filter registrations by event
	const eventRegistrations = registrations.filter((r) => r.event === session.eventId && r.status !== 'rejected');

	for (const reg of eventRegistrations) {
		const participants = getAllTeamParticipants({
			teamLeader: reg.teamLeader,
			members: reg.members
		});

		const teamName = reg.teamName || `${reg.teamLeader.name || 'ZenCode'}'s Team`;
		let teamPresentCount = 0;
		const teamMemberRows: StudentAttendanceRow[] = [];

		for (const p of participants) {
			const pKey = getParticipantKey(p);
			const rec = recordMap.get(pKey);

			let status: ParticipantAttendanceStatus;
			let checkedInAt: number | null = null;
			let checkedInBy: string | null = null;

			if (rec && rec.status === 'present') {
				status = 'present';
				checkedInAt = rec.checkedInAt;
				checkedInBy = rec.checkedInBy;
				teamPresentCount += 1;
				totalPresentStudents += 1;
			} else {
				if (session.status === 'finalized') {
					status = 'absent';
					totalAbsentStudents += 1;
				} else {
					status = 'not-checked-in';
					totalNotCheckedInStudents += 1;
				}
			}

			totalRegisteredStudents += 1;

			const row: StudentAttendanceRow = {
				sessionId: session.id,
				sessionName: session.name,
				eventId: session.eventId,
				eventName: session.eventName,
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
				checkedInBy,
				isFinalized: session.status === 'finalized'
			};

			studentRows.push(row);
			teamMemberRows.push(row);
		}

		const totalCount = participants.length;
		const notCheckedInCount = session.status === 'finalized' ? 0 : totalCount - teamPresentCount;
		const absentCount = session.status === 'finalized' ? totalCount - teamPresentCount : 0;
		const attendancePercentage = totalCount > 0 ? Math.round((teamPresentCount / totalCount) * 100) : 0;

		let teamStatus: 'Fully Present' | 'Partially Present' | 'No Check-ins' | 'Attendance Pending';
		if (teamPresentCount === totalCount) {
			teamStatus = 'Fully Present';
			teamsFullyPresent += 1;
		} else if (teamPresentCount > 0) {
			teamStatus = 'Partially Present';
			teamsPartiallyPresent += 1;
		} else {
			teamStatus = session.status === 'finalized' ? 'No Check-ins' : 'Attendance Pending';
			teamsNoCheckIns += 1;
		}

		teamRows.push({
			sessionId: session.id,
			sessionName: session.name,
			eventId: session.eventId,
			eventName: session.eventName,
			teamId: reg.id,
			teamName,
			teamLeaderName: reg.teamLeader.name,
			registeredMemberCount: totalCount,
			presentCount: teamPresentCount,
			notCheckedInCount,
			absentCount,
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
		totalAbsentStudents,
		totalNotCheckedInStudents,
		overallAttendancePercentage,
		totalTeams: eventRegistrations.length,
		teamsFullyPresent,
		teamsPartiallyPresent,
		teamsNoCheckIns,
		isSessionFinalized: session.status === 'finalized'
	};

	return { studentRows, teamRows, overview };
}

