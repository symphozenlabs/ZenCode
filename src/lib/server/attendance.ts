import { adminDb } from './admin-session';
import {
	collection,
	doc,
	getDoc,
	getDocs,
	setDoc,
	serverTimestamp
} from 'firebase/firestore';
import {
	ATTENDANCE_COLLECTIONS,
	getParticipantKey,
	getRecordId,
	type AttendanceRecord,
	type StudentAttendanceRow,
	type TeamAttendanceRow,
	type AttendanceOverviewStats,
	type TeamAttendanceStatus
} from '$lib/attendance/model';
import { COLLECTIONS as REG_COLLECTIONS, getAllTeamParticipants, type EventId } from '$lib/registrations/model';

export { buildAttendanceMatrix } from '$lib/attendance/model';

/**
 * Looks up a registered team in Firestore across both events (Hackathon & Pitch Fest).
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
 * Fetches all attendance records from Firestore.
 */
export async function getAllAttendanceRecords(eventId?: EventId): Promise<AttendanceRecord[]> {
	const db = await adminDb();
	const recordsRef = collection(db, ATTENDANCE_COLLECTIONS.RECORDS);
	const snap = await getDocs(recordsRef);

	const records: AttendanceRecord[] = snap.docs.map((d) => {
		const data = d.data();
		return {
			id: d.id,
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
			updatedAt: data.updatedAt?.toMillis ? data.updatedAt.toMillis() : (data.updatedAt || Date.now()),
			sessionId: data.sessionId
		};
	});

	if (eventId) {
		return records.filter((r) => r.eventId === eventId);
	}
	return records;
}

/**
 * Records individual student check-in without requiring a session.
 * Validates team registration and team membership.
 * Deterministic document ID ensures idempotent writes without duplicates.
 */
export async function checkInStudent(params: {
	teamId: string;
	participantKey: string;
	organizerEmail: string;
	sessionId?: string;
	overrideFinalized?: boolean;
}): Promise<AttendanceRecord> {
	const db = await adminDb();

	// 1. Validate team registration
	const teamInfo = await findRegisteredTeam(params.teamId);
	if (!teamInfo) {
		throw new Error(`Team ID "${params.teamId}" is not registered in the system.`);
	}

	// 2. Validate member in team roster
	const allParticipants = getAllTeamParticipants({
		teamLeader: teamInfo.data.teamLeader,
		members: teamInfo.data.members
	});

	const targetMember = allParticipants.find((p) => getParticipantKey(p) === params.participantKey);
	if (!targetMember) {
		throw new Error(`Participant "${params.participantKey}" is not a registered member of team "${teamInfo.data.teamName || params.teamId}".`);
	}

	// 3. Create or retrieve record with deterministic ID
	const recordId = getRecordId(params.teamId, params.participantKey);
	const recordRef = doc(db, ATTENDANCE_COLLECTIONS.RECORDS, recordId);
	const existingSnap = await getDoc(recordRef);

	const teamName = teamInfo.data.teamName || `${teamInfo.data.teamLeader?.name || 'ZenCode'}'s Team`;
	const now = Date.now();

	if (existingSnap.exists() && existingSnap.data().status === 'present') {
		const existingData = existingSnap.data();
		return {
			id: recordId,
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
			updatedAt: now,
			sessionId: existingData.sessionId
		};
	}

	const recordData: Record<string, any> = {
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

	if (params.sessionId) {
		recordData.sessionId = params.sessionId;
	}

	await setDoc(recordRef, recordData, { merge: true });

	return {
		id: recordId,
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
		updatedAt: now,
		sessionId: params.sessionId
	};
}
