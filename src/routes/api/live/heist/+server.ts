import { requireAdmin } from '$lib/server/admin-session';
import { heistHub } from '$lib/server/games/word-heist/hub';
import { handle, parseRules, readBody } from '$lib/server/games/word-heist/service';
import { HeistError } from '$lib/server/games/word-heist/tournament';
import { error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

/**
 * Admin: open a Word Heist tournament on the live server (under /api/live so
 * a Vercel site reaches it through VITE_LIVE_ORIGIN, with the same CORS).
 */
export const POST: RequestHandler = ({ request }) =>
	handle(async () => {
		const admin = await requireAdmin(request);
		const rules = parseRules((await readBody(request)).rules);
		try {
			return { code: await heistHub().create(admin.email, rules) };
		} catch (err) {
			if (err instanceof HeistError) error(500, err.message);
			throw err;
		}
	});
