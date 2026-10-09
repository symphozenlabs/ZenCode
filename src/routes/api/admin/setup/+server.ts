import { error } from '@sveltejs/kit';
import { adminDb, matchesAdminCredentials } from '$lib/server/admin-session';
import { handle, readBody } from '$lib/server/games/tech-word-rush';
import type { RequestHandler } from './$types';

/**
 * First sign-in: if the typed login matches ADMIN_EMAIL / ADMIN_PASSWORD in .env,
 * make sure the Firebase Auth account exists (the server creates it on sign-in).
 */
export const POST: RequestHandler = ({ request }) =>
	handle(async () => {
		const body = await readBody(request);
		if (!matchesAdminCredentials(String(body.email ?? ''), String(body.password ?? ''))) {
			error(401, 'Email or password is incorrect.');
		}
		await adminDb();
		return { ok: true };
	});
