import { requireAdmin } from '$lib/server/admin-session';
import { control, handle, parseCode, readBody } from '$lib/server/games/flappy';
import type { FlapControl } from '$lib/games/flappy/types';
import type { RequestHandler } from './$types';

/** Admin: start the timer or finish the game. */
export const POST: RequestHandler = ({ request, params }) =>
	handle(async () => {
		await requireAdmin(request);
		const body = await readBody(request);
		return control(parseCode(params.code), body.action as FlapControl);
	});
