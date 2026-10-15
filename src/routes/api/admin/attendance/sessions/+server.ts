import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { requireAdmin } from '$lib/server/admin-session';
import { createSession, getSessions } from '$lib/server/attendance';
import type { EventId } from '$lib/config/site';

export const GET: RequestHandler = async ({ request, url }) => {
	await requireAdmin(request);
	const event = url.searchParams.get('event') as EventId | null;
	const sessions = await getSessions(event || undefined);
	return json({ sessions });
};

export const POST: RequestHandler = async ({ request }) => {
	const admin = await requireAdmin(request);
	const body = await request.json();

	const { name, eventId, date, notes } = body;
	if (!name || typeof name !== 'string' || name.trim().length < 2) {
		return json({ error: 'Session name must be at least 2 characters.' }, { status: 400 });
	}

	if (eventId !== 'hackathon' && eventId !== 'pitch-fest') {
		return json({ error: 'Invalid event ID. Must be "hackathon" or "pitch-fest".' }, { status: 400 });
	}

	const sessionDate = (typeof date === 'string' && date.trim()) ? date.trim() : new Date().toISOString().split('T')[0];

	const session = await createSession({
		name,
		eventId,
		date: sessionDate,
		notes: typeof notes === 'string' ? notes : '',
		createdBy: admin.email
	});

	return json({ session }, { status: 201 });
};
