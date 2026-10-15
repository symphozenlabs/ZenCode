import { describe, it, expect } from 'vitest';
import {
	extractTeamIdFromQr,
	getParticipantKey,
	getRecordId,
	formatTimestamp,
	buildAttendanceMatrix,
	type AttendanceRecord
} from './model';
import { getAllTeamParticipants, type Registration } from '$lib/registrations/model';

describe('QR Payload & Team ID Extraction', () => {
	it('extracts team ID from full URL generated in participant emails', () => {
		const url = 'https://zencode.symphozen.com/check-in/hack-team-xyz-123';
		expect(extractTeamIdFromQr(url)).toBe('hack-team-xyz-123');
	});

	it('extracts team ID from relative check-in URL', () => {
		const url = '/check-in/pitch-fest-team-42?ref=scanner';
		expect(extractTeamIdFromQr(url)).toBe('pitch-fest-team-42');
	});

	it('extracts team ID from JSON payload string', () => {
		const json = JSON.stringify({ type: 'TEAM_ATTENDANCE', teamId: 'team-alpha-99' });
		expect(extractTeamIdFromQr(json)).toBe('team-alpha-99');
	});

	it('extracts team ID from raw input', () => {
		expect(extractTeamIdFromQr('raw-team-id-77')).toBe('raw-team-id-77');
		expect(extractTeamIdFromQr('  spaced-team-id  ')).toBe('spaced-team-id');
	});

	it('handles empty or invalid QR input gracefully', () => {
		expect(extractTeamIdFromQr('')).toBe('');
		expect(extractTeamIdFromQr(null as any)).toBe('');
	});
});

describe('Deterministic Record IDs & Participant Keys', () => {
	it('normalizes admission numbers into deterministic uppercase participant keys', () => {
		const member1 = { admissionNumber: '25capmca001', email: 'test@example.com', memberNumber: 1 };
		const member2 = { admissionNumber: '25CAPMCA001', email: 'other@example.com', memberNumber: 1 };
		expect(getParticipantKey(member1)).toBe('25CAPMCA001');
		expect(getParticipantKey(member2)).toBe('25CAPMCA001');
		expect(getParticipantKey(member1)).toBe(getParticipantKey(member2));
	});

	it('generates consistent, deterministic record IDs preventing race duplicates without sessions', () => {
		const id1 = getRecordId('team-hack-01', '25CAPMCA001');
		const id2 = getRecordId('team-hack-01', '25CAPMCA001');
		expect(id1).toBe('team-hack-01__25CAPMCA001');
		expect(id1).toBe(id2);
	});

	it('supports 3-arg legacy signature for backward compatibility', () => {
		const legacyId = getRecordId('legacy-session', 'team-hack-01', '25CAPMCA001');
		expect(legacyId).toBe('team-hack-01__25CAPMCA001');
	});

	it('cannot confuse teams with similar names', () => {
		const idTeam1 = getRecordId('team-1', '25CAPMCA001');
		const idTeam10 = getRecordId('team-10', '25CAPMCA001');
		expect(idTeam1).not.toBe(idTeam10);
	});
});

describe('Participant Roster Normalization', () => {
	it('returns individual participants with leader and members for Hackathon (3 or 4 members)', () => {
		const reg: Pick<Registration, 'teamLeader' | 'members'> = {
			teamLeader: {
				name: 'Alice Leader',
				admissionNumber: '25CAPMCA010',
				yearOfStudy: '1st Year MCA',
				classSection: '1st Year MCA',
				email: 'alice@example.com',
				mobileNumber: '9876543210'
			},
			members: [
				{
					memberNumber: 1,
					name: 'Alice Leader',
					admissionNumber: '25CAPMCA010',
					yearOfStudy: '1st Year MCA',
					email: 'alice@example.com'
				},
				{
					memberNumber: 2,
					name: 'Bob Member',
					admissionNumber: '25CAPMCA011',
					yearOfStudy: '1st Year MCA',
					email: 'bob@example.com'
				},
				{
					memberNumber: 3,
					name: 'Charlie Member',
					admissionNumber: '25CAPMCA012',
					yearOfStudy: '1st Year MCA',
					email: 'charlie@example.com'
				}
			]
		};

		const participants = getAllTeamParticipants(reg);
		expect(participants).toHaveLength(3);
		expect(participants[0].name).toBe('Alice Leader');
		expect(participants[0].isLeader).toBe(true);
		expect(participants[1].name).toBe('Bob Member');
		expect(participants[1].isLeader).toBe(false);
		expect(participants[2].name).toBe('Charlie Member');
		expect(participants[2].isLeader).toBe(false);
	});

	it('prepends team leader if leader was stored separately from members', () => {
		const reg: Pick<Registration, 'teamLeader' | 'members'> = {
			teamLeader: {
				name: 'Diana Leader',
				admissionNumber: '25CAPMCA020',
				yearOfStudy: '2nd Year MCA',
				classSection: '2nd Year MCA',
				email: 'diana@example.com',
				mobileNumber: '9876543210'
			},
			members: [
				{
					memberNumber: 1,
					name: 'Evan Partner',
					admissionNumber: '25CAPMCA021',
					yearOfStudy: '2nd Year MCA',
					email: 'evan@example.com'
				}
			]
		};

		const participants = getAllTeamParticipants(reg);
		expect(participants).toHaveLength(2);
		expect(participants[0].name).toBe('Diana Leader');
		expect(participants[0].isLeader).toBe(true);
		expect(participants[1].name).toBe('Evan Partner');
		expect(participants[1].isLeader).toBe(false);
	});
});

describe('Simplified Attendance Matrix (Session-Free)', () => {
	const mockHackathonTeams: Registration[] = [
		{
			id: 'team-alpha',
			event: 'hackathon',
			teamName: 'Alpha Innovators',
			teamSize: 3,
			teamLeader: {
				name: 'Alice Lead',
				admissionNumber: '25CAPMCA101',
				yearOfStudy: '1st Year MCA',
				classSection: '1st Year MCA',
				email: 'alice@alpha.com',
				mobileNumber: '9876543210'
			},
			members: [
				{ memberNumber: 1, name: 'Alice Lead', admissionNumber: '25CAPMCA101', email: 'alice@alpha.com' },
				{ memberNumber: 2, name: 'Bob Two', admissionNumber: '25CAPMCA102', email: 'bob@alpha.com' },
				{ memberNumber: 3, name: 'Charlie Three', admissionNumber: '25CAPMCA103', email: 'charlie@alpha.com' }
			],
			status: 'approved',
			createdAt: 500,
			reviewedBy: null,
			emailDelivery: []
		},
		{
			id: 'team-beta',
			event: 'hackathon',
			teamName: 'Beta Builders',
			teamSize: 3,
			teamLeader: {
				name: 'David Lead',
				admissionNumber: '25CAPMCA201',
				yearOfStudy: '2nd Year MCA',
				classSection: '2nd Year MCA',
				email: 'david@beta.com',
				mobileNumber: '9876543211'
			},
			members: [
				{ memberNumber: 1, name: 'David Lead', admissionNumber: '25CAPMCA201', email: 'david@beta.com' },
				{ memberNumber: 2, name: 'Eva Two', admissionNumber: '25CAPMCA202', email: 'eva@beta.com' },
				{ memberNumber: 3, name: 'Frank Three', admissionNumber: '25CAPMCA203', email: 'frank@beta.com' }
			],
			status: 'approved',
			createdAt: 600,
			reviewedBy: null,
			emailDelivery: []
		}
	];

	const mockPitchTeam: Registration = {
		id: 'team-pitch-01',
		event: 'pitch-fest',
		teamName: 'Pitch Pioneers',
		teamSize: 2,
		teamLeader: {
			name: 'Grace Lead',
			admissionNumber: '25CAPMCA301',
			yearOfStudy: '1st Year MCA',
			classSection: '1st Year MCA',
			email: 'grace@pitch.com',
			mobileNumber: '9876543212'
		},
		members: [
			{ memberNumber: 1, name: 'Grace Lead', admissionNumber: '25CAPMCA301', email: 'grace@pitch.com' },
			{ memberNumber: 2, name: 'Harry Partner', admissionNumber: '25CAPMCA302', email: 'harry@pitch.com' }
		],
		status: 'approved',
		createdAt: 700,
		reviewedBy: null,
		emailDelivery: []
	};

	it('marking one student present does NOT mark the other members present', () => {
		// Only Alice is checked in
		const records: AttendanceRecord[] = [
			{
				id: 'team-alpha__25CAPMCA101',
				eventId: 'hackathon',
				teamId: 'team-alpha',
				teamName: 'Alpha Innovators',
				participantKey: '25CAPMCA101',
				studentName: 'Alice Lead',
				admissionNumber: '25CAPMCA101',
				yearOfStudy: '1st Year MCA',
				email: 'alice@alpha.com',
				memberNumber: 1,
				isLeader: true,
				status: 'present',
				checkedInAt: 1500,
				checkedInBy: 'organizer@zencode.com',
				createdAt: 1500,
				updatedAt: 1500
			}
		];

		const matrix = buildAttendanceMatrix(mockHackathonTeams, records, 'hackathon');
		const alphaTeam = matrix.teamRows.find((t) => t.teamId === 'team-alpha')!;

		expect(alphaTeam.presentCount).toBe(1);
		expect(alphaTeam.notCheckedInCount).toBe(2);
		expect(alphaTeam.registeredMemberCount).toBe(3);
		expect(alphaTeam.status).toBe('Partially Present');

		// Check individual members
		expect(alphaTeam.members[0].studentName).toBe('Alice Lead');
		expect(alphaTeam.members[0].status).toBe('present');
		expect(alphaTeam.members[0].checkedInAt).toBe(1500);
		expect(alphaTeam.members[1].studentName).toBe('Bob Two');
		expect(alphaTeam.members[1].status).toBe('not-checked-in');
		expect(alphaTeam.members[1].checkedInAt).toBeNull();
		expect(alphaTeam.members[2].studentName).toBe('Charlie Three');
		expect(alphaTeam.members[2].status).toBe('not-checked-in');
	});

	it('a three-member team with two check-ins displays 2 of 3 members present and one not checked in', () => {
		const records: AttendanceRecord[] = [
			{
				id: 'team-alpha__25CAPMCA101',
				eventId: 'hackathon',
				teamId: 'team-alpha',
				teamName: 'Alpha Innovators',
				participantKey: '25CAPMCA101',
				studentName: 'Alice Lead',
				admissionNumber: '25CAPMCA101',
				yearOfStudy: '1st Year MCA',
				email: 'alice@alpha.com',
				memberNumber: 1,
				isLeader: true,
				status: 'present',
				checkedInAt: 1500,
				checkedInBy: 'organizer@zencode.com',
				createdAt: 1500,
				updatedAt: 1500
			},
			{
				id: 'team-alpha__25CAPMCA102',
				eventId: 'hackathon',
				teamId: 'team-alpha',
				teamName: 'Alpha Innovators',
				participantKey: '25CAPMCA102',
				studentName: 'Bob Two',
				admissionNumber: '25CAPMCA102',
				yearOfStudy: '1st Year MCA',
				email: 'bob@alpha.com',
				memberNumber: 2,
				isLeader: false,
				status: 'present',
				checkedInAt: 1510,
				checkedInBy: 'organizer@zencode.com',
				createdAt: 1510,
				updatedAt: 1510
			}
		];

		const matrix = buildAttendanceMatrix(mockHackathonTeams, records, 'hackathon');
		const alphaTeam = matrix.teamRows.find((t) => t.teamId === 'team-alpha')!;

		expect(alphaTeam.registeredMemberCount).toBe(3);
		expect(alphaTeam.presentCount).toBe(2);
		expect(alphaTeam.notCheckedInCount).toBe(1);
		expect(alphaTeam.attendancePercentage).toBe(67);
		expect(alphaTeam.status).toBe('Partially Present');
	});

	it('a team becomes fully present only when all its registered members have checked in', () => {
		const records: AttendanceRecord[] = [
			{
				id: 'team-alpha__25CAPMCA101',
				eventId: 'hackathon',
				teamId: 'team-alpha',
				teamName: 'Alpha Innovators',
				participantKey: '25CAPMCA101',
				studentName: 'Alice Lead',
				admissionNumber: '25CAPMCA101',
				yearOfStudy: '1st Year MCA',
				email: 'alice@alpha.com',
				memberNumber: 1,
				isLeader: true,
				status: 'present',
				checkedInAt: 1500,
				checkedInBy: 'organizer@zencode.com',
				createdAt: 1500,
				updatedAt: 1500
			},
			{
				id: 'team-alpha__25CAPMCA102',
				eventId: 'hackathon',
				teamId: 'team-alpha',
				teamName: 'Alpha Innovators',
				participantKey: '25CAPMCA102',
				studentName: 'Bob Two',
				admissionNumber: '25CAPMCA102',
				yearOfStudy: '1st Year MCA',
				email: 'bob@alpha.com',
				memberNumber: 2,
				isLeader: false,
				status: 'present',
				checkedInAt: 1510,
				checkedInBy: 'organizer@zencode.com',
				createdAt: 1510,
				updatedAt: 1510
			},
			{
				id: 'team-alpha__25CAPMCA103',
				eventId: 'hackathon',
				teamId: 'team-alpha',
				teamName: 'Alpha Innovators',
				participantKey: '25CAPMCA103',
				studentName: 'Charlie Three',
				admissionNumber: '25CAPMCA103',
				yearOfStudy: '1st Year MCA',
				email: 'charlie@alpha.com',
				memberNumber: 3,
				isLeader: false,
				status: 'present',
				checkedInAt: 1520,
				checkedInBy: 'organizer@zencode.com',
				createdAt: 1520,
				updatedAt: 1520
			}
		];

		const matrix = buildAttendanceMatrix(mockHackathonTeams, records, 'hackathon');
		const alphaTeam = matrix.teamRows.find((t) => t.teamId === 'team-alpha')!;

		expect(alphaTeam.presentCount).toBe(3);
		expect(alphaTeam.notCheckedInCount).toBe(0);
		expect(alphaTeam.attendancePercentage).toBe(100);
		expect(alphaTeam.status).toBe('Fully Present');
	});

	it('unchecked students are labeled not-checked-in, not absent', () => {
		const matrix = buildAttendanceMatrix(mockHackathonTeams, [], 'hackathon');
		const betaTeam = matrix.teamRows.find((t) => t.teamId === 'team-beta')!;

		expect(betaTeam.presentCount).toBe(0);
		expect(betaTeam.notCheckedInCount).toBe(3);
		expect(betaTeam.status).toBe('No Check-ins');
		expect(betaTeam.members[0].status).toBe('not-checked-in');

		expect(matrix.overview.totalPresentStudents).toBe(0);
		expect(matrix.overview.totalNotCheckedInStudents).toBe(6);
		expect(matrix.overview.overallAttendancePercentage).toBe(0);
	});

	it('different events maintain separate attendance records and filter cleanly', () => {
		const allRegistrations = [...mockHackathonTeams, mockPitchTeam];

		const pitchRecord: AttendanceRecord = {
			id: 'team-pitch-01__25CAPMCA301',
			eventId: 'pitch-fest',
			teamId: 'team-pitch-01',
			teamName: 'Pitch Pioneers',
			participantKey: '25CAPMCA301',
			studentName: 'Grace Lead',
			admissionNumber: '25CAPMCA301',
			yearOfStudy: '1st Year MCA',
			email: 'grace@pitch.com',
			memberNumber: 1,
			isLeader: true,
			status: 'present',
			checkedInAt: 2500,
			checkedInBy: 'admin@example.com',
			createdAt: 2500,
			updatedAt: 2500
		};

		// Filter = pitch-fest
		const pitchMatrix = buildAttendanceMatrix(allRegistrations, [pitchRecord], 'pitch-fest');
		expect(pitchMatrix.teamRows).toHaveLength(1);
		expect(pitchMatrix.teamRows[0].teamId).toBe('team-pitch-01');
		expect(pitchMatrix.overview.totalRegisteredStudents).toBe(2);
		expect(pitchMatrix.overview.totalPresentStudents).toBe(1);
		expect(pitchMatrix.overview.totalNotCheckedInStudents).toBe(1);
		expect(pitchMatrix.overview.overallAttendancePercentage).toBe(50);

		// Filter = all
		const allMatrix = buildAttendanceMatrix(allRegistrations, [pitchRecord], 'all');
		expect(allMatrix.teamRows).toHaveLength(3);
		expect(allMatrix.overview.totalRegisteredStudents).toBe(8); // 3 + 3 + 2
		expect(allMatrix.overview.totalPresentStudents).toBe(1);
		expect(allMatrix.overview.totalNotCheckedInStudents).toBe(7);
	});
});
