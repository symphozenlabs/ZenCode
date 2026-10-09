import { redirect, type Handle, type ServerInit } from '@sveltejs/kit';
import { liveHub } from '$lib/server/live';

// Create the live-session hub at startup so server.js can route WebSocket
// upgrades to it (it reads globalThis.__zencodeLive).
export const init: ServerInit = () => {
	liveHub();
};

// The admin area lives at /admin. Section-prefixed URLs such as
// /hackathon/admin/login are a common guess, so send them to the real route.
const PREFIXED_ADMIN = /^\/(?:hackathon|pitch-fest)\/admin(\/.*)?$/;

export const handle: Handle = async ({ event, resolve }) => {
	const match = PREFIXED_ADMIN.exec(event.url.pathname);
	if (match) redirect(308, `/admin${match[1] ?? ''}${event.url.search}`);
	return resolve(event);
};
