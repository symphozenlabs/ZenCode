import { requireServerCredentials } from '$lib/server/admin-session';
import { handle, parseCode, play, readBody } from '$lib/server/games/tech-word-rush';
import type { RequestHandler } from './$types';

/** Participant: state / hint / answer / skip. All scoring happens on the server. */
export const POST: RequestHandler = ({ request, params }) =>
	handle(async () => {
		await requireServerCredentials();
		const body = await readBody(request);
		return play(parseCode(params.code), body);
	});
