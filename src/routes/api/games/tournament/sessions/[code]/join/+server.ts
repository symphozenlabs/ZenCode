import { handle, join, parseCode, readBody } from '$lib/server/games/tournament';
import type { RequestHandler } from './$types';

/** Participant: register with a display name (no account). */
export const POST: RequestHandler = ({ request, params }) =>
	handle(async () => {
		const body = await readBody(request);
		return join(parseCode(params.code), body.name);
	});
