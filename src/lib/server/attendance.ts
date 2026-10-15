import { adminDb } from './admin-session';
import {
	collection,
	doc,
	getDoc,
	getDocs,
	setDoc,
	updateDoc,
	query,
	where,
	orderBy,
	serverTimestamp,
	writeBatch
} from 'firebase/firestore';
import {
	ATTENDANCE_COLLECTIONS,
	getParticipantKey,
	getRecordId,
	generateCsv,
	type AttendanceSession,
	type AttendanceRecord,
	type AttendanceAuditLog,
	type StudentAttendanceRow,
	type TeamAttendanceRow,
	type AttendanceOverviewStats,
	type AttendanceSessionStatus,
	type ParticipantAttendanceStatus
} from '$lib/attendance/model';
import { COLLECTIONS as REG_COLLECTIONS, getAllTeamParticipants, type EventId, type Registration } from '$lib/registrations/model';

/**
 * Fetches all attendance sessions, ordered by creation date descending.
 */
export async function getSessions(eventId?: EventId): Promise<AttendanceSession[]> {
	const db = await adminDb();
	const sessionsRef = collection(db, ATTENDANCE_COLLECTIONS.SESSIONS);
	const snap = await getDocs(sessionsRef);

	const sessions: AttendanceSession[] = snap.docs.map((d) => {
		const data = d.data();
		return {
			id: d.id,
			eventId: data.eventId,
			eventName: data.eventName,
			name: data.name,
			date: data.date,
			status: data.status as AttendanceSessionStatus,
			notes: data.notes || '',
			createdBy: data.createdBy,
			createdAt: data.createdAt?.toMillis ? data.createdAt.toMillis() : (data.createdAt || Date.now()),
			updatedAt: data.updatedAt?.toMillis ? data.updatedAt.toMillis() : (data.updatedAt || Date.now()),
			finalizedAt: data.finalizedAt?.toMillis ? data.finalizedAt.toMillis() : (data.finalizedAt || null),
			finalizedBy: data.finalizedBy || null
		};
	});

	sessions.sort((a, b) => b.createdAt - a.createdAt);

	if (eventId) {
		return sessions.filter((s) => s.eventId === eventId);
	}
	return sessions;
}

/**
 * Creates a new attendance session.
 */
export async function createSession(params: {
	name: string;
	eventId: EventId;
	date: string;
	notes?: string;
	createdBy: string;
}): Promise<AttendanceSession> {
	const db = await adminDb();
	const sessionsRef = collection(db, ATTENDANCE_COLLECTIONS.SESSIONS);
	const newDocRef = doc(sessionsRef);

	const eventName = params.eventId === 'pitch-fest' ? 'Pitch Fest' : 'Hackathon';
	const now = Date.now();

	const sessionData = {
		eventId: params.eventId,
		eventName,
		name: params.name.trim(),
		date: params.date.trim(),
		status: 'open',
		notes: (params.notes || '').trim(),
		createdBy: params.createdBy,
		createdAt: serverTimestamp(),
		updatedAt: serverTimestamp(),
		finalizedAt: null,
		finalizedBy: null
	};

	await setDoc(newDocRef, sessionData);

	return {
		id: newDocRef.id,
		eventId: params.eventId,
		eventName,
		name: params.name.trim(),
		date: params.date.trim(),
		status: 'open',
		notes: (params.notes || '').trim(),
		createdBy: params.createdBy,
		createdAt: now,
		updatedAt: now,
		finalizedAt: null,
		finalizedBy: null
	};
}

/**
 * Updates session status (finalize or reopen) or notes.
 */
export async function updateSession(
	sessionId: string,
	updates: {
		status?: AttendanceSessionStatus;
		name?: string;
		notes?: string;
		updatedBy: string;
	}
): Promise<void> {
	const db = await adminDb();
	const sessionRef = doc(db, ATTENDANCE_COLLECTIONS.SESSIONS, sessionId);
	const snap = await getDoc(sessionRef);

	if (!snap.exists()) {
		throw new Error(`Session "${sessionId}" not found.`);
	}

	const payload: Record<string, unknown> = {
		updatedAt: serverTimestamp()
	};

	if (updates.name !== undefined) payload.name = updates.name.trim();
	if (updates.notes !== undefined) payload.notes = updates.notes.trim();

	if (updates.status === 'finalized') {
		payload.status = 'finalized';
		payload.finalizedAt = serverTimestamp();
		payload.finalizedBy = updates.updatedBy;
	} else if (updates.status === 'open') {
		payload.status = 'open';
		payload.finalizedAt = null;
		payload.finalizedBy = null;
	}

	await updateDoc(sessionRef, payload);
}

/**
 * Looks up a registered team in Firestore across both events.
 */
export async function findRegisteredTeam(teamId: string): Promise<{ event: EventId; docId: string; data: Record<string, any> } | null> {
	const db = await adminDb();

	// Check Hackathon
	const hackSnap = await getDoc(doc(db, REG_COLLECTIONS.HACKATHON, teamId));
	if (hackSnap.exists()) {
		return { event: 'hackathon', docId: hackSnap.id, data: hackSnap.data() };
	}

	// Check Pitch Fest
	const pitchSnap = await getDoc(doc(db, REG_COLLECTIONS.PITCH_FEST, teamId));
	if (pitchSnap.exists()) {
		return { event: 'pitch-fest', docId: pitchSnap.id, data: pitchSnap.data() };
	}

	return null;
}

/**
 * Fetches attendance records for a session.
 */
export async function getSessionRecords(sessionId: string): Promise<AttendanceRecord[]> {
	const db = await adminDb();
	const recordsRef = collection(db, ATTENDANCE_COLLECTIONS.RECORDS);
	const q = query(recordsRef, where('sessionId', '==', sessionId));
	const snap = await getDocs(q);

	return snap.docs.map((d) => {
		const data = d.data();
		return {
			id: d.id,
			sessionId: data.sessionId,
			eventId: data.eventId,
			teamId: data.teamId,
			teamName: data.teamName,
			participantKey: data.participantKey,
			studentName: data.studentName,
			admissionNumber: data.admissionNumber,
			yearOfStudy: data.yearOfStudy,
			email: data.email,
			memberNumber: data.memberNumber,
			isLeader: Boolean(data.isLeader),
			status: 'present',
			checkedInAt: data.checkedInAt?.toMillis ? data.checkedInAt.toMillis() : (data.checkedInAt || Date.now()),
			checkedInBy: data.checkedInBy || '',
			createdAt: data.createdAt?.toMillis ? data.createdAt.toMillis() : (data.createdAt || Date.now()),
			updatedAt: data.updatedAt?.toMillis ? data.updatedAt.toMillis() : (data.updatedAt || Date.now())
		};
	});
}

/**
 * Records individual student check-in.
 * Validates session open status, team registration, and member inclusion.
 */
export async function checkInStudent(params: {
	sessionId: string;
	teamId: string;
	participantKey: string;
	organizerEmail: string;
	overrideFinalized?: boolean;
}): Promise<AttendanceRecord> {
	const db = await adminDb();

	// 1. Validate session
	const sessionRef = doc(db, ATTENDANCE_COLLECTIONS.SESSIONS, params.sessionId);
	const sessionSnap = await getDoc(sessionRef);
	if (!sessionSnap.exists()) {
		throw new Error('Attendance session does not exist.');
	}
	const sessionData = sessionSnap.data();
	if (sessionData.status === 'finalized' && !params.overrideFinalized) {
		throw new Error('This attendance session is finalized. Check-ins are closed unless explicitly authorized.');
	}

	// 2. Validate team registration
	const teamInfo = await findRegisteredTeam(params.teamId);
	if (!teamInfo) {
		throw new Error(`Team ID "${params.teamId}" is not registered in the system.`);
	}
	if (teamInfo.event !== sessionData.eventId) {
		throw new Error(`Team belongs to ${teamInfo.event}, but this attendance session is for ${sessionData.eventName}.`);
	}

	// 3. Validate member in team
	const allParticipants = getAllTeamParticipants({
		teamLeader: teamInfo.data.teamLeader,
		members: teamInfo.data.members
	});

	const targetMember = allParticipants.find((p) => getParticipantKey(p) === params.participantKey);
	if (!targetMember) {
		throw new Error(`Participant "${params.participantKey}" is not a registered member of team "${teamInfo.data.teamName || params.teamId}".`);
	}

	// 4. Create record with deterministic ID
	const recordId = getRecordId(params.sessionId, params.teamId, params.participantKey);
	const recordRef = doc(db, ATTENDANCE_COLLECTIONS.RECORDS, recordId);
	const existingSnap = await getDoc(recordRef);

	const teamName = teamInfo.data.teamName || `${teamInfo.data.teamLeader?.name || 'ZenCode'}'s Team`;
	const now = Date.now();

	if (existingSnap.exists() && existingSnap.data().status === 'present') {
		const existingData = existingSnap.data();
		return {
			id: recordId,
			sessionId: params.sessionId,
			eventId: teamInfo.event,
			teamId: params.teamId,
			teamName,
			participantKey: params.participantKey,
			studentName: targetMember.name,
			admissionNumber: targetMember.admissionNumber,
			yearOfStudy: targetMember.yearOfStudy,
			email: targetMember.email,
			memberNumber: targetMember.memberNumber,
			isLeader: targetMember.isLeader,
			status: 'present',
			checkedInAt: existingData.checkedInAt?.toMillis ? existingData.checkedInAt.toMillis() : (existingData.checkedInAt || now),
			checkedInBy: existingData.checkedInBy || params.organizerEmail,
			createdAt: existingData.createdAt?.toMillis ? existingData.createdAt.toMillis() : (existingData.createdAt || now),
			updatedAt: now
		};
	}

	const recordData = {
		sessionId: params.sessionId,
		eventId: teamInfo.event,
		teamId: params.teamId,
		teamName,
		participantKey: params.participantKey,
		studentName: targetMember.name,
		admissionNumber: targetMember.admissionNumber,
		yearOfStudy: targetMember.yearOfStudy,
		email: targetMember.email,
		memberNumber: targetMember.memberNumber,
		isLeader: targetMember.isLeader,
		status: 'present',
		checkedInAt: serverTimestamp(),
		checkedInBy: params.organizerEmail,
		createdAt: serverTimestamp(),
		updatedAt: serverTimestamp()
	};

	await setDoc(recordRef, recordData, { merge: true });

	return {
		id: recordId,
		sessionId: params.sessionId,
		eventId: teamInfo.event,
		teamId: params.teamId,
		teamName,
		participantKey: params.participantKey,
		studentName: targetMember.name,
		admissionNumber: targetMember.admissionNumber,
		yearOfStudy: targetMember.yearOfStudy,
		email: targetMember.email,
		memberNumber: targetMember.memberNumber,
		isLeader: targetMember.isLeader,
		status: 'present',
		checkedInAt: now,
		checkedInBy: params.organizerEmail,
		createdAt: now,
		updatedAt: now
	};
}

/**
 * Audited correction of an attendance record (e.g. marking absent, resetting, or overriding).
 */
export async function correctAttendance(params: {
	recordId: string;
	newStatus: 'present' | 'not-checked-in' | 'absent';
	reason: string;
	organizerEmail: string;
}): Promise<void> {
	if (!params.reason || params.reason.trim().length < 3) {
		throw new Error('A valid reason for the correction is required.');
	}

	const db = await adminDb();
	const recordRef = doc(db, ATTENDANCE_COLLECTIONS.RECORDS, params.recordId);
	const recordSnap = await getDoc(recordRef);

	if (!recordSnap.exists()) {
		throw new Error('Attendance record not found.');
	}

	const recordData = recordSnap.data();
	const previousStatus = recordData.status || 'present';

	const batch = writeBatch(db);

	// Create audit log
	const auditRef = doc(collection(db, ATTENDANCE_COLLECTIONS.AUDIT_LOGS));
	batch.set(auditRef, {
		recordId: params.recordId,
		sessionId: recordData.sessionId,
		eventId: recordData.eventId,
		teamId: recordData.teamId,
		teamName: recordData.teamName || '',
		participantKey: recordData.participantKey,
		studentName: recordData.studentName,
		admissionNumber: recordData.admissionNumber,
		previousStatus,
		newStatus: params.newStatus,
		reason: params.reason.trim(),
		changedBy: params.organizerEmail,
		timestamp: serverTimestamp()
	});

	if (params.newStatus === 'present') {
		batch.update(recordRef, {
			status: 'present',
			checkedInAt: serverTimestamp(),
			checkedInBy: params.organizerEmail,
			updatedAt: serverTimestamp()
		});
	} else {
		// If resetting or marking absent, delete the 'present' record so student is counted as not-checked-in or absent
		batch.delete(recordRef);
	}

	await batch.commit();
}

export { buildAttendanceMatrix } from '$lib/attendance/model';
