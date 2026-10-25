import { requireServerCredentials } from '$lib/server/admin-session';
import { handle, parseCode, play, readBody } from '$lib/server/games/scribble';
import type { RequestHandler } from './$types';

/** Participant: state / pick a word / send strokes / guess / nudge the clock. Judged on the server. */
export const POST: RequestHandler = ({ request, params }) =>
	handle(async () => {
		await requireServerCredentials();
		const body = await readBody(request);
		return play(parseCode(params.code), body);
	});
