import { svelte } from '@sveltejs/vite-plugin-svelte'
import { defineConfig, loadEnv } from 'vite'
import { handleSendConfirmationApi } from './src/lib/server/apiHandler.js'

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  // Load environment variables from .env file into process.env for Node server middleware
  const env = loadEnv(mode, process.cwd(), '');
  Object.assign(process.env, env);

  if (env.RESEND_FROM && !process.env.RESEND_FROM_EMAIL) {
    process.env.RESEND_FROM_EMAIL = env.RESEND_FROM;
  }
  if (env.RESEND_FROM_EMAIL && !process.env.RESEND_FROM) {
    process.env.RESEND_FROM = env.RESEND_FROM_EMAIL;
  }

  return {
    plugins: [
      svelte(),
      {
        name: 'registration-api-middleware',
        configureServer(server) {
          server.middlewares.use('/api/registration/send-confirmation', (req, res) => {
            handleSendConfirmationApi(req, res);
          });
        }
      }
    ],
  };
});
