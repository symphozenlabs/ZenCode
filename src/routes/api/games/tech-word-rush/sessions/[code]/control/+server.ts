import { requireAdmin } from '$lib/server/admin-session';
import { control, handle, parseCode, readBody } from '$lib/server/games/tech-word-rush';
import type { ControlAction } from '$lib/games/tech-word-rush/types';
import type { RequestHandler } from './$types';

/** Admin: drive the session (start, next, end, leaderboard, finish). */
export const POST: RequestHandler = ({ request, params }) =>
	handle(async () => {
		await requireAdmin(request);
		const body = await readBody(request);
		return control(parseCode(params.code), body.action as ControlAction);
	});
