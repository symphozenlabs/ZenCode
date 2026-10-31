import { requireAdmin } from '$lib/server/admin-session';
import { control, handle, parseCode, readBody } from '$lib/server/games/tournament';
import type { TournamentControl } from '$lib/games/tournament/types';
import type { RequestHandler } from './$types';

/** Admin: lock entries, finish a stage, remove a player, close. */
export const POST: RequestHandler = ({ request, params }) =>
	handle(async () => {
		await requireAdmin(request);
		const body = await readBody(request);
		return control(parseCode(params.code), body.action as TournamentControl, body);
	});
