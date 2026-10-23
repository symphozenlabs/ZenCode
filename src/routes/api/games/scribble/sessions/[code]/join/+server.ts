import { requireServerCredentials } from '$lib/server/admin-session';
import { handle, join, parseCode, readBody } from '$lib/server/games/scribble';
import type { RequestHandler } from './$types';

/** Participant: join with a display name. No account — returns a device token. */
export const POST: RequestHandler = ({ request, params }) =>
	handle(async () => {
		await requireServerCredentials();
		const body = await readBody(request);
		return join(parseCode(params.code), body.name);
	});
