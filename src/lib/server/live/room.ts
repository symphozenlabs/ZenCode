import type { WebSocket } from 'ws';
import type { BoardRow, HostSlideData, HostSnapshot, PlayerSlideState, ServerMessage } from '$lib/live/protocol';
import { correctIds, hasAnswer, publicSlide, SLIDE_META, slideIssues } from '$lib/live/slides';
import type {
	LeaderboardEntry,
	LiveSession,
	LiveState,
	PublicParticipant,
	Slide,
	SlideRun,
	StoredParticipant,
	StoredResponse
} from '$lib/live/types';
import type { ReactionId } from '$lib/live/reactions';
import { buildLeaderboard } from './ranking';
import type { LiveRepo } from './repo';
import { tally, validateResponse } from './responses';
import { scoreResponse } from './scoring';

/** Thrown by room/hub operations; the HTTP API maps `status` to a response. */
export class HubError extends Error {
	constructor(
		public status: number,
		message: string
	) {
		super(message);
	}
}

export interface Client {
	ws: WebSocket;
	alive: boolean;
	role: 'none' | 'host' | 'player';
	room: Room | null;
	participantId: string | null;
	window: { start: number; count: number };
	/** Separate, tighter budget for emoji reactions. */
	reactWindow: { start: number; count: number };
	joinAttempts: number;
}

const BROADCAST_MS = 100; // fan-out at most ~10 times per second
const TICK_MS = 1000;
const BOARD_ROWS = 10; // phones get the top 10; each already knows its own place
/** Once every connected phone has answered, let the last answer land on the big screen, then reveal. */
const ALL_IN_MS = 1000;
/** After a reveal, how long the answer stays up before the next slide. */
export const ADVANCE_MS = 5000;

/** Ranks and the board, computed once per fan-out instead of once per phone. */
interface Standings {
	ranks: Map<string, number>;
	board: BoardRow[];
}

export function send(c: Client, data: string) {
	if (c.ws.readyState === c.ws.OPEN) c.ws.send(data);
}

export type SubmitResult = { ok: true } | { ok: false; message: string };

/**
 * One open session: who is connected, the run state, every response, and
 * the server-owned timer. All scoring happens here with server timestamps.
 */
export class Room {
	hosts = new Set<Client>();
	players = new Map<string, Set<Client>>();
	participants = new Map<string, StoredParticipant>();
	/** slideId → participantId → response */
	responses = new Map<string, Map<string, StoredResponse>>();

	#dirty = { lobby: false, count: false, results: false };
	#reactions = new Map<ReactionId, number>();
	#flushTimer: ReturnType<typeof setTimeout> | null = null;
	#closeTimer: ReturnType<typeof setTimeout> | null = null;
	#tickTimer: ReturnType<typeof setInterval> | null = null;
	#allInTimer: ReturnType<typeof setTimeout> | null = null;
	#advanceTimer: ReturnType<typeof setTimeout> | null = null;
	#persistChain: Promise<void> = Promise.resolve();

	constructor(
		public session: LiveSession,
		private repo: LiveRepo
	) {}

	// ---- Derived ----------------------------------------------------------------

	get open() {
		return this.session.status === 'lobby' || this.session.status === 'live';
	}
	get live(): LiveState | null {
		return this.session.status === 'live' ? (this.session.live ?? null) : null;
	}
	get current(): Slide | null {
		const live = this.live;
		return live ? (this.session.slides[live.index] ?? null) : null;
	}
	get currentRun(): SlideRun | null {
		const slide = this.current;
		return slide ? (this.live!.runs[slide.id] ?? null) : null;
	}
	get idle() {
		return this.hosts.size === 0 && this.players.size === 0;
	}

	isConnected(pid: string) {
		return (this.players.get(pid)?.size ?? 0) > 0;
	}

	publicParticipants(): PublicParticipant[] {
		return [...this.participants.values()]
			.sort((a, b) => a.joinedAt - b.joinedAt)
			.map(({ secret: _, ...p }) => ({ ...p, connected: this.isConnected(p.id) }));
	}

	leaderboard(): LeaderboardEntry[] {
		const lastId = this.session.live?.lastRevealed;
		const gained = new Map<string, number>();
		for (const r of (lastId && this.responses.get(lastId)?.values()) || []) gained.set(r.participantId, r.points);
		return buildLeaderboard([...this.participants.values()], gained);
	}

	hostSlideData(): HostSlideData {
		const slide = this.current;
		if (!slide) return { results: null, answered: 0, eligible: this.players.size };
		const list = [...(this.responses.get(slide.id)?.values() ?? [])];
		const results = tally(slide, list, this.session.settings.profanityFilter);
		return { results, answered: list.length, eligible: Math.max(this.players.size, list.length) };
	}

	hostSnapshot(): HostSnapshot {
		return {
			session: this.session,
			participants: this.publicParticipants(),
			leaderboard: this.leaderboard(),
			serverNow: Date.now(),
			...this.hostSlideData()
		};
	}

	standings(): Standings {
		const entries = this.leaderboard();
		return {
			ranks: new Map(entries.map((e) => [e.id, e.rank])),
			board: entries.slice(0, BOARD_ROWS).map(({ id, nickname, avatar, score, rank }) => ({ id, nickname, avatar, score, rank }))
		};
	}

	playerState(pid: string, standings?: Standings): PlayerSlideState | null {
		const live = this.live;
		const slide = this.current;
		const run = this.currentRun;
		if (!live || !slide || !run) return null;
		const mine = this.responses.get(slide.id)?.get(pid) ?? null;
		const me = this.participants.get(pid);
		const scoredSoFar = !!live.lastRevealed || Object.values(live.runs).some((r) => r.revealed);
		const showStanding = me && scoredSoFar && (run.revealed || live.view === 'leaderboard');
		const onBoard = live.view === 'leaderboard';
		if ((showStanding || onBoard) && !standings) standings = this.standings();
		return {
			index: live.index,
			total: this.session.slides.length,
			view: live.view,
			slide: publicSlide(slide),
			phase: run.phase,
			endsAt: run.endsAt,
			serverNow: Date.now(),
			answered: mine?.value ?? null,
			reveal: run.revealed ? { correctIds: correctIds(slide), correct: mine?.correct ?? null, points: mine?.points ?? 0 } : null,
			standing: showStanding ? { score: me.score, rank: standings!.ranks.get(pid) ?? this.participants.size, players: this.participants.size } : null,
			board: onBoard ? standings!.board : null
		};
	}

	// ---- Fan-out ----------------------------------------------------------------

	toHosts(msg: ServerMessage) {
		const data = JSON.stringify(msg);
		for (const c of this.hosts) send(c, data);
	}

	toPlayers(msg: ServerMessage) {
		const data = JSON.stringify(msg);
		for (const set of this.players.values()) for (const c of set) send(c, data);
	}

	toPlayer(pid: string, msg: ServerMessage) {
		const data = JSON.stringify(msg);
		for (const c of this.players.get(pid) ?? []) send(c, data);
	}

	/** Each phone gets its own view (its answer, its result, its rank). */
	sendPlayerStates() {
		const standings = this.standings();
		for (const pid of this.players.keys()) {
			const state = this.playerState(pid, standings);
			if (state) this.toPlayer(pid, { t: 'player_state', state });
		}
	}

	markLobby() {
		this.#dirty.lobby = true;
		if (this.live) this.#dirty.count = true;
		this.#schedule();
	}
	#markAnswer() {
		this.#dirty.count = true;
		this.#dirty.results = true;
		this.#schedule();
	}
	/** Batched with the other fan-out so a burst from 500 phones is a few frames. */
	react(id: ReactionId) {
		this.#reactions.set(id, (this.#reactions.get(id) ?? 0) + 1);
		this.#schedule();
	}
	#schedule() {
		this.#flushTimer ??= setTimeout(() => this.flush(), BROADCAST_MS);
	}

	flush() {
		this.#flushTimer = null;
		const d = this.#dirty;
		this.#dirty = { lobby: false, count: false, results: false };
		if (this.#reactions.size) {
			this.toHosts({ t: 'reactions', counts: Object.fromEntries(this.#reactions) });
			this.#reactions.clear();
		}
		if (d.lobby) {
			this.toHosts({ t: 'lobby_update', participants: this.publicParticipants() });
			this.toPlayers({ t: 'player_count', count: this.participants.size });
		}
		const slide = this.current;
		if (!slide || (!d.count && !d.results)) return;
		const data = this.hostSlideData();
		if (d.count) this.toHosts({ t: 'response_count', slideId: slide.id, answered: data.answered, eligible: data.eligible });
		if (d.results && data.results) this.toHosts({ t: 'results_update', slideId: slide.id, results: data.results });
	}

	/** After any host action: persist, then tell everyone. */
	#changed() {
		this.persist();
		this.toHosts({ t: 'slide_state', status: this.session.status, live: this.session.live ?? null, serverNow: Date.now() });
		const data = this.hostSlideData();
		const slide = this.current;
		if (slide) {
			this.toHosts({ t: 'response_count', slideId: slide.id, answered: data.answered, eligible: data.eligible });
			if (data.results) this.toHosts({ t: 'results_update', slideId: slide.id, results: data.results });
		}
		this.sendPlayerStates();
	}

	persist() {
		const { status, live, joinCode, startedAt, endedAt } = this.session;
		const patch = { status, live: live ?? null, joinCode, startedAt, endedAt, updatedAt: Date.now() };
		this.#persistChain = this.#persistChain
			.then(() => this.repo.patchSession(this.session.id, patch))
			.catch((err) => console.error('[live] persist session', err));
	}

	// ---- Timer (server owned) -----------------------------------------------------

	#clearTimers() {
		if (this.#closeTimer) clearTimeout(this.#closeTimer);
		if (this.#tickTimer) clearInterval(this.#tickTimer);
		if (this.#allInTimer) clearTimeout(this.#allInTimer);
		if (this.#advanceTimer) clearTimeout(this.#advanceTimer);
		this.#closeTimer = this.#tickTimer = this.#allInTimer = this.#advanceTimer = null;
	}

	/** True when every phone still connected has answered the slide. */
	#everyoneAnswered(slideId: string) {
		const answers = this.responses.get(slideId);
		if (!answers?.size || !this.players.size) return false;
		for (const pid of this.players.keys()) if (!answers.has(pid)) return false;
		return true;
	}

	/** After an answer or a phone leaving: if nobody is left to answer, reveal. */
	checkEveryoneAnswered() {
		const slide = this.current;
		const run = this.currentRun;
		if (!slide || !run || run.phase !== 'open' || this.#allInTimer || !this.#everyoneAnswered(slide.id)) return;
		this.#allInTimer = setTimeout(() => {
			this.#allInTimer = null;
			if (this.currentRun === run && run.phase === 'open' && this.#everyoneAnswered(slide.id)) this.reveal();
		}, ALL_IN_MS);
	}

	/**
	 * Once a slide's answer is up, move on to the next slide by itself — unless
	 * it's the last one, it has no answers (Q&A), or the leaderboard is showing.
	 */
	#scheduleAdvance() {
		const live = this.live;
		const slide = this.current;
		const run = this.currentRun;
		if (!live || !slide || !run || this.#advanceTimer) return;
		if (live.view !== 'slide' || SLIDE_META[slide.kind].input === 'none' || live.index >= this.session.slides.length - 1) {
			run.advanceAt = null;
			return;
		}
		run.advanceAt ??= Date.now() + ADVANCE_MS;
		this.#advanceTimer = setTimeout(
			() => {
				this.#advanceTimer = null;
				if (this.currentRun !== run || this.live?.view !== 'slide' || run.advanceAt == null) return;
				run.advanceAt = null;
				this.goTo(this.live.index + 1);
			},
			Math.max(0, run.advanceAt - Date.now())
		);
	}

	#cancelAdvance() {
		if (this.#advanceTimer) clearTimeout(this.#advanceTimer);
		this.#advanceTimer = null;
		const run = this.currentRun;
		if (run) run.advanceAt = null;
	}

	#armTimer() {
		this.#clearTimers();
		const slide = this.current;
		const run = this.currentRun;
		if (!slide || !run || run.phase !== 'open' || run.endsAt == null) return;
		const endsAt = run.endsAt;
		const tick = () => {
			const now = Date.now();
			this.toHosts({ t: 'timer_tick', slideId: slide.id, remainingMs: Math.max(0, endsAt - now), serverNow: now });
			this.toPlayers({ t: 'timer_tick', slideId: slide.id, remainingMs: Math.max(0, endsAt - now), serverNow: now });
		};
		this.#tickTimer = setInterval(tick, TICK_MS);
		this.#closeTimer = setTimeout(
			() => {
				if (this.currentRun !== run || run.phase !== 'open') return;
				// Time's up: close and show the results (and the answer) straight away
				this.reveal();
			},
			Math.max(0, endsAt - Date.now())
		);
	}

	/** After loading from storage: expire or re-arm a running timer. */
	restore() {
		const run = this.currentRun;
		if (run?.phase === 'open' && run.endsAt != null && run.endsAt <= Date.now()) {
			run.phase = 'closed';
			this.persist();
		}
		this.#armTimer();
		if (run?.advanceAt != null) this.#scheduleAdvance();
	}

	dispose() {
		this.#clearTimers();
		if (this.#flushTimer) clearTimeout(this.#flushTimer);
		this.#flushTimer = null;
	}

	// ---- Host controls ----------------------------------------------------------

	#initialRun(slide: Slide): SlideRun {
		const meta = SLIDE_META[slide.kind];
		const timed = slide.timeLimit > 0;
		if (meta.input === 'none') return { phase: 'closed', startedAt: null, endsAt: null, revealed: false, showResults: true };
		if (timed) return { phase: 'ready', startedAt: null, endsAt: null, revealed: false, showResults: !meta.scored };
		return { phase: 'open', startedAt: Date.now(), endsAt: null, revealed: false, showResults: true };
	}

	#need(): { live: LiveState; slide: Slide; run: SlideRun } {
		const live = this.live;
		const slide = this.current;
		const run = this.currentRun;
		if (!live || !slide || !run) throw new HubError(409, 'Start the session first.');
		return { live, slide, run };
	}

	start() {
		if (this.session.status !== 'lobby') throw new HubError(409, 'The session is not in the lobby.');
		if (!this.session.slides.length) throw new HubError(409, 'Add at least one slide first.');
		const broken = this.session.slides.findIndex((s) => slideIssues(s).length);
		if (broken >= 0) throw new HubError(409, `Slide ${broken + 1} isn’t finished yet.`);
		this.session = {
			...this.session,
			status: 'live',
			startedAt: Date.now(),
			live: { index: -1, view: 'slide', runs: {}, lastRevealed: null }
		};
		this.goTo(0);
	}

	goTo(index: number) {
		const live = this.live;
		if (!live) throw new HubError(409, 'Start the session first.');
		if (!Number.isInteger(index) || index < 0 || index >= this.session.slides.length) throw new HubError(400, 'No such slide.');
		const leaving = this.currentRun;
		if (leaving?.phase === 'open') leaving.phase = 'closed';
		if (leaving) leaving.advanceAt = null;
		this.#clearTimers();
		live.index = index;
		live.view = 'slide';
		const slide = this.session.slides[index];
		live.runs[slide.id] ??= this.#initialRun(slide);
		this.#armTimer();
		this.#changed();
	}

	startTimer() {
		const { slide, run } = this.#need();
		if (SLIDE_META[slide.kind].input === 'none') throw new HubError(409, 'This slide has no answers.');
		if (run.phase === 'open') return;
		if (run.revealed) throw new HubError(409, 'Reset the slide to run it again.');
		const now = Date.now();
		run.phase = 'open';
		run.startedAt = now;
		run.endsAt = slide.timeLimit > 0 ? now + slide.timeLimit * 1000 : null;
		this.#armTimer();
		this.#changed();
	}

	/** Closing early works like the timer running out: results appear at once. */
	closeResponses() {
		const { run } = this.#need();
		if (run.phase !== 'open') return;
		this.reveal();
	}

	reveal() {
		const { live, slide, run } = this.#need();
		if (run.phase === 'open') run.phase = 'closed';
		this.#clearTimers();
		this.flush();
		run.showResults = true;
		this.#scheduleAdvance();
		if (!hasAnswer(slide) || run.revealed) return this.#changed();

		run.revealed = true;
		if (SLIDE_META[slide.kind].scored) {
			const changed: StoredParticipant[] = [];
			for (const r of this.responses.get(slide.id)?.values() ?? []) {
				const p = this.participants.get(r.participantId);
				if (!p || !r.points) continue;
				p.score += r.points;
				changed.push(p);
			}
			live.lastRevealed = slide.id;
			if (changed.length) {
				this.repo.putParticipants(this.session.id, changed).catch((err) => console.error('[live] save scores', err));
			}
		}
		this.toHosts({ t: 'answer_reveal', slideId: slide.id, correctIds: correctIds(slide) });
		if (SLIDE_META[slide.kind].scored) this.toHosts({ t: 'leaderboard_update', entries: this.leaderboard() });
		this.#changed();
	}

	setResults(show: boolean) {
		const { run } = this.#need();
		run.showResults = !!show;
		this.#changed();
	}

	setLeaderboard(show: boolean) {
		const { live } = this.#need();
		// The host took over: the leaderboard stays up until they move on.
		this.#cancelAdvance();
		live.view = show ? 'leaderboard' : 'slide';
		if (show) this.toHosts({ t: 'leaderboard_update', entries: this.leaderboard() });
		this.#changed();
	}

	/** Clear a slide's responses (and take back its points) to run it again. */
	reset() {
		const { live, slide, run } = this.#need();
		const list = [...(this.responses.get(slide.id)?.values() ?? [])];
		if (run.revealed && SLIDE_META[slide.kind].scored) {
			const changed: StoredParticipant[] = [];
			for (const r of list) {
				const p = this.participants.get(r.participantId);
				if (!p || !r.points) continue;
				p.score = Math.max(0, p.score - r.points);
				changed.push(p);
			}
			if (changed.length) this.repo.putParticipants(this.session.id, changed).catch((err) => console.error('[live] save scores', err));
		}
		if (live.lastRevealed === slide.id) live.lastRevealed = null;
		this.responses.delete(slide.id);
		if (list.length) this.repo.deleteResponses(this.session.id, slide.id).catch((err) => console.error('[live] reset slide', err));
		this.#clearTimers();
		live.runs[slide.id] = this.#initialRun(slide);
		this.#armTimer();
		this.#changed();
	}

	// ---- Participant answers ----------------------------------------------------

	submit(pid: string, slideId: unknown, raw: unknown): SubmitResult {
		const live = this.live;
		const slide = this.current;
		const run = this.currentRun;
		const now = Date.now();
		if (!live || !slide || !run || live.view !== 'slide' || slide.id !== slideId) return { ok: false, message: 'This question has moved on.' };
		if (run.phase !== 'open' || (run.endsAt != null && now > run.endsAt)) return { ok: false, message: 'Time’s up — responses are closed.' };
		let bySlide = this.responses.get(slide.id);
		if (bySlide?.has(pid)) return { ok: false, message: 'You’ve already answered.' };
		const value = validateResponse(slide, raw);
		if (!value) return { ok: false, message: 'That answer isn’t valid for this question.' };

		const elapsedMs = Math.max(0, now - (run.startedAt ?? now));
		const scored = SLIDE_META[slide.kind].scored ? scoreResponse(slide, value, elapsedMs, this.session.settings.scoring) : { correct: null, points: 0 };
		const response: StoredResponse = {
			id: `${slide.id}_${pid}`,
			slideId: slide.id,
			participantId: pid,
			value,
			receivedAt: now,
			elapsedMs,
			...scored
		};
		if (!bySlide) this.responses.set(slide.id, (bySlide = new Map()));
		bySlide.set(pid, response);
		this.repo.createResponse(this.session.id, response).catch((err) => console.error('[live] save response', err));
		this.#markAnswer();
		this.checkEveryoneAnswered();
		return { ok: true };
	}
}
