import { untrack } from 'svelte';
import type { ClientMessage, ServerMessage } from './protocol';
import { liveSocketUrl } from './origin';

export type SocketStatus = 'connecting' | 'open' | 'reconnecting' | 'closed';

interface Options {
	/** Sent on every (re)connect; the server answers with a full snapshot. */
	hello: () => ClientMessage | null | Promise<ClientMessage | null>;
	onMessage: (msg: ServerMessage) => void;
}

/**
 * WebSocket with automatic reconnect (exponential backoff + jitter, capped
 * at 8s). Reconnects immediately when the device comes back online or the
 * tab becomes visible again — phones suspend sockets aggressively.
 */
export class LiveSocket {
	status = $state<SocketStatus>('connecting');
	#ws: WebSocket | null = null;
	#attempt = 0;
	#timer: ReturnType<typeof setTimeout> | null = null;
	#stopped = false;
	#hasDropped = false;
	#opts: Options;

	constructor(opts: Options) {
		this.#opts = opts;
	}

	/**
	 * Pages call this from an $effect. Everything runs untracked: if the
	 * effect subscribed to `status` it would tear down and reopen the socket
	 * on every status change, in a loop.
	 */
	start() {
		return untrack(() => {
			this.#stopped = false;
			window.addEventListener('online', this.#wake);
			document.addEventListener('visibilitychange', this.#wake);
			this.#connect();
			return () => this.stop();
		});
	}

	stop() {
		this.#stopped = true;
		this.#hasDropped = false;
		window.removeEventListener('online', this.#wake);
		document.removeEventListener('visibilitychange', this.#wake);
		if (this.#timer) clearTimeout(this.#timer);
		this.#ws?.close(1000);
		this.#ws = null;
		this.status = 'closed';
	}

	/** Re-run the hello on the open socket (e.g. after choosing a nickname). */
	async rehello() {
		if (this.#ws?.readyState === WebSocket.OPEN) await this.#sayHello(this.#ws);
		else this.#wake();
	}

	send(msg: ClientMessage): boolean {
		if (this.#ws?.readyState !== WebSocket.OPEN) return false;
		this.#ws.send(JSON.stringify(msg));
		return true;
	}

	#wake = () => {
		if (this.#stopped || document.visibilityState === 'hidden') return;
		const s = this.#ws?.readyState;
		if (s === WebSocket.OPEN || s === WebSocket.CONNECTING) return;
		if (this.#timer) clearTimeout(this.#timer);
		this.#attempt = 0;
		this.#connect();
	};

	async #sayHello(ws: WebSocket) {
		const hello = await this.#opts.hello();
		if (hello && ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(hello));
	}

	#connect() {
		this.#timer = null;
		const ws = new WebSocket(liveSocketUrl());
		this.#ws = ws;
		this.status = this.#hasDropped ? 'reconnecting' : 'connecting';

		ws.onopen = () => {
			this.#attempt = 0;
			this.#hasDropped = false;
			this.status = 'open';
			this.#sayHello(ws).catch(() => ws.close());
		};
		ws.onmessage = (e) => {
			let msg: ServerMessage;
			try {
				msg = JSON.parse(e.data);
			} catch {
				return;
			}
			this.#opts.onMessage(msg);
		};
		ws.onclose = () => {
			if (this.#ws !== ws) return;
			this.#ws = null;
			if (this.#stopped) return;
			this.#hasDropped = true;
			this.status = 'reconnecting';
			const delay = Math.min(8000, 400 * 2 ** this.#attempt++) * (0.6 + Math.random() * 0.4);
			this.#timer = setTimeout(() => this.#connect(), delay);
		};
	}
}
