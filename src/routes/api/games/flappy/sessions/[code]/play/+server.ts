import { requireServerCredentials } from '$lib/server/admin-session';
import { handle, parseCode, play, readBody } from '$lib/server/games/flappy';
import type { RequestHandler } from './$types';

/** Participant: state / start a flight / land a flight. Scores are checked on the server. */
export const POST: RequestHandler = ({ request, params }) =>
	handle(async () => {
		await requireServerCredentials();
		const body = await readBody(request);
		return play(parseCode(params.code), body);
	});
