import { sveltekit } from '@sveltejs/kit/vite';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig, loadEnv } from 'vite';

export default defineConfig(({ mode }) => {
	// The registration email code (src/lib/server/*.js, from main) reads
	// process.env directly, so expose .env to it in dev as main's Vite app did.
	const env = loadEnv(mode, process.cwd(), '');
	for (const [key, value] of Object.entries(env)) process.env[key] ??= value;
	if (env.RESEND_FROM && !process.env.RESEND_FROM_EMAIL) process.env.RESEND_FROM_EMAIL = env.RESEND_FROM;
	if (env.RESEND_FROM_EMAIL && !process.env.RESEND_FROM) process.env.RESEND_FROM = env.RESEND_FROM_EMAIL;

	return { plugins: [tailwindcss(), sveltekit()] };
});
