/// <reference types="vitest/config" />
import { sveltekit } from '@sveltejs/kit/vite';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig, loadEnv, type Plugin } from 'vite';

/** Route /live WebSocket upgrades to the live-session hub in `vite dev`. */
function liveSocket(): Plugin {
	return {
		name: 'zencode-live-socket',
		configureServer(server) {
			server.httpServer?.on('upgrade', async (req, socket, head) => {
				// A client that resets mid-handshake must not crash the dev server.
				socket.on('error', () => socket.destroy());
				if ((req.url ?? '').split('?')[0] !== '/live') return; // leave Vite HMR alone
				try {
					const mod = await server.ssrLoadModule('/src/lib/server/live/index.ts');
					mod.liveHub().handleUpgrade(req, socket, head);
				} catch (err) {
					console.error('[live] upgrade failed', err);
					socket.destroy();
				}
			});
		}
	};
}

export default defineConfig(({ mode }) => {
	// The registration email code (src/lib/server/*.js, from main) reads
	// process.env directly, so expose .env to it in dev as main's Vite app did.
	const env = loadEnv(mode, process.cwd(), '');
	for (const [key, value] of Object.entries(env)) process.env[key] ??= value;
	if (env.RESEND_FROM && !process.env.RESEND_FROM_EMAIL) process.env.RESEND_FROM_EMAIL = env.RESEND_FROM;
	if (env.RESEND_FROM_EMAIL && !process.env.RESEND_FROM) process.env.RESEND_FROM = env.RESEND_FROM_EMAIL;

	return {
		plugins: [tailwindcss(), sveltekit(), liveSocket()],
		test: {
			projects: [
				{ extends: true, test: { name: 'server', include: ['src/**/*.test.ts'], exclude: ['src/**/*.svelte.test.ts'] } },
				// Client stores need Svelte's browser runtime (effects run) — not the SSR build
				{ extends: true, resolve: { conditions: ['browser'] }, ssr: { resolve: { conditions: ['browser'] } }, test: { name: 'client', environment: './tests/node-client-env.ts', include: ['src/**/*.svelte.test.ts'] } }
			]
		}
	};
});
