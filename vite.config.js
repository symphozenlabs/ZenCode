import { svelte } from '@sveltejs/vite-plugin-svelte'
import { defineConfig, loadEnv } from 'vite'
import { handleSendConfirmationApi } from './src/lib/server/apiHandler.js'

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  // Load environment variables from .env file into process.env for Node server middleware
  const env = loadEnv(mode, process.cwd(), '');

  if (env.RESEND_API_KEY) {
    process.env.RESEND_API_KEY = env.RESEND_API_KEY;
  }
  if (env.RESEND_FROM_EMAIL) {
    process.env.RESEND_FROM_EMAIL = env.RESEND_FROM_EMAIL;
  }
  if (env.RESEND_TEST_RECIPIENT) {
    process.env.RESEND_TEST_RECIPIENT = env.RESEND_TEST_RECIPIENT;
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
