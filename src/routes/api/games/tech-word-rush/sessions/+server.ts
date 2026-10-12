import { requireAdmin } from '$lib/server/admin-session';
import { createSession, handle, readBody } from '$lib/server/games/tech-word-rush';
import type { RequestHandler } from './$types';

/** Admin: create a lobby — random words from the bank, or a fixed `questions` set. */
export const POST: RequestHandler = ({ request }) =>
	handle(async () => {
		const admin = await requireAdmin(request);
		const body = await readBody(request);
		return createSession(admin.email, Number(body.duration), body.questions);
	});
