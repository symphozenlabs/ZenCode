import { browser } from '$app/environment';
import {
	collection,
	onSnapshot,
	type DocumentData,
	type Unsubscribe
} from 'firebase/firestore';
import { db } from '$lib/firebase/client';
import { adminAuth } from './admin-auth.svelte';
import { registrations } from './registrations.svelte';
import {
	ATTENDANCE_COLLECTIONS,
	buildAttendanceMatrix,
	type AttendanceRecord,
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

function fromRecordDoc(id: string, d: DocumentData): AttendanceRecord {
	return {
		id,
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
		updatedAt: toMillis(d.updatedAt) || Date.now(),
		sessionId: str(d.sessionId)
	};
}

class AttendanceStore {
	records = $state<AttendanceRecord[]>([]);
	eventFilter = $state<'all' | 'hackathon' | 'pitch-fest'>('all');

	recordsReady = $state(false);
	error = $state<string | null>(null);

	#unsubs: Unsubscribe[] = [];
	#refs = 0;

	// Derived matrix combining registrations and attendance records
	matrix = $derived.by(() => {
		return buildAttendanceMatrix(registrations.items, this.records, this.eventFilter);
	});

	status = $derived.by<'loading' | 'ready' | 'error'>(() => {
		if (this.error) return 'error';
		if (this.recordsReady) return 'ready';
		return 'loading';
	});

	subscribe() {
		this.#refs++;
		if (!this.#unsubs.length) {
			this.#listenRecords();
		}
		return () => {
			if (--this.#refs <= 0) {
				this.#stop();
			}
		};
	}

	#listenRecords() {
		if (!browser) return;
		this.error = null;
		this.recordsReady = false;

		try {
			const unsub = onSnapshot(
				collection(db(), ATTENDANCE_COLLECTIONS.RECORDS),
				(snap) => {
					this.records = snap.docs.map((d) => fromRecordDoc(d.id, d.data()));
					this.recordsReady = true;
				},
				(err) => {
					console.error('[attendance:records]', err);
					this.error = 'Failed to load attendance records.';
					this.recordsReady = true;
				}
			);
			this.#unsubs.push(unsub);
		} catch (e: any) {
			this.error = e.message;
			this.recordsReady = true;
		}
	}

	#stop() {
		this.#unsubs.forEach((u) => u());
		this.#unsubs = [];
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
	 * Marks an individual student present.
	 */
	async checkInStudent(teamId: string, participantKey: string) {
		const headers = await this.#getAuthHeader();
		const res = await fetch('/api/admin/attendance/check-in', {
			method: 'POST',
			headers,
			body: JSON.stringify({
				teamId,
				participantKey
			})
		});

		const data = await res.json();
		if (!res.ok) {
			throw new Error(data.error || 'Check-in failed');
		}
		return data.record as AttendanceRecord;
	}

	/**
	 * Marks all members of a team present (individually recorded).
	 */
	async checkInAll(teamId: string, participantKeys: string[]) {
		const headers = await this.#getAuthHeader();
		const res = await fetch('/api/admin/attendance/bulk-check-in', {
			method: 'POST',
			headers,
			body: JSON.stringify({
				teamId,
				participantKeys
			})
		});

		const data = await res.json();
		if (!res.ok) {
			throw new Error(data.error || 'Bulk check-in failed');
		}
		return data.results as AttendanceRecord[];
	}
}

export const attendance = new AttendanceStore();
