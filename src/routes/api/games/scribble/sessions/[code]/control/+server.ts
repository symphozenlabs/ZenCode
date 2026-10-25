import { requireAdmin } from '$lib/server/admin-session';
import { control, handle, parseCode, readBody } from '$lib/server/games/scribble';
import type { DrawControl } from '$lib/games/scribble/types';
import type { RequestHandler } from './$types';

/** Admin: start, move on when due, skip a turn, end or restart the game. */
export const POST: RequestHandler = ({ request, params }) =>
	handle(async () => {
		await requireAdmin(request);
		const body = await readBody(request);
		return control(parseCode(params.code), body.action as DrawControl);
	});
