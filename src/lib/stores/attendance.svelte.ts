import { browser } from '$app/environment';
import {
	collection,
	doc,
	onSnapshot,
	query,
	where,
	orderBy,
	type DocumentData,
	type Unsubscribe
} from 'firebase/firestore';
import { db } from '$lib/firebase/client';
import { adminAuth } from './admin-auth.svelte';
import { registrations } from './registrations.svelte';
import {
	ATTENDANCE_COLLECTIONS,
	buildAttendanceMatrix,
	type AttendanceSession,
	type AttendanceRecord,
	type AttendanceAuditLog,
	type AttendanceSessionStatus,
	type StudentAttendanceRow,
	type TeamAttendanceRow,
	type AttendanceOverviewStats,
	type ParticipantAttendanceStatus
} from '$lib/attendance/model';
import type { EventId } from '$lib/config/site';

function toMillis(v: unknown): number {
	if (typeof v === 'number') return v;
	if (v && typeof v === 'object' && 'toMillis' in v && typeof (v as any).toMillis === 'function') {
		return (v as any).toMillis();
	}
	return 0;
}

const str = (v: unknown) => (typeof v === 'string' ? v : '');

function fromSessionDoc(id: string, d: DocumentData): AttendanceSession {
	return {
		id,
		eventId: d.eventId === 'pitch-fest' ? 'pitch-fest' : 'hackathon',
		eventName: d.eventId === 'pitch-fest' ? 'Pitch Fest' : 'Hackathon',
		name: str(d.name),
		date: str(d.date) || new Date().toISOString().split('T')[0],
		status: (d.status === 'finalized' ? 'finalized' : 'open') as AttendanceSessionStatus,
		notes: str(d.notes),
		createdBy: str(d.createdBy),
		createdAt: toMillis(d.createdAt) || Date.now(),
		updatedAt: toMillis(d.updatedAt) || Date.now(),
		finalizedAt: toMillis(d.finalizedAt) || null,
		finalizedBy: str(d.finalizedBy) || null
	};
}

function fromRecordDoc(id: string, d: DocumentData): AttendanceRecord {
	return {
		id,
		sessionId: str(d.sessionId),
		eventId: d.eventId === 'pitch-fest' ? 'pitch-fest' : 'hackathon',
		teamId: str(d.teamId),
		teamName: str(d.teamName),
		participantKey: str(d.participantKey),
		studentName: str(d.studentName),
		admissionNumber: str(d.admissionNumber),
		yearOfStudy: str(d.yearOfStudy),
		email: str(d.email),
		memberNumber: typeof d.memberNumber === 'number' ? d.memberNumber : 1,
		isLeader: Boolean(d.isLeader),
		status: 'present',
		checkedInAt: toMillis(d.checkedInAt) || Date.now(),
		checkedInBy: str(d.checkedInBy),
		createdAt: toMillis(d.createdAt) || Date.now(),
		updatedAt: toMillis(d.updatedAt) || Date.now()
	};
}

function fromAuditDoc(id: string, d: DocumentData): AttendanceAuditLog {
	return {
		id,
		recordId: str(d.recordId),
		sessionId: str(d.sessionId),
		eventId: d.eventId === 'pitch-fest' ? 'pitch-fest' : 'hackathon',
		teamId: str(d.teamId),
		teamName: str(d.teamName),
		participantKey: str(d.participantKey),
		studentName: str(d.studentName),
		admissionNumber: str(d.admissionNumber),
		previousStatus: str(d.previousStatus),
		newStatus: str(d.newStatus),
		reason: str(d.reason),
		changedBy: str(d.changedBy),
		timestamp: toMillis(d.timestamp) || Date.now()
	};
}

class AttendanceStore {
	sessions = $state<AttendanceSession[]>([]);
	records = $state<AttendanceRecord[]>([]);
	auditLogs = $state<AttendanceAuditLog[]>([]);

	selectedSessionId = $state<string | null>(null);
	eventFilter = $state<'all' | 'hackathon' | 'pitch-fest'>('all');

	sessionsReady = $state(false);
	recordsReady = $state(false);
	error = $state<string | null>(null);

	#unsubs: Unsubscribe[] = [];
	#recordUnsub: Unsubscribe | null = null;
	#auditUnsub: Unsubscribe | null = null;
	#refs = 0;

	// Active session derived
	activeSession = $derived.by<AttendanceSession | null>(() => {
		if (this.selectedSessionId) {
			const found = this.sessions.find((s) => s.id === this.selectedSessionId);
			if (found) return found;
		}
		// If filtered by event, pick the first one matching event
		if (this.eventFilter !== 'all') {
			const matching = this.sessions.filter((s) => s.eventId === this.eventFilter);
			return matching[0] ?? null;
		}
		return this.sessions[0] ?? null;
	});

	// Derived matrix joining active registrations with current session records
	matrix = $derived.by(() => {
		if (!this.activeSession) {
			return {
				studentRows: [] as StudentAttendanceRow[],
				teamRows: [] as TeamAttendanceRow[],
				overview: {
					totalRegisteredStudents: 0,
					totalPresentStudents: 0,
					totalAbsentStudents: 0,
					totalNotCheckedInStudents: 0,
					overallAttendancePercentage: 0,
					totalTeams: 0,
					teamsFullyPresent: 0,
					teamsPartiallyPresent: 0,
					teamsNoCheckIns: 0,
					isSessionFinalized: false
				} as AttendanceOverviewStats
			};
		}

		return buildAttendanceMatrix(registrations.items, this.activeSession, this.records);
	});

	status = $derived.by<'loading' | 'ready' | 'error'>(() => {
		if (this.error) return 'error';
		if (this.sessionsReady && (this.recordsReady || !this.activeSession)) return 'ready';
		return 'loading';
	});

	subscribe() {
		this.#refs++;
		if (!this.#unsubs.length) {
			this.#listenSessions();
			this.#listenAuditLogs();
		}
		return () => {
			if (--this.#refs <= 0) {
				this.#stop();
			}
		};
	}

	#listenSessions() {
		if (!browser) return;
		this.error = null;
		try {
			const unsub = onSnapshot(
				collection(db(), ATTENDANCE_COLLECTIONS.SESSIONS),
				(snap) => {
					this.sessions = snap.docs
						.map((d) => fromSessionDoc(d.id, d.data()))
						.sort((a, b) => b.createdAt - a.createdAt);
					this.sessionsReady = true;

					// If no session selected yet, default to first session
					if (!this.selectedSessionId && this.sessions.length > 0) {
						this.selectSession(this.sessions[0].id);
					}
				},
				(err) => {
					console.error('[attendance:sessions]', err);
					this.error = 'Failed to load attendance sessions.';
				}
			);
			this.#unsubs.push(unsub);
		} catch (e: any) {
			this.error = e.message;
		}
	}

	#listenAuditLogs() {
		if (!browser) return;
		try {
			const unsub = onSnapshot(
				collection(db(), ATTENDANCE_COLLECTIONS.AUDIT_LOGS),
				(snap) => {
					this.auditLogs = snap.docs
						.map((d) => fromAuditDoc(d.id, d.data()))
						.sort((a, b) => b.timestamp - a.timestamp);
				},
				(err) => console.error('[attendance:audit]', err)
			);
			this.#unsubs.push(unsub);
		} catch (e) {
			// ignore
		}
	}

	selectSession(sessionId: string) {
		this.selectedSessionId = sessionId;
		this.#listenRecords(sessionId);
	}

	#listenRecords(sessionId: string) {
		if (!browser) return;
		if (this.#recordUnsub) {
			this.#recordUnsub();
			this.#recordUnsub = null;
		}

		this.recordsReady = false;
		try {
			const q = query(collection(db(), ATTENDANCE_COLLECTIONS.RECORDS), where('sessionId', '==', sessionId));
			this.#recordUnsub = onSnapshot(
				q,
				(snap) => {
					this.records = snap.docs.map((d) => fromRecordDoc(d.id, d.data()));
					this.recordsReady = true;
				},
				(err) => {
					console.error('[attendance:records]', err);
					this.recordsReady = true;
				}
			);
		} catch (e) {
			this.recordsReady = true;
		}
	}

	#stop() {
		this.#unsubs.forEach((u) => u());
		this.#unsubs = [];
		if (this.#recordUnsub) {
			this.#recordUnsub();
			this.#recordUnsub = null;
		}
		if (this.#auditUnsub) {
			this.#auditUnsub();
			this.#auditUnsub = null;
		}
		this.#refs = Math.max(0, this.#refs);
	}

	async #getAuthHeader(): Promise<Record<string, string>> {
		if (!adminAuth.user) throw new Error('You must be signed in as an admin.');
		const token = await adminAuth.user.getIdToken();
		return {
			authorization: `Bearer ${token}`,
			'content-type': 'application/json'
		};
	}

	/**
	 * Creates a new session via server endpoint.
	 */
	async createSession(params: { name: string; eventId: EventId; date?: string; notes?: string }) {
		const headers = await this.#getAuthHeader();
		const res = await fetch('/api/admin/attendance/sessions', {
			method: 'POST',
			headers,
			body: JSON.stringify(params)
		});

		const data = await res.json();
		if (!res.ok) {
			throw new Error(data.error || 'Failed to create session');
		}

		if (data.session?.id) {
			this.selectSession(data.session.id);
		}
		return data.session as AttendanceSession;
	}

	/**
	 * Finalize or reopen session.
	 */
	async updateSessionStatus(sessionId: string, status: AttendanceSessionStatus) {
		const headers = await this.#getAuthHeader();
		const res = await fetch(`/api/admin/attendance/sessions/${sessionId}`, {
			method: 'PATCH',
			headers,
			body: JSON.stringify({ status })
		});

		const data = await res.json();
		if (!res.ok) {
			throw new Error(data.error || 'Failed to update session');
		}
	}

	/**
	 * Marks an individual student present.
	 */
	async checkInStudent(teamId: string, participantKey: string, overrideFinalized = false) {
		if (!this.activeSession) throw new Error('No active attendance session selected.');

		const headers = await this.#getAuthHeader();
		const res = await fetch('/api/admin/attendance/check-in', {
			method: 'POST',
			headers,
			body: JSON.stringify({
				sessionId: this.activeSession.id,
				teamId,
				participantKey,
				overrideFinalized
			})
		});

		const data = await res.json();
		if (!res.ok) {
			throw new Error(data.error || 'Check-in failed');
		}
		return data.record;
	}

	/**
	 * Marks all members of a team present (with explicit confirmation).
	 */
	async checkInAll(teamId: string, participantKeys: string[], overrideFinalized = false) {
		if (!this.activeSession) throw new Error('No active attendance session selected.');

		const headers = await this.#getAuthHeader();
		const res = await fetch('/api/admin/attendance/bulk-check-in', {
			method: 'POST',
			headers,
			body: JSON.stringify({
				sessionId: this.activeSession.id,
				teamId,
				participantKeys,
				overrideFinalized
			})
		});

		const data = await res.json();
		if (!res.ok) {
			throw new Error(data.error || 'Bulk check-in failed');
		}
		return data;
	}

	/**
	 * Audited correction.
	 */
	async correctRecord(recordId: string, newStatus: ParticipantAttendanceStatus, reason: string) {
		const headers = await this.#getAuthHeader();
		const res = await fetch('/api/admin/attendance/correct', {
			method: 'POST',
			headers,
			body: JSON.stringify({
				recordId,
				newStatus,
				reason
			})
		});

		const data = await res.json();
		if (!res.ok) {
			throw new Error(data.error || 'Correction failed');
		}
	}

	/**
	 * Triggers browser download of attendance CSV.
	 */
	async downloadExport(type: 'students' | 'teams' | 'event') {
		if (!this.activeSession) throw new Error('No active session selected.');
		const token = await adminAuth.user?.getIdToken();
		const url = `/api/admin/attendance/export?type=${type}&sessionId=${this.activeSession.id}&eventId=${this.activeSession.eventId}`;

		const res = await fetch(url, {
			headers: token ? { authorization: `Bearer ${token}` } : {}
		});

		if (!res.ok) {
			throw new Error('Export download failed');
		}

		const blob = await res.blob();
		const disposition = res.headers.get('content-disposition') || '';
		const filenameMatch = /filename="([^"]+)"/.exec(disposition);
		const filename = filenameMatch ? filenameMatch[1] : `${type}-attendance.csv`;

		const downloadUrl = window.URL.createObjectURL(blob);
		const a = document.createElement('a');
		a.href = downloadUrl;
		a.download = filename;
		document.body.appendChild(a);
		a.click();
		document.body.removeChild(a);
		window.URL.revokeObjectURL(downloadUrl);
	}
}

export const attendance = new AttendanceStore();
