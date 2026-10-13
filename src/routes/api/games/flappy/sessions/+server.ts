import { requireAdmin } from '$lib/server/admin-session';
import { createSession, handle, readBody } from '$lib/server/games/flappy';
import type { RequestHandler } from './$types';

/** Admin: open a Flappy Bird or Soar & Roar lobby with the chosen play window. */
export const POST: RequestHandler = ({ request }) =>
	handle(async () => {
		const admin = await requireAdmin(request);
		const body = await readBody(request);
		return createSession(admin.email, Number(body.duration), body.game ?? 'flappy');
	});
