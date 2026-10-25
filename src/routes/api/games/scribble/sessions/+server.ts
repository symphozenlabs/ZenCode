import { requireAdmin } from '$lib/server/admin-session';
import { createSession, handle, readBody } from '$lib/server/games/scribble';
import type { RequestHandler } from './$types';

/** Admin: open a Scribble Showdown lobby with the chosen drawing time, turns and words. */
export const POST: RequestHandler = ({ request }) =>
	handle(async () => {
		const admin = await requireAdmin(request);
		return createSession(admin.email, await readBody(request));
	});
