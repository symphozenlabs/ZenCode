import { json } from '@sveltejs/kit';
import { timingSafeEqual } from 'node:crypto';
import { env } from '$env/dynamic/private';
import type { RequestHandler } from './$types';
import { requireAdmin } from '$lib/server/admin-session';
import { revokeCheckIn } from '$lib/server/attendance';

/** Constant-time compare against ATTENDANCE_REVOKE_CODE in .env. */
function matchesRevokeCode(code: string) {
	const expected = env.ATTENDANCE_REVOKE_CODE ?? '';
	const a = Buffer.from(code);
	const b = Buffer.from(expected);
	return a.length === b.length && timingSafeEqual(a, b);
}

export const POST: RequestHandler = async ({ request }) => {
	await requireAdmin(request);
	const { teamId, participantKey, code } = await request.json();

	if (!teamId || !participantKey) {
		return json({ error: 'teamId and participantKey are required.' }, { status: 400 });
	}
	if (!env.ATTENDANCE_REVOKE_CODE) {
		return json({ error: 'Revoking needs ATTENDANCE_REVOKE_CODE in .env. Add it and restart the server.' }, { status: 503 });
	}
	if (typeof code !== 'string' || !matchesRevokeCode(code.trim())) {
		return json({ error: 'Incorrect revoke code.' }, { status: 403 });
	}

	try {
		const revoked = await revokeCheckIn({ teamId, participantKey });
		if (!revoked) return json({ error: 'This student is not checked in.' }, { status: 404 });
		return json({ success: true });
	} catch (err: any) {
		return json({ error: err.message || 'Revoke failed.' }, { status: 400 });
	}
};
