import nodeAdapter from '@sveltejs/adapter-node';
import vercelAdapter from '@sveltejs/adapter-vercel';
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';

/** @type {import('@sveltejs/kit').Config} */
const config = {
	preprocess: vitePreprocess(),
	kit: {
		// Vercel builds (VERCEL=1) use its adapter; everywhere else build for
		// server.js, which also hosts the live-session WebSocket that Vercel can't.
		adapter: process.env.VERCEL ? vercelAdapter() : nodeAdapter(),
		// The registration page (from main) reads VITE_FIREBASE_*; share the same
		// variables with the admin and games instead of duplicating them.
		env: { publicPrefix: 'VITE_' }
	}
};

export default config;
