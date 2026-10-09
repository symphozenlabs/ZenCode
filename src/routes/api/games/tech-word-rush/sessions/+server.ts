import { requireAdmin } from '$lib/server/admin-session';
import { createSession, handle, readBody } from '$lib/server/games/tech-word-rush';
import type { RequestHandler } from './$types';

/** Admin: create a lobby with 10 freshly picked words. */
export const POST: RequestHandler = ({ request }) =>
	handle(async () => {
		const admin = await requireAdmin(request);
		const body = await readBody(request);
		return createSession(admin.email, Number(body.duration));
	});
