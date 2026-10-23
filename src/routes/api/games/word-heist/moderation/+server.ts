import { requireAdmin } from '$lib/server/admin-session';
import { getModeration, handle, readBody, saveModeration, testWord } from '$lib/server/games/word-heist/service';
import type { RequestHandler } from './$types';

/** Admin: read the Word Heist moderation settings. */
export const GET: RequestHandler = ({ request }) =>
	handle(async () => {
		await requireAdmin(request);
		return getModeration();
	});

/** Admin: save the event blocklist and obfuscation setting. */
export const PUT: RequestHandler = ({ request }) =>
	handle(async () => {
		const admin = await requireAdmin(request);
		return saveModeration(admin.email, await readBody(request));
	});

/** Admin: check whether a word would be accepted. */
export const POST: RequestHandler = ({ request }) =>
	handle(async () => {
		await requireAdmin(request);
		return testWord((await readBody(request)).word);
	});
