import { handle, parseCode, play, readBody } from '$lib/server/games/tournament';
import type { RequestHandler } from './$types';

/** Participant: confirm this device is still in the tournament. */
export const POST: RequestHandler = ({ request, params }) =>
	handle(async () => {
		const body = await readBody(request);
		return play(parseCode(params.code), body);
	});
