// Production entry: the adapter-node handler plus the live-session WebSocket.
//   npm run build && npm start
import { createServer } from 'node:http';
import { handler } from './build/handler.js';

const port = Number(process.env.PORT ?? 3000);
const host = process.env.HOST ?? '0.0.0.0';

const server = createServer(handler);

server.on('upgrade', (req, socket, head) => {
	socket.on('error', () => socket.destroy());
	const hub = globalThis.__zencodeLive;
	if (!hub?.handleUpgrade(req, socket, head)) socket.destroy();
});

server.listen(port, host, () => console.log(`ZenCode listening on http://${host}:${port}`));

const shutdown = () => {
	globalThis.__zencodeLive?.close();
	server.close(() => process.exit(0));
	setTimeout(() => process.exit(0), 5000).unref();
};
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
