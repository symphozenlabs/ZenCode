import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { requireAdmin } from '$lib/server/admin-session';
import { checkInStudent } from '$lib/server/attendance';

export const POST: RequestHandler = async ({ request }) => {
	const admin = await requireAdmin(request);
	const body = await request.json();

	const { teamId, participantKeys } = body;

	if (!teamId || !Array.isArray(participantKeys) || participantKeys.length === 0) {
		return json({ error: 'teamId and an array of participantKeys are required.' }, { status: 400 });
	}

	const results = [];
	const errors = [];

	for (const participantKey of participantKeys) {
		try {
			const record = await checkInStudent({
				teamId,
				participantKey,
				organizerEmail: admin.email
			});
			results.push(record);
		} catch (err: any) {
			errors.push({ participantKey, error: err.message });
		}
	}

	return json({
		success: errors.length === 0,
		results,
		errors
	});
};
