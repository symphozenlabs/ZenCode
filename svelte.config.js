import adapter from '@sveltejs/adapter-vercel';
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';

/** @type {import('@sveltejs/kit').Config} */
const config = {
	preprocess: vitePreprocess(),
	kit: {
		adapter: adapter(),
		// The registration page (from main) reads VITE_FIREBASE_*; share the same
		// variables with the admin and games instead of duplicating them.
		env: { publicPrefix: 'VITE_' }
	}
};

export default config;
