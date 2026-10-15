import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { requireAdmin } from '$lib/server/admin-session';
import { correctAttendance } from '$lib/server/attendance';

export const POST: RequestHandler = async ({ request }) => {
	const admin = await requireAdmin(request);
	const body = await request.json();

	const { recordId, newStatus, reason } = body;

	if (!recordId || !newStatus || !reason) {
		return json({ error: 'recordId, newStatus, and reason are required.' }, { status: 400 });
	}

	try {
		await correctAttendance({
			recordId,
			newStatus,
			reason,
			organizerEmail: admin.email
		});
		return json({ success: true });
	} catch (err: any) {
		return json({ error: err.message || 'Correction failed.' }, { status: 400 });
	}
};
