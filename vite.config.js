import { svelte } from '@sveltejs/vite-plugin-svelte'
import { defineConfig, loadEnv } from 'vite'

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
          let handlerPromise;

          server.middlewares.use('/api/registration/send-confirmation', async (req, res) => {
            try {
              handlerPromise ??= import('./src/lib/server/apiHandler.js')
                .then((module) => module.handleSendConfirmationApi);
              const handleSendConfirmationApi = await handlerPromise;
              handleSendConfirmationApi(req, res);
            } catch (err) {
              console.error('❌ [REGISTRATION ERROR] Failed to load API handler:', err);
              res.statusCode = 500;
              res.setHeader('Content-Type', 'application/json');
              res.end(JSON.stringify({ error: 'Failed to load registration API handler' }));
            }
          });
        }
      }
    ],
  };
});
