import { requireAdmin } from '$lib/server/admin-session';
import { handle } from '$lib/server/games/flappy';
import { clearHistory } from '$lib/server/games/history';
import type { RequestHandler } from './$types';

/** Admin: delete every finished game session and all of its data. */
export const DELETE: RequestHandler = ({ request }) =>
	handle(async () => {
		await requireAdmin(request);
		return clearHistory();
	});
