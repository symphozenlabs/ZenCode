import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { scoresFromWords } from '$lib/games/word-heist/engine';
import type { HeistServerMessage } from '$lib/games/word-heist/protocol';
import { DEFAULT_RULES, type Board } from '$lib/games/word-heist/types';
import { isWord } from './dictionary';
import { defaultModeration } from './moderation';
import { depsFor, startersFor } from './service';
import { MemoryHeistStore } from './store';
import { HeistError, Tournament, type Peer } from './tournament';

vi.mock('$lib/server/admin-session', () => ({ adminDb: async () => null }));

const config = defaultModeration();
const deps = () => ({ store, deps: () => depsFor(config), starters: () => startersFor(config) });
let store: MemoryHeistStore;

class FakePeer implements Peer {
	msgs: HeistServerMessage[] = [];
	send(data: string) {
		this.msgs.push(JSON.parse(data));
	}
	last<T extends HeistServerMessage['t']>(t: T) {
		return [...this.msgs].reverse().find((m) => m.t === t) as Extract<HeistServerMessage, { t: T }> | undefined;
	}
}

async function lobby(n: number, rules = DEFAULT_RULES) {
	const t = (await Tournament.create('ZHTEST', 'admin@test', rules, deps()))!;
	const ids: string[] = [];
	const tokens: string[] = [];
	for (let i = 0; i < n; i++) {
		const j = await t.join(`Player ${i + 1}`);
		ids.push(j.playerId);
		tokens.push(j.token);
	}
	return { t, ids, tokens };
}

/** Find a valid steal of some word on the board not owned by `thief`. */
function findSteal(b: Board, thief: string) {
	const onBoard = new Set(Object.values(b.words).map((w) => w.text));
	for (const [id, w] of Object.entries(b.words)) {
		if (w.owner === thief) continue;
		for (const c of 'ABCDEFGHIJKLMNOPRSTUWY') {
			for (const cand of [w.text + c, c + w.text]) if (isWord(cand) && !cand.endsWith('S') && !onBoard.has(cand)) return { sourceId: id, text: cand, victim: w.owner, from: w.text };
		}
	}
	throw new Error('no steal found');
}

let tournaments: Tournament[] = [];
beforeEach(() => {
	store = new MemoryHeistStore();
	tournaments = [];
});
afterEach(() => {
	for (const t of tournaments) t.dispose();
	vi.useRealTimers();
});

describe('Word Heist tournament (in memory)', () => {
	it('registers players, rejects duplicates and bad names, and assigns provisional rooms', async () => {
		const { t, ids } = await lobby(25);
		tournaments.push(t);
		await expect(t.join('player 3')).rejects.toThrow(/already taken/);
		await expect(t.join('   ')).rejects.toThrow(/display name/);
		await expect(t.join('fuck you')).rejects.toThrow(HeistError);
		expect(t.s.playerCount).toBe(25);
		await new Promise((r) => setTimeout(r, 400)); // lobby push is throttled
		expect(t.s.lobbyRooms).toBe(3); // 25 → r=5 → 3 rooms
		const rooms = ids.map((id) => t.me(id)!.lobbyRoom);
		expect(new Set(rooms)).toEqual(new Set([1, 2, 3]));
		// Tokens are saved with each player before the join is confirmed.
		expect(store.players.get('ZHTEST')!.size).toBe(25);
	});

	it('locks rooms, deals three balanced starters and pushes moves to the room at once', async () => {
		const { t, ids } = await lobby(20);
		tournaments.push(t);
		await t.control('prepare', {});
		expect(t.s.status).toBe('ready');
		expect(t.s.roomCount).toBe(2);
		const late = await t.join('Latecomer');
		expect(t.players.get(late.playerId)!.status).toBe('reserve');

		const boards = [...t.boards.values()];
		for (const b of boards) {
			expect(Object.keys(b.players)).toHaveLength(10);
			expect(Object.keys(b.words)).toHaveLength(30);
			for (const p of Object.values(b.players)) expect(p.score).toBe(12);
		}

		// Two phones in the same room, one in the other room.
		const me = ids[0];
		const roomId = t.players.get(me)!.roomId!;
		const mate = ids.find((id) => id !== me && t.players.get(id)!.roomId === roomId)!;
		const other = ids.find((id) => t.players.get(id)!.roomId !== roomId)!;
		const [pMe, pMate, pOther] = [new FakePeer(), new FakePeer(), new FakePeer()];
		t.bindPlayer(pMe, me);
		t.bindPlayer(pMate, mate);
		t.bindPlayer(pOther, other);

		expect(t.move(me, { requestId: 'early-move-1', kind: 'create', text: 'OAK' }).message).toMatch(/not in progress/);
		await t.control('start', {});
		const steal = findSteal(t.boards.get(roomId)!, me);
		const before = pOther.msgs.length;
		const r = t.move(me, { requestId: 'steal-move-01', kind: 'steal', ...steal });
		expect(r.ok).toBe(true);
		expect(r.gained).toBe(steal.text.length);
		const pushed = pMate.last('board')!.b!;
		expect(Object.values(pushed.words).some((w) => w.text === steal.text && w.owner === me)).toBe(true);
		expect(pushed.players[steal.victim].score).toBe(12 - steal.from.length);
		expect(pOther.msgs.slice(before).some((m) => m.t === 'board')).toBe(false); // other rooms are not told
		expect(JSON.stringify(pushed)).not.toContain('requests');

		// The same word can't be taken twice; a repeated request isn't counted twice.
		expect(t.move(mate, { requestId: 'steal-move-02', kind: 'steal', sourceId: steal.sourceId, text: steal.text }).message).toMatch(/changed hands|already/);
		const again = t.move(me, { requestId: 'steal-move-01', kind: 'steal', ...steal });
		expect(again.duplicate).toBe(true);
		const b = t.boards.get(roomId)!;
		const fromWords = scoresFromWords(b);
		for (const [id, p] of Object.entries(b.players)) expect(p.score).toBe(fromWords[id]);
	});

	it('ends the round on the server when time runs out, and advances the top two per room', async () => {
		vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'Date'] });
		const { t, ids } = await lobby(20, { ...DEFAULT_RULES, roundSeconds: 120 });
		tournaments.push(t);
		await t.control('prepare', {});
		await t.control('start', {});
		// Give one player in each room a clear lead.
		for (const b of t.boards.values()) {
			const leader = Object.keys(b.players)[0];
			t.move(leader, { requestId: `lead-${b.number}-aa`, kind: 'steal', ...findSteal(t.boards.get(b.roomId)!, leader) });
		}
		await vi.advanceTimersByTimeAsync(121_000);
		expect(['review', 'finished']).toContain(t.s.status);
		const r = t.rounds.get(1)!;
		expect(r.rooms).toHaveLength(2);
		// Everyone else is tied on 12 → the second place is an organiser decision.
		for (const room of r.rooms) {
			expect(room.advancing[0]).toBe(room.ranking[0].playerId);
			expect(room.ties).toHaveLength(1);
		}
		expect(t.s.openTies).toBe(2);
		await expect(t.control('next-round', { round: 1 })).rejects.toThrow(/tied/);
		for (const room of r.rooms) await t.control('resolve-tie', { roomId: room.roomId, tieIndex: 0, picks: room.ties[0].candidates.slice(0, 1) });
		expect(t.s.openTies).toBe(0);
		await t.control('next-round', { round: 1 });
		await t.control('next-round', { round: 1 }); // a double click does nothing
		expect(t.s.round).toBe(2);
		expect(t.s.final).toBe(true);
		expect(t.s.roundPlayers).toBe(4);
		const finalBoard = [...t.boards.values()].find((b) => b.round === 2)!;
		for (const p of Object.values(finalBoard.players)) expect(p.score).toBe(12); // fresh scores
		expect(ids.filter((id) => t.players.get(id)!.status === 'eliminated')).toHaveLength(16);
	});

	it('runs a final to a podium, decided ties included', async () => {
		const { t } = await lobby(4);
		tournaments.push(t);
		await t.control('prepare', {});
		expect(t.s.final).toBe(true);
		await t.control('start', {});
		await t.control('end', { round: 1 });
		await t.control('end', { round: 1 }); // repeat is a no-op
		// All four tied on 12: places 1–3 are one tie of three slots.
		const room = t.rounds.get(1)!.rooms[0];
		expect(room.ties[0].slots).toBe(3);
		await t.control('resolve-tie', { roomId: room.roomId, tieIndex: 0, picks: room.ties[0].candidates.slice(0, 3) });
		expect(t.s.status).toBe('finished');
		expect(t.s.podium.map((p) => p.rank)).toEqual([1, 2, 3]);
		expect(t.players.get(t.s.podium[0].playerId)!.status).toBe('champion');
	});

	it('pauses and resumes the clock, removes players, and resets', async () => {
		vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'Date'] });
		const { t, ids } = await lobby(10, { ...DEFAULT_RULES, roundSeconds: 120 });
		tournaments.push(t);
		await t.control('prepare', {});
		await t.control('start', {});
		await vi.advanceTimersByTimeAsync(30_000);
		await t.control('pause', {});
		expect(t.s.pausedRemainingMs).toBe(90_000);
		await vi.advanceTimersByTimeAsync(300_000);
		expect(t.s.status).toBe('paused'); // the timer doesn't run while paused
		await t.control('resume', {});
		await t.control('remove-player', { playerId: ids[0] });
		const b = [...t.boards.values()][0];
		expect(b.players[ids[0]].removed).toBe(true);
		expect(Object.values(b.words).some((w) => w.owner === ids[0])).toBe(false);
		expect(t.move(ids[0], { requestId: 'removed-mv-1', kind: 'create', text: 'OAK' }).message).toMatch(/removed/);
		await expect(t.control('reset', { confirm: 'NOPE' })).rejects.toThrow(/confirm/);
		await t.control('reset', { confirm: 'ZHTEST' });
		expect(t.s.status).toBe('lobby');
		expect(t.boards.size).toBe(0);
		expect(t.players.get(ids[1])!.status).toBe('lobby');
		expect(t.players.get(ids[0])!.status).toBe('removed');
	});

	it('saves in batches and picks a running round back up after a restart', async () => {
		vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'Date'] });
		const { t, ids, tokens } = await lobby(10, { ...DEFAULT_RULES, roundSeconds: 120 });
		await t.control('prepare', {});
		await t.control('start', {});
		const savesBefore = store.saves;
		let moves = 0;
		for (let i = 0; i < 10; i++) {
			const id = ids[i];
			const r = t.move(id, { requestId: `mv-${i}-restart`, kind: 'steal', ...findSteal([...t.boards.values()][0], id) });
			if (r.ok) moves++;
		}
		expect(moves).toBeGreaterThan(3);
		expect(store.saves).toBe(savesBefore); // moves don't write to the database…
		await vi.advanceTimersByTimeAsync(2_100);
		expect(store.saves).toBe(savesBefore + 1); // …they are saved together, every 2 s
		const saved = [...t.boards.values()][0];
		t.dispose(); // the server stops

		const back = (await Tournament.load('ZHTEST', deps()))!;
		tournaments.push(back);
		expect(back.s.status).toBe('playing');
		expect(back.authenticate(ids[3], tokens[3])).toBe(true);
		expect(back.authenticate(ids[3], 'wrong')).toBe(false);
		expect([...back.boards.values()][0].words).toEqual(saved.words);
		await vi.advanceTimersByTimeAsync(120_000);
		expect(['review', 'finished']).toContain(back.s.status); // its timer was re-armed
	});
});
