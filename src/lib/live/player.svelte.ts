import type { ClientMessage, ErrorCode, PlayerSlideState, PlayerSnapshot, ServerMessage } from './protocol';
import { LiveSocket } from './socket.svelte';
import type { ResponseValue } from './types';

export type PlayerPhase = 'connecting' | 'profile' | 'joining' | 'ready' | 'ended' | 'missing';

interface Creds {
	participantId: string;
	secret: string;
}

const key = (code: string) => `zc-live:${code}`;

function loadCreds(code: string): Creds | null {
	try {
		const v = JSON.parse(localStorage.getItem(key(code)) ?? 'null');
		return v && typeof v.participantId === 'string' && typeof v.secret === 'string' ? v : null;
	} catch {
		return null;
	}
}
function saveCreds(code: string, c: Creds | null) {
	try {
		if (c) localStorage.setItem(key(code), JSON.stringify(c));
		else localStorage.removeItem(key(code));
	} catch {
		/* private mode: the phone just won't resume after a refresh */
	}
}

/** Participant phone state. Resumes from localStorage after a refresh. */
export class PlayerRoom {
	phase = $state<PlayerPhase>('connecting');
	state = $state<PlayerSnapshot | null>(null);
	slide = $state<PlayerSlideState | null>(null);
	/**
	 * Optimistic answer: shown as submitted the moment it is tapped, confirmed
	 * by the server's ack, rolled back (with `answerError`) if rejected.
	 */
	pending = $state<{ slideId: string; value: ResponseValue; confirmed: boolean } | null>(null);
	answerError = $state('');
	clockOffset = $state(0);
	error = $state<{ code: ErrorCode; message: string } | null>(null);
	readonly socket: LiveSocket;
	#creds: Creds | null;
	#pendingJoin: Extract<ClientMessage, { t: 'join' }> | null = null;

	/** The answer to show: the server's record, else the optimistic one. */
	myAnswer = $derived(this.slide?.answered ?? (this.pending && this.pending.slideId === this.slide?.slide?.id ? this.pending.value : null));

	constructor(public readonly code: string) {
		this.#creds = loadCreds(code);
		if (!this.#creds) this.phase = 'profile';
		this.socket = new LiveSocket({ hello: () => this.#hello(), onMessage: (m) => this.#on(m) });
	}

	#hello(): ClientMessage | null {
		if (this.#creds) return { t: 'resume', code: this.code, ...this.#creds };
		return this.#pendingJoin;
	}

	join(nickname: string, avatar: string) {
		this.error = null;
		this.phase = 'joining';
		this.#pendingJoin = { t: 'join', code: this.code, nickname, avatar };
		this.socket.rehello();
	}

	submit(value: ResponseValue) {
		const slideId = this.slide?.slide?.id;
		if (!slideId || this.myAnswer) return;
		this.answerError = '';
		this.pending = { slideId, value, confirmed: false };
		if (!this.socket.send({ t: 'submit_response', slideId, value })) {
			this.pending = null;
			this.answerError = 'You’re offline — reconnecting. Try again in a moment.';
		}
	}

	#setSlide(s: PlayerSlideState | null) {
		if (s && this.pending && this.pending.slideId !== s.slide?.id) this.pending = null;
		if (s && !s.answered && this.pending?.confirmed) this.pending = null; // slide was reset
		if (s?.slide?.id !== this.slide?.slide?.id) this.answerError = '';
		this.slide = s;
		if (s) {
			this.clockOffset = s.serverNow - Date.now();
			if (this.state) this.state.status = 'live';
		}
	}

	#on(m: ServerMessage) {
		switch (m.t) {
			case 'welcome_player':
				this.#creds = { participantId: m.state.me.id, secret: m.secret };
				this.#pendingJoin = null;
				saveCreds(this.code, this.#creds);
				this.state = m.state;
				this.#setSlide(m.state.slide);
				this.error = null;
				this.phase = 'ready';
				break;
			case 'player_count':
				if (this.state) this.state.playerCount = m.count;
				break;
			case 'player_state':
				this.#setSlide(m.state);
				break;
			case 'timer_tick':
				this.clockOffset = m.serverNow - Date.now();
				break;
			case 'response_ack':
				if (this.pending?.slideId === m.slideId) this.pending.confirmed = true;
				break;
			case 'session_ended':
				this.#end();
				break;
			case 'error':
				this.#onError(m.code, m.message);
				break;
		}
	}

	#onError(code: ErrorCode, message: string) {
		if (code === 'response_rejected') {
			this.pending = null;
			this.answerError = message;
			return;
		}
		this.error = { code, message };
		switch (code) {
			case 'resume_failed':
				this.#creds = null;
				saveCreds(this.code, null);
				this.phase = 'profile';
				this.error = null;
				break;
			case 'session_closed':
				this.#end();
				break;
			case 'not_found':
				this.phase = 'missing';
				this.socket.stop();
				break;
			default:
				// nickname_taken / nickname_invalid / rate_limited: back to the form
				this.#pendingJoin = null;
				if (this.phase === 'joining') this.phase = 'profile';
		}
	}

	#end() {
		saveCreds(this.code, null);
		this.#creds = null;
		this.phase = 'ended';
		this.socket.stop();
	}
}
