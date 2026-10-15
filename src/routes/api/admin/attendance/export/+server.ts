import type { RequestHandler } from './$types';
import { requireAdmin, adminDb } from '$lib/server/admin-session';
import { getSessions, getSessionRecords, buildAttendanceMatrix } from '$lib/server/attendance';
import { generateCsv, formatTimestamp } from '$lib/attendance/model';
import { collection, getDocs } from 'firebase/firestore';
import { COLLECTIONS as REG_COLLECTIONS, type EventId, type Registration } from '$lib/registrations/model';

export const GET: RequestHandler = async ({ request, url }) => {
	await requireAdmin(request);

	const type = url.searchParams.get('type') || 'students';
	const sessionId = url.searchParams.get('sessionId');
	const eventFilter = url.searchParams.get('eventId') as EventId | null;

	const allSessions = await getSessions();
	const targetSession = sessionId ? allSessions.find((s) => s.id === sessionId) : allSessions[0];

	if (!targetSession) {
		return new Response('No attendance session found to export.', { status: 404 });
	}

	// Fetch registrations from Firestore
	const db = await adminDb();
	const registrations: Registration[] = [];

	if (!eventFilter || eventFilter === 'hackathon') {
		const hackSnap = await getDocs(collection(db, REG_COLLECTIONS.HACKATHON));
		hackSnap.forEach((d) => {
			const data = d.data();
			registrations.push({
				id: d.id,
				event: 'hackathon',
				teamName: data.teamName || '',
				teamSize: data.teamSize || (data.members?.length || 0),
				teamLeader: data.teamLeader || { name: '', admissionNumber: '', classSection: '', email: '', mobileNumber: '' },
				members: data.members || [],
				status: data.status === 'rejected' ? 'rejected' : 'approved',
				createdAt: data.registeredAt?.toMillis ? data.registeredAt.toMillis() : 0,
				reviewedBy: data.reviewedBy || null,
				emailDelivery: []
			});
		});
	}

	if (!eventFilter || eventFilter === 'pitch-fest') {
		const pitchSnap = await getDocs(collection(db, REG_COLLECTIONS.PITCH_FEST));
		pitchSnap.forEach((d) => {
			const data = d.data();
			registrations.push({
				id: d.id,
				event: 'pitch-fest',
				teamName: data.teamName || '',
				teamSize: data.teamSize || (data.members?.length || 0),
				teamLeader: data.teamLeader || { name: '', admissionNumber: '', classSection: '', email: '', mobileNumber: '' },
				members: data.members || [],
				status: data.status === 'rejected' ? 'rejected' : 'approved',
				createdAt: data.registeredAt?.toMillis ? data.registeredAt.toMillis() : 0,
				reviewedBy: data.reviewedBy || null,
				emailDelivery: []
			});
		});
	}

	const records = await getSessionRecords(targetSession.id);
	const { studentRows, teamRows, overview } = buildAttendanceMatrix(registrations, targetSession, records);

	let csvContent = '';
	let filename = `attendance-${targetSession.id}`;

	if (type === 'students') {
		filename = `students-attendance-${targetSession.name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}.csv`;
		const headers = [
			'Event',
			'Session Name',
			'Session Date',
			'Team Name',
			'Team ID',
			'Student Name',
			'Admission Number',
			'Year of Study',
			'Email',
			'Role',
			'Attendance Status',
			'Check-in Time',
			'Checked in By (Organizer)'
		];

		const rows = studentRows.map((r) => [
			r.eventName,
			r.sessionName,
			targetSession.date,
			r.teamName,
			r.teamId,
			r.studentName,
			r.admissionNumber,
			r.yearOfStudy,
			r.email,
			r.isLeader ? 'Team Leader' : `Member ${r.memberNumber}`,
			r.status.toUpperCase(),
			r.checkedInAt ? formatTimestamp(r.checkedInAt) : '—',
			r.checkedInBy || '—'
		]);

		csvContent = generateCsv(headers, rows);
	} else if (type === 'teams') {
		filename = `teams-attendance-${targetSession.name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}.csv`;
		const headers = [
			'Event',
			'Session Name',
			'Team Name',
			'Team ID',
			'Team Leader',
			'Registered Members',
			'Present Members',
			'Not Checked In',
			'Absent',
			'Attendance Rate (%)',
			'Team Attendance Status'
		];

		const rows = teamRows.map((r) => [
			r.eventName,
			r.sessionName,
			r.teamName,
			r.teamId,
			r.teamLeaderName,
			r.registeredMemberCount,
			r.presentCount,
			r.notCheckedInCount,
			r.absentCount,
			`${r.attendancePercentage}%`,
			r.status
		]);

		csvContent = generateCsv(headers, rows);
	} else if (type === 'event') {
		filename = `event-attendance-summary-${targetSession.name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}.csv`;
		const headers = ['Metric', 'Value', 'Session Details'];
		const rows = [
			['Session Name', targetSession.name, `Event: ${targetSession.eventName}`],
			['Session Date', targetSession.date, `Status: ${targetSession.status.toUpperCase()}`],
			['Total Registered Students', overview.totalRegisteredStudents, 'Active approved registrations'],
			['Students Present', overview.totalPresentStudents, `${overview.overallAttendancePercentage}% attendance rate`],
			['Students Not Checked In', overview.totalNotCheckedInStudents, targetSession.status === 'open' ? 'Pending check-in' : '—'],
			['Students Absent', overview.totalAbsentStudents, targetSession.status === 'finalized' ? 'Session finalized' : '—'],
			['Overall Attendance Rate', `${overview.overallAttendancePercentage}%`, ''],
			['Total Registered Teams', overview.totalTeams, ''],
			['Teams Fully Present', overview.teamsFullyPresent, 'All members checked in'],
			['Teams Partially Present', overview.teamsPartiallyPresent, 'At least 1 member present'],
			['Teams With No Check-ins', overview.teamsNoCheckIns, '0 members checked in'],
			['Report Generated At', new Date().toISOString(), 'ZenCode 2026 Admin']
		];

		csvContent = generateCsv(headers, rows);
	}

	return new Response(csvContent, {
		status: 200,
		headers: {
			'Content-Type': 'text/csv; charset=utf-8',
			'Content-Disposition': `attachment; filename="${filename}"`
		}
	});
};
