import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { WebSocket } from 'ws';
import type { ClientMessage, ServerMessage } from '$lib/live/protocol';
import { createSlide } from '$lib/live/slides';
import { DEFAULT_SETTINGS, type LiveSession, type Slide } from '$lib/live/types';
import { LiveHub } from './hub';
import { MemoryRepo } from './repo';

/** Test client: buffers every server message and waits for matches. */
class TestClient {
	ws: WebSocket;
	messages: ServerMessage[] = [];
	#waiters: { pred: (m: ServerMessage) => boolean; resolve: (m: ServerMessage) => void }[] = [];
	ready: Promise<void>;

	constructor(url: string) {
		this.ws = new WebSocket(url);
		this.ready = new Promise((r) => this.ws.once('open', () => r()));
		this.ws.on('message', (raw) => {
			const m = JSON.parse(raw.toString()) as ServerMessage;
			this.messages.push(m);
			this.#waiters = this.#waiters.filter((w) => (w.pred(m) ? (w.resolve(m), false) : true));
		});
	}
	send(m: ClientMessage) {
		this.ws.send(JSON.stringify(m));
	}
	next<T extends ServerMessage['t']>(t: T, pred: (m: Extract<ServerMessage, { t: T }>) => boolean = () => true, timeout = 2000) {
		return new Promise<Extract<ServerMessage, { t: T }>>((resolve, reject) => {
			const timer = setTimeout(() => reject(new Error(`timeout waiting for ${t}`)), timeout);
			this.#waiters.push({
				pred: (m) => m.t === t && pred(m as Extract<ServerMessage, { t: T }>),
				resolve: (m) => (clearTimeout(timer), resolve(m as Extract<ServerMessage, { t: T }>))
			});
		});
	}
	close() {
		this.ws.close();
	}
}

let server: Server;
let hub: LiveHub;
let repo: MemoryRepo;
let url: string;
const clients: TestClient[] = [];

function session(overrides: Partial<LiveSession> = {}): LiveSession {
	return {
		id: 'sess1',
		title: 'Opening quiz',
		status: 'draft',
		joinCode: null,
		settings: { ...DEFAULT_SETTINGS },
		slides: [createSlide('select_answer')],
		createdBy: 'admin',
		createdAt: 1,
		updatedAt: 1,
		startedAt: null,
		endedAt: null,
		...overrides
	};
}

async function client() {
	const c = new TestClient(url);
	clients.push(c);
	await c.ready;
	return c;
}

async function host() {
	const c = await client();
	const welcome = c.next('welcome_host');
	c.send({ t: 'host', sessionId: 'sess1', token: 'good-token' });
	const w = await welcome;
	return { c, code: w.state.session.joinCode! };
}

async function player(code: string, nickname: string, avatar = 'owl') {
	const c = await client();
	const welcome = c.next('welcome_player');
	c.send({ t: 'join', code, nickname, avatar });
	return { c, welcome: await welcome };
}

beforeEach(async () => {
	repo = new MemoryRepo();
	await repo.putSession(session());
	hub = new LiveHub({
		repo,
		verifyAdmin: async (token) => (token === 'good-token' ? { uid: 'admin', email: 'admin@example.com' } : null)
	});
	server = createServer();
	hub.attach(server);
	await new Promise<void>((r) => server.listen(0, '127.0.0.1', () => r()));
	url = `ws://127.0.0.1:${(server.address() as AddressInfo).port}/live`;
});

afterEach(async () => {
	clients.splice(0).forEach((c) => c.close());
	hub.close();
	await new Promise((r) => server.close(r));
});

describe('host access', () => {
	it('rejects a non-admin token and never reveals the session', async () => {
		const c = await client();
		c.send({ t: 'host', sessionId: 'sess1', token: 'forged' });
		const err = await c.next('error');
		expect(err.code).toBe('unauthorized');
		expect(c.messages.some((m) => m.t === 'welcome_host')).toBe(false);
	});

	it('rejects admin actions from a socket that is not a verified host', async () => {
		const { code } = await host();
		const { c } = await player(code, 'Mallory');
		c.send({ t: 'end_session' });
		expect((await c.next('error')).code).toBe('unauthorized');
		expect((await hub.getSession('sess1'))?.status).toBe('lobby');
	});

	it('opens a draft session as a lobby with a unique six-digit code', async () => {
		const { code } = await host();
		expect(code).toMatch(/^\d{6}$/);
		expect(await repo.resolveJoinCode(code)).toBe('sess1');
		expect((await repo.getSession('sess1'))?.status).toBe('lobby');
	});
});

describe('joining', () => {
	it('shows each new player in the host lobby', async () => {
		const { c: h, code } = await host();
		const update = h.next('lobby_update', (m) => m.participants.length === 1);
		const { welcome } = await player(code, '  Ada   Lovelace ', 'fox');
		expect(welcome.state.me).toMatchObject({ nickname: 'Ada Lovelace', avatar: 'fox', score: 0 });
		expect((await update).participants[0]).toMatchObject({ nickname: 'Ada Lovelace', connected: true });
	});

	it('never sends the participant secret to the host', async () => {
		const { c: h, code } = await host();
		const update = h.next('lobby_update', (m) => m.participants.length === 1);
		await player(code, 'Grace');
		expect(JSON.stringify(await update)).not.toContain('secret');
	});

	it('rejects unknown codes, duplicate nicknames and profanity', async () => {
		const { code } = await host();
		const c = await client();
		c.send({ t: 'join', code: '000001', nickname: 'Bob', avatar: 'fox' });
		expect((await c.next('error')).code).toBe('not_found');

		await player(code, 'Linus');
		c.send({ t: 'join', code, nickname: 'LINUS', avatar: 'fox' });
		expect((await c.next('error')).code).toBe('nickname_taken');

		c.send({ t: 'join', code, nickname: 'sh1t head', avatar: 'fox' });
		expect((await c.next('error')).code).toBe('nickname_invalid');
	});

	it('falls back to a default avatar for unknown ids', async () => {
		const { code } = await host();
		const { welcome } = await player(code, 'Eve', '<img src=x>');
		expect(welcome.state.me.avatar).toBe('fox');
	});

	it('resumes with the saved secret after a refresh, and refuses a wrong one', async () => {
		const { code } = await host();
		const { c, welcome } = await player(code, 'Turing');
		c.close();

		const again = await client();
		const back = again.next('welcome_player');
		again.send({ t: 'resume', code, participantId: welcome.state.me.id, secret: welcome.secret });
		expect((await back).state.me.nickname).toBe('Turing');

		const thief = await client();
		thief.send({ t: 'resume', code, participantId: welcome.state.me.id, secret: 'x'.repeat(32) });
		expect((await thief.next('error')).code).toBe('resume_failed');
	});

	it('restores the host view after a host refresh', async () => {
		const { c: h, code } = await host();
		await player(code, 'Hopper');
		h.close();
		const { c: h2 } = await host();
		const w = h2.messages.find((m) => m.t === 'welcome_host');
		expect(w?.t === 'welcome_host' && w.state.participants.map((p) => p.nickname)).toEqual(['Hopper']);
	});

	it('handles 50 players joining at once with throttled lobby updates', async () => {
		const { c: h, code } = await host();
		const all = h.next('lobby_update', (m) => m.participants.length === 50, 5000);
		await Promise.all(Array.from({ length: 50 }, (_, i) => player(code, `Player ${i + 1}`)));
		const final = await all;
		expect(new Set(final.participants.map((p) => p.nickname)).size).toBe(50);
		// coalesced: far fewer broadcasts than joins
		expect(h.messages.filter((m) => m.t === 'lobby_update').length).toBeLessThan(25);
	});
});

describe('ending', () => {
	it('notifies phones, releases the code and refuses new joins', async () => {
		const { c: h, code } = await host();
		const { c: p } = await player(code, 'Knuth');
		const ended = p.next('session_ended');
		h.send({ t: 'end_session' });
		await ended;
		expect(await repo.resolveJoinCode(code)).toBeNull();
		expect(await hub.lookupCode(code)).toBeNull();

		const late = await client();
		late.send({ t: 'join', code, nickname: 'Late', avatar: 'fox' });
		expect(['not_found', 'session_closed']).toContain((await late.next('error')).code);
	});

	it('runs again with a fresh code and an empty lobby', async () => {
		const { c: h, code } = await host();
		await player(code, 'Dijkstra');
		h.send({ t: 'end_session' });
		await h.next('welcome_host', (m) => m.state.session.status === 'ended');
		h.send({ t: 'open_lobby' });
		const reopened = await h.next('welcome_host', (m) => m.state.session.status === 'lobby');
		expect(reopened.state.session.joinCode).toMatch(/^\d{6}$/);
		expect(reopened.state.participants).toEqual([]);
	});
});

it('ignores malformed frames without dropping the connection', async () => {
	const c = await client();
	c.ws.send('not json');
	expect((await c.next('error')).code).toBe('bad_request');
	c.send({ t: 'nope' } as unknown as ClientMessage);
	expect((await c.next('error')).code).toBe('bad_request');
	expect(c.ws.readyState).toBe(WebSocket.OPEN);
});

// ---------------------------------------------------------------------------
// Phase 2: running slides
// ---------------------------------------------------------------------------

function quizSlide(timeLimit = 20) {
	const s = createSlide('select_answer');
	if (s.kind !== 'select_answer') throw new Error('kind');
	s.question = 'Capital of France?';
	s.config.options = [
		{ id: 'paris', text: 'Paris' },
		{ id: 'rome', text: 'Rome' },
		{ id: 'oslo', text: 'Oslo' }
	];
	s.config.correct = ['paris'];
	s.timeLimit = timeLimit;
	return s;
}

function pollSlide() {
	const s = createSlide('multiple_choice');
	if (s.kind !== 'multiple_choice') throw new Error('kind');
	s.question = 'Favourite language?';
	s.config.options = [
		{ id: 'ts', text: 'TypeScript' },
		{ id: 'py', text: 'Python' }
	];
	return s;
}

async function liveRoom(slides: Slide[] = [quizSlide(), pollSlide()], scoring: 'speed' | 'equal' = 'equal') {
	await repo.putSession(session({ slides, settings: { ...DEFAULT_SETTINGS, scoring } }));
	const { c: h, code } = await host();
	return { h, code };
}

async function start(h: TestClient) {
	const state = h.next('slide_state', (m) => m.status === 'live');
	h.send({ t: 'start_session' });
	return state;
}

const tap = (slideId: string, ...ids: string[]) => ({ t: 'submit_response' as const, slideId, value: { input: 'tap' as const, ids } });

describe('running a quiz slide', () => {
	it('refuses to start while a slide is unfinished', async () => {
		const { c: h } = await host(); // default session: blank select_answer
		h.send({ t: 'start_session' });
		expect((await h.next('error')).message).toMatch(/Slide 1/);
	});

	it('refuses host actions from players', async () => {
		const { code } = await liveRoom();
		const { c } = await player(code, 'Mallory');
		c.send({ t: 'start_session' });
		expect((await c.next('error')).code).toBe('unauthorized');
	});

	it('runs question → timer → answers → reveal → leaderboard, scoring on the server', async () => {
		const { h, code } = await liveRoom();
		const a = await player(code, 'Ada');
		const b = await player(code, 'Bob');
		const quiz = (await repo.getSession('sess1'))!.slides[0];

		const started = await start(h);
		expect(started.live?.runs[quiz.id].phase).toBe('ready');
		const phoneReady = await a.c.next('player_state', (m) => m.state.phase === 'ready');
		expect(phoneReady.state.slide?.options.map((o) => o.text)).toEqual(['Paris', 'Rome', 'Oslo']);

		// Not open yet
		a.c.send(tap(quiz.id, 'paris'));
		expect((await a.c.next('error')).code).toBe('response_rejected');

		h.send({ t: 'start_timer' });
		const open = await a.c.next('player_state', (m) => m.state.phase === 'open');
		expect(open.state.endsAt! - open.state.serverNow).toBeGreaterThan(19_000);

		a.c.send(tap(quiz.id, 'paris'));
		await a.c.next('response_ack');
		b.c.send(tap(quiz.id, 'rome'));
		await b.c.next('response_ack');
		const count = await h.next('response_count', (m) => m.answered === 2);
		expect(count.eligible).toBe(2);

		// One answer each; unknown options are rejected
		a.c.send(tap(quiz.id, 'rome'));
		expect((await a.c.next('error')).message).toMatch(/already answered/);
		const c3 = await player(code, 'Cy');
		c3.c.send(tap(quiz.id, 'berlin'));
		expect((await c3.c.next('error')).code).toBe('response_rejected');

		const board = h.next('leaderboard_update');
		h.send({ t: 'reveal_answer' });
		expect((await h.next('answer_reveal')).correctIds).toEqual(['paris']);
		const entries = (await board).entries;
		expect(entries[0]).toMatchObject({ nickname: 'Ada', score: 1000, gained: 1000, rank: 1 });
		expect(entries.find((e) => e.nickname === 'Bob')).toMatchObject({ score: 0, rank: 2 });

		const aRes = await a.c.next('player_state', (m) => !!m.state.reveal);
		expect(aRes.state.reveal).toMatchObject({ correct: true, points: 1000, correctIds: ['paris'] });
		expect(aRes.state.standing).toMatchObject({ score: 1000, rank: 1 });
		const bRes = await b.c.next('player_state', (m) => !!m.state.reveal);
		expect(bRes.state.reveal).toMatchObject({ correct: false, points: 0 });
	});

	it('never sends the answer key to phones before the reveal', async () => {
		const { h, code } = await liveRoom();
		const a = await player(code, 'Ada');
		await start(h);
		h.send({ t: 'start_timer' });
		await a.c.next('player_state', (m) => m.state.phase === 'open');
		const before = JSON.stringify(a.c.messages);
		expect(before).not.toContain('"correct"');
		expect(before).not.toContain('correctIds');
		expect(before).not.toContain('"config"');
	});

	it('speed mode gives a fast correct answer close to full points', async () => {
		const { h, code } = await liveRoom([quizSlide()], 'speed');
		const a = await player(code, 'Ada');
		await start(h);
		h.send({ t: 'start_timer' });
		const quizId = (await a.c.next('player_state', (m) => m.state.phase === 'open')).state.slide!.id;
		a.c.send(tap(quizId, 'paris'));
		await a.c.next('response_ack');
		h.send({ t: 'reveal_answer' });
		const pts = (await a.c.next('player_state', (m) => !!m.state.reveal)).state.reveal!.points;
		expect(pts).toBeGreaterThan(900);
		expect(pts).toBeLessThanOrEqual(1000);
	});

	it('closes responses when the server timer runs out', async () => {
		const { h, code } = await liveRoom([quizSlide(1)]);
		const a = await player(code, 'Ada');
		await start(h);
		h.send({ t: 'start_timer' });
		const quizId = (await a.c.next('player_state', (m) => m.state.phase === 'open')).state.slide!.id;
		await a.c.next('player_state', (m) => m.state.phase === 'closed', 3000);
		a.c.send(tap(quizId, 'paris'));
		expect((await a.c.next('error')).message).toMatch(/Time’s up/);
	});

	it('reset takes back points and reopens the slide', async () => {
		const { h, code } = await liveRoom();
		const a = await player(code, 'Ada');
		await start(h);
		h.send({ t: 'start_timer' });
		const quizId = (await a.c.next('player_state', (m) => m.state.phase === 'open')).state.slide!.id;
		a.c.send(tap(quizId, 'paris'));
		await a.c.next('response_ack');
		h.send({ t: 'reveal_answer' });
		await a.c.next('player_state', (m) => !!m.state.reveal);
		h.send({ t: 'reset_slide' });
		const reset = await a.c.next('player_state', (m) => m.state.phase === 'ready' && !m.state.reveal);
		expect(reset.state.answered).toBeNull();
		h.send({ t: 'show_leaderboard', show: true });
		expect((await h.next('leaderboard_update')).entries[0].score).toBe(0);
	});

	it('scores 50 players and sends the leaderboard well within a second of the reveal', async () => {
		const { h, code } = await liveRoom();
		const players = await Promise.all(Array.from({ length: 50 }, (_, i) => player(code, `P${i}`)));
		await start(h);
		h.send({ t: 'start_timer' });
		const quizId = (await players[0].c.next('player_state', (m) => m.state.phase === 'open')).state.slide!.id;
		await Promise.all(
			players.map(async (p, i) => {
				p.c.send(tap(quizId, i % 2 ? 'rome' : 'paris'));
				await p.c.next('response_ack');
			})
		);
		const t0 = Date.now();
		const board = h.next('leaderboard_update');
		h.send({ t: 'reveal_answer' });
		const entries = (await board).entries;
		expect(Date.now() - t0).toBeLessThan(1000);
		expect(entries).toHaveLength(50);
		expect(entries.filter((e) => e.score === 1000)).toHaveLength(25);
		expect(entries.filter((e) => e.rank === 1)).toHaveLength(25); // shared rank
		expect(entries.filter((e) => e.rank === 26)).toHaveLength(25);
	});
});

describe('running a poll slide', () => {
	it('opens immediately and streams results to the host', async () => {
		const { h, code } = await liveRoom([pollSlide()]);
		const a = await player(code, 'Ada');
		const b = await player(code, 'Bob');
		await start(h);
		const pollId = (await a.c.next('player_state', (m) => m.state.phase === 'open')).state.slide!.id;
		a.c.send(tap(pollId, 'ts'));
		b.c.send(tap(pollId, 'ts'));
		const res = await h.next('results_update', (m) => m.results.total === 2);
		expect(res.results).toMatchObject({ input: 'tap', counts: { ts: 2, py: 0 } });
	});

	it('rejects two choices when only one is allowed', async () => {
		const { h, code } = await liveRoom([pollSlide()]);
		const a = await player(code, 'Ada');
		await start(h);
		const pollId = (await a.c.next('player_state', (m) => m.state.phase === 'open')).state.slide!.id;
		a.c.send(tap(pollId, 'ts', 'py'));
		expect((await a.c.next('error')).code).toBe('response_rejected');
	});
});

describe('refresh mid-session', () => {
	it('restores the phone answer and the host run state', async () => {
		const { h, code } = await liveRoom();
		const a = await player(code, 'Ada');
		await start(h);
		h.send({ t: 'start_timer' });
		const quizId = (await a.c.next('player_state', (m) => m.state.phase === 'open')).state.slide!.id;
		a.c.send(tap(quizId, 'oslo'));
		await a.c.next('response_ack');

		a.c.close();
		const again = await client();
		const back = again.next('welcome_player');
		again.send({ t: 'resume', code, participantId: a.welcome.state.me.id, secret: a.welcome.secret });
		expect((await back).state.slide).toMatchObject({ phase: 'open', answered: { input: 'tap', ids: ['oslo'] } });

		h.close();
		const { c: h2 } = await host();
		const w = h2.messages.find((m) => m.t === 'welcome_host');
		expect(w?.t === 'welcome_host' && w.state.answered).toBe(1);
		expect(w?.t === 'welcome_host' && w.state.session.live?.runs[quizId].phase).toBe('open');
	});

	it('expires a running timer that ran out while the server was down', async () => {
		const { h, code } = await liveRoom([quizSlide(1)]);
		await player(code, 'Ada');
		await start(h);
		h.send({ t: 'start_timer' });
		await h.next('slide_state', (m) => Object.values(m.live!.runs)[0].phase === 'open');
		await new Promise((r) => setTimeout(r, 100)); // let the write-through land

		// A new hub over the same storage = process restart
		hub.close();
		hub = new LiveHub({ repo, verifyAdmin: async (t) => (t === 'good-token' ? { uid: 'admin', email: null } : null) });
		server.removeAllListeners('upgrade');
		hub.attach(server);
		await new Promise((r) => setTimeout(r, 1100));
		const { c: h2 } = await host();
		const w = h2.messages.find((m) => m.t === 'welcome_host');
		expect(w?.t === 'welcome_host' && Object.values(w.state.session.live!.runs)[0].phase).toBe('closed');
	});
});
