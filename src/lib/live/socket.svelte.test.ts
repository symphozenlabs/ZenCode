import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { flushSync } from 'svelte';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { LiveSocket } from './socket.svelte';

// No SvelteKit runtime here: no live origin set, so the socket uses this host.
vi.mock('$env/dynamic/public', () => ({ env: {} }));

// This project resolves with the browser condition, which maps `ws` to its
// browser stub — load the Node server class from its file instead.
const WebSocketServer = createRequire(import.meta.url)(resolve('node_modules/ws/lib/websocket-server.js')) as typeof import('ws').WebSocketServer;

/**
 * Drives the real client socket the way pages do — started from an $effect —
 * against a plain WebSocket server, counting how many connections it opens.
 */
let server: Server;
let wss: InstanceType<typeof WebSocketServer>;
let connections = 0;
const cleanups: (() => void)[] = [];

beforeEach(async () => {
	connections = 0;
	server = createServer();
	wss = new WebSocketServer({ server, path: '/live' });
	wss.on('connection', (ws) => {
		connections++;
		ws.on('message', () => ws.send(JSON.stringify({ t: 'player_count', count: 1 })));
	});
	await new Promise<void>((r) => server.listen(0, '127.0.0.1', () => r()));
	const port = (server.address() as AddressInfo).port;
	// Minimal browser globals for the client class
	const g = globalThis as Record<string, unknown>;
	g.window = new EventTarget();
	g.document = Object.assign(new EventTarget(), { visibilityState: 'visible' });
	g.location = { protocol: 'http:', host: `127.0.0.1:${port}` };
});

afterEach(async () => {
	cleanups.splice(0).forEach((f) => f());
	wss.close();
	await new Promise((r) => server.close(r));
});

it('keeps one connection when started from an $effect', async () => {
	let status = '';
	let messages = 0;
	const socket = new LiveSocket({ hello: () => ({ t: 'end_session' }), onMessage: () => messages++ });
	const stop = $effect.root(() => {
		$effect(() => socket.start());
		$effect(() => {
			status = socket.status;
		});
	});
	cleanups.push(stop);

	for (let i = 0; i < 20; i++) {
		await new Promise((r) => setTimeout(r, 50));
		flushSync();
	}
	expect(connections).toBe(1);
	expect(status).toBe('open');
	expect(messages).toBe(1);
});
