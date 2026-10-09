/// <reference types="vitest/config" />
import { sveltekit } from '@sveltejs/kit/vite';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig, type Plugin } from 'vite';

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

export default defineConfig({
	plugins: [tailwindcss(), sveltekit(), liveSocket()],
	test: {
		projects: [
			{ extends: true, test: { name: 'server', include: ['src/**/*.test.ts'], exclude: ['src/**/*.svelte.test.ts'] } },
			// Client stores need Svelte's browser runtime (effects run) — not the SSR build
			{ extends: true, resolve: { conditions: ['browser'] }, ssr: { resolve: { conditions: ['browser'] } }, test: { name: 'client', environment: './tests/node-client-env.ts', include: ['src/**/*.svelte.test.ts'] } }
		]
	}
});
