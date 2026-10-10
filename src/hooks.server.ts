import { redirect, type Handle, type ServerInit } from '@sveltejs/kit';
import { env } from '$env/dynamic/private';
import { liveHub } from '$lib/server/live';

// Create the live-session hub at startup so server.js can route WebSocket
// upgrades to it (it reads globalThis.__zencodeLive).
// A broken live setup (e.g. bad Firebase Admin credentials) must not take the
// whole site down: log it, and let the /api/live routes report their own errors.
export const init: ServerInit = () => {
	try {
		liveHub();
	} catch (err) {
		console.error('[live] could not start the live hub', err);
	}
};

// The admin area lives at /admin. Section-prefixed URLs such as
// /hackathon/admin/login are a common guess, so send them to the real route.
const PREFIXED_ADMIN = /^\/(?:hackathon|pitch-fest)\/admin(\/.*)?$/;

// When the site is on Vercel and the live server is hosted separately
// (VITE_LIVE_ORIGIN), the site's origin must be listed here so browsers may
// call /api/live on this server. Comma-separated, e.g. https://zencode.vercel.app
function corsHeaders(origin: string | null): Record<string, string> | null {
	const allowed = (env.LIVE_ALLOWED_ORIGINS ?? '').split(',').map((o) => o.trim().replace(/\/+$/, ''));
	if (!origin || !allowed.includes(origin)) return null;
	return {
		'access-control-allow-origin': origin,
		'access-control-allow-methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS',
		'access-control-allow-headers': 'authorization, content-type',
		'access-control-max-age': '600',
		vary: 'Origin'
	};
}

export const handle: Handle = async ({ event, resolve }) => {
	const match = PREFIXED_ADMIN.exec(event.url.pathname);
	if (match) redirect(308, `/admin${match[1] ?? ''}${event.url.search}`);

	if (!event.url.pathname.startsWith('/api/live/')) return resolve(event);
	const cors = corsHeaders(event.request.headers.get('origin'));
	if (event.request.method === 'OPTIONS') return new Response(null, { status: cors ? 204 : 403, headers: cors ?? {} });
	const res = await resolve(event);
	if (cors) for (const [k, v] of Object.entries(cors)) res.headers.set(k, v);
	return res;
};
