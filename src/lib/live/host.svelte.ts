import type { ErrorCode, HostAction, ServerMessage } from './protocol';
import { idToken } from './admin-api';
import { LiveSocket } from './socket.svelte';
import type { LeaderboardEntry, LiveSession, PublicParticipant, SlideResults } from './types';

/** Presenter-side mirror of one live room. */
export class HostRoom {
	session = $state<LiveSession | null>(null);
	participants = $state<PublicParticipant[]>([]);
	leaderboard = $state<LeaderboardEntry[]>([]);
	results = $state<SlideResults | null>(null);
	answered = $state(0);
	eligible = $state(0);
	/** server clock − local clock, refreshed on every server timestamp */
	clockOffset = $state(0);
	error = $state<{ code: ErrorCode; message: string } | null>(null);
	/** Non-fatal action errors (e.g. "Slide 3 isn't finished") — shown as a toast. */
	notice = $state<{ id: number; message: string } | null>(null);
	readonly socket: LiveSocket;

	connectedCount = $derived(this.participants.filter((p) => p.connected).length);
	live = $derived(this.session?.status === 'live' ? (this.session.live ?? null) : null);
	slide = $derived(this.live ? (this.session!.slides[this.live.index] ?? null) : null);
	run = $derived(this.live && this.slide ? (this.live.runs[this.slide.id] ?? null) : null);

	constructor(sessionId: string) {
		this.socket = new LiveSocket({
			hello: async () => {
				try {
					return { t: 'host', sessionId, token: await idToken() };
				} catch {
					// Without a token every retry would fail the same way: say so instead.
					this.error = { code: 'unauthorized', message: 'Your sign-in expired. Sign in again to present.' };
					this.socket.stop();
					return null;
				}
			},
			onMessage: (m) => this.#on(m)
		});
	}

	#sync(serverNow: number) {
		this.clockOffset = serverNow - Date.now();
	}

	#on(m: ServerMessage) {
		switch (m.t) {
			case 'welcome_host':
				this.error = null;
				this.session = m.state.session;
				this.participants = m.state.participants;
				this.leaderboard = m.state.leaderboard;
				this.results = m.state.results;
				this.answered = m.state.answered;
				this.eligible = m.state.eligible;
				this.#sync(m.state.serverNow);
				break;
			case 'lobby_update':
				this.participants = m.participants;
				break;
			case 'slide_state': {
				if (!this.session) break;
				const prevSlide = this.slide?.id;
				this.session.status = m.status;
				this.session.live = m.live;
				this.#sync(m.serverNow);
				if (this.slide?.id !== prevSlide) this.results = null;
				break;
			}
			case 'response_count':
				if (m.slideId === this.slide?.id) {
					this.answered = m.answered;
					this.eligible = m.eligible;
				}
				break;
			case 'results_update':
				if (m.slideId === this.slide?.id) this.results = m.results;
				break;
			case 'leaderboard_update':
				this.leaderboard = m.entries;
				break;
			case 'timer_tick':
				this.#sync(m.serverNow);
				break;
			case 'error':
				if (m.code === 'unauthorized' || m.code === 'not_found') {
					this.error = { code: m.code, message: m.message };
					this.socket.stop();
				} else {
					this.notice = { id: Date.now(), message: m.message };
				}
				break;
		}
	}

	act = (action: HostAction) => this.socket.send(action);
	endSession = () => this.act({ t: 'end_session' });
	reopen = () => this.act({ t: 'open_lobby' });
}
