import { afterEach, expect, it } from 'vitest';
import { createSlide } from '$lib/live/slides';
import { DEFAULT_SETTINGS, type LiveSession } from '$lib/live/types';
import { liveHub } from './index';
import { LiveHub } from './hub';
import { MemoryRepo } from './repo';

type G = typeof globalThis & { __zencodeLive?: unknown; __zencodeLiveRepo?: unknown };
const g = globalThis as G;

afterEach(() => {
	(g.__zencodeLive as LiveHub | undefined)?.close?.();
	delete g.__zencodeLive;
	delete g.__zencodeLiveRepo;
});

const session: LiveSession = {
	id: 'quiz1',
	title: 'My quiz',
	status: 'lobby',
	joinCode: '123456',
	settings: { ...DEFAULT_SETTINGS },
	slides: [createSlide('select_answer')],
	createdBy: 'admin',
	createdAt: 1,
	updatedAt: 1,
	startedAt: null,
	endedAt: null
};

it('replaces a hub left over from older code and keeps its in-memory sessions', async () => {
	// Simulate a dev-server hot reload: the cached hub and repo come from an
	// older version of the classes (only their public methods are usable).
	const old = new MemoryRepo();
	await old.putSession(session);
	await old.claimJoinCode('123456', 'quiz1');
	await old.putParticipant('quiz1', { id: 'p1', secret: 's', nickname: 'Ada', avatar: 'fox', score: 0, joinedAt: 1 });
	let closed = false;
	const legacyRepo = {
		listSessions: () => old.listSessions(),
		getSession: (id: string) => old.getSession(id),
		listParticipants: (id: string) => old.listParticipants(id)
	};
	g.__zencodeLive = { repo: legacyRepo, close: () => (closed = true) };

	const hub = liveHub();
	expect(hub).toBeInstanceOf(LiveHub);
	expect(closed).toBe(true);
	expect((await hub.getSession('quiz1'))?.title).toBe('My quiz');
	expect(await hub.lookupCode('123456')).toEqual({ title: 'My quiz' });
	expect(await hub.repo.listParticipants('quiz1')).toHaveLength(1);
	expect(liveHub()).toBe(hub); // stable afterwards
});
