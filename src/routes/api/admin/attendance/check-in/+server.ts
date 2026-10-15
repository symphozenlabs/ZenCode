import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { requireAdmin } from '$lib/server/admin-session';
import { checkInStudent } from '$lib/server/attendance';

export const POST: RequestHandler = async ({ request }) => {
	const admin = await requireAdmin(request);
	const body = await request.json();

	const { teamId, participantKey } = body;

	if (!teamId || !participantKey) {
		return json({ error: 'teamId and participantKey are required.' }, { status: 400 });
	}

	try {
		const record = await checkInStudent({
			teamId,
			participantKey,
			organizerEmail: admin.email
		});
		return json({ success: true, record });
	} catch (err: any) {
		return json({ error: err.message || 'Check-in failed.' }, { status: 400 });
	}
};
