import { json } from '@sveltejs/kit';
import { adminConfigured, NOT_CONFIGURED } from '$lib/server/admin-session';
import type { RequestHandler } from './$types';

/** Lets the admin Games page warn before a live game is attempted. */
export const GET: RequestHandler = () => {
	const ready = adminConfigured();
	return json({ ready, message: ready ? null : NOT_CONFIGURED });
};
