import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { requireAdmin } from '$lib/server/admin-session';
import { updateSession } from '$lib/server/attendance';

export const PATCH: RequestHandler = async ({ request, params }) => {
	const admin = await requireAdmin(request);
	const { id } = params;
	const body = await request.json();

	try {
		await updateSession(id, {
			status: body.status,
			name: body.name,
			notes: body.notes,
			updatedBy: admin.email
		});
		return json({ success: true });
	} catch (err: any) {
		return json({ error: err.message || 'Failed to update session.' }, { status: 400 });
	}
};
