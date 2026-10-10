import { env } from '$env/dynamic/public';
import { SOCKET_PATH } from './protocol';

/**
 * Where the live-session server runs. Empty means this same host (`vite dev`
 * or `node server.js`). On Vercel, which can't hold WebSockets or shared room
 * state, set VITE_LIVE_ORIGIN to the separately hosted server.js, e.g.
 * https://zencode-live.onrender.com.
 */
export function liveOrigin(): string {
	return (env.VITE_LIVE_ORIGIN ?? '').trim().replace(/\/+$/, '');
}

/** URL of a live HTTP endpoint: liveApi('/join/123456') → …/api/live/join/123456 */
export function liveApi(path: string): string {
	return `${liveOrigin()}/api/live${path}`;
}

/** WebSocket URL of the live hub. */
export function liveSocketUrl(): string {
	const origin = liveOrigin();
	if (origin) return `${origin.replace(/^http/, 'ws')}${SOCKET_PATH}`;
	const proto = location.protocol === 'https:' ? 'wss' : 'ws';
	return `${proto}://${location.host}${SOCKET_PATH}`;
}
