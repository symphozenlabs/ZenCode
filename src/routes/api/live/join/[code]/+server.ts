import { error, json } from '@sveltejs/kit';
import { liveHub } from '$lib/server/live';
import { hubCall } from '$lib/server/live/http';
import { rateLimit } from '$lib/server/rate-limit';
import type { RequestHandler } from './$types';

/** Public: does this join code belong to an open session? */
export const GET: RequestHandler = async ({ params, getClientAddress }) => {
	// Generous: a whole room often shares one campus Wi-Fi address.
	if (!rateLimit(`live-code:${getClientAddress()}`, 300, 60_000)) error(429, 'Too many attempts. Wait a moment.');
	const found = await hubCall(() => liveHub().lookupCode(params.code));
	if (!found) error(404, 'That code doesn’t match a live session.');
	return json(found);
};
