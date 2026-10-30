import { requireAdmin } from '$lib/server/admin-session';
import { createTournament, handle, readBody } from '$lib/server/games/tournament';
import type { RequestHandler } from './$types';

/** Admin: open a tournament lobby for one of the Firestore-run games. */
export const POST: RequestHandler = ({ request }) =>
	handle(async () => {
		const admin = await requireAdmin(request);
		return createTournament(admin.email, await readBody(request));
	});
