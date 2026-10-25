import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { uniqueAvatars } from '$lib/games/word-heist/avatars';
import { scoresFromWords } from '$lib/games/word-heist/engine';
import type { HeistServerMessage } from '$lib/games/word-heist/protocol';
import { DEFAULT_RULES, GAME_RULES, OPENING_TILES, type HeistRules } from '$lib/games/word-heist/types';
import { defaultModeration } from './moderation';
import { depsFor } from './service';
import { MemoryHeistStore } from './store';
import { HeistError, Tournament, type Peer } from './tournament';

vi.mock('$lib/server/admin-session', () => ({ adminDb: async () => null }));

const config = defaultModeration();
const deps = () => ({ store, deps: () => depsFor(config) });
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

async function lobby(n: number, rules: HeistRules = DEFAULT_RULES) {
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

/** Test hook: replace the face-up tiles in a player's room. */
function give(t: Tournament, playerId: string, letters: string) {
	const roomId = t.players.get(playerId)!.roomId!;
	const b = t.boards.get(roomId)!;
	t.boards.set(roomId, { ...b, pool: [...letters].map((c, i) => ({ id: 1000 + b.seq * 50 + i, c })) });
	return roomId;
}

/** Two minutes of tiles then 30 s, rooms of up to 10: a full room gets 83 tiles, one every 1.5 s, the last at 120 s. */
const FAST: HeistRules = { ...DEFAULT_RULES, roundSeconds: 120, finalSeconds: 30, stages: 2, roomSize: 10, tileCount: 83 };
const FAST_MS = 150_000;
const fakeTimers = () => vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'Date'] });

/** End the current round and settle every tie by taking the first candidates. */
async function finishRound(t: Tournament) {
	const round = t.s.round;
	await t.control('end', { round });
	for (const room of t.rounds.get(round)!.rooms) {
		for (const [i, tie] of room.ties.entries()) await t.control('resolve-tie', { roomId: room.roomId, tieIndex: i, picks: tie.candidates.slice(0, tie.slots) });
	}
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
		expect(t.s.lobbyRooms).toBe(3); // 25 over 3 stages → rooms of 9, 8, 8
		const rooms = ids.map((id) => t.me(id)!.lobbyRoom);
		expect(new Set(rooms)).toEqual(new Set([1, 2, 3]));
		// Tokens are saved with each player before the join is confirmed.
		expect(store.players.get('ZHTEST')!.size).toBe(25);
	});

	it('stops registering at the participant limit', async () => {
		const { t } = await lobby(30, { ...DEFAULT_RULES, maxPlayers: 30 });
		tournaments.push(t);
		await expect(t.join('One too many')).rejects.toThrow(/full \(30 players\)/);
	});

	it('a game is one room of up to 12, one round, then a podium', async () => {
		const { t } = await lobby(12, GAME_RULES);
		tournaments.push(t);
		await expect(t.join('Thirteenth')).rejects.toThrow(/game is full/);
		await t.control('prepare', {});
		expect(t.s).toMatchObject({ roomCount: 1, final: true, totalStages: 1 });
		const b = [...t.boards.values()][0];
		expect(Object.keys(b.players)).toHaveLength(12);
		expect(b.tiles.count).toBe(140); // 20 + 10 a player
		await t.control('start', {});
		await finishRound(t);
		expect(t.s.status).toBe('finished');
		expect(t.s.podium).toHaveLength(3);
	});

	it('locks rooms with everyone on 0, turns over the opening tiles, and pushes moves to the room at once', async () => {
		const { t, ids } = await lobby(20);
		tournaments.push(t);
		await t.control('prepare', {});
		expect(t.s.status).toBe('ready');
		expect(t.s.roomCount).toBe(2);
		expect(t.s.totalStages).toBe(2); // 3 planned, but 20 players only fill 2
		const late = await t.join('Latecomer');
		expect(t.players.get(late.playerId)!.status).toBe('reserve');

		for (const b of t.boards.values()) {
			expect(Object.keys(b.players)).toHaveLength(10);
			expect(b.words).toEqual({});
			expect(b.pool).toEqual([]);
			expect(b.tiles.count).toBe(93); // a room of 10 is a band below a full room of 12: 140 × 2/3
			expect(b.bag).toHaveLength(b.tiles.count);
			for (const p of Object.values(b.players)) expect(p.score).toBe(0);
		}
		const [b1, b2] = [...t.boards.values()];
		expect(b1.bag).not.toBe(b2.bag); // every room has its own bag

		// Two phones in the same room, one in the other room.
		const me = ids[0];
		const roomId = t.players.get(me)!.roomId!;
		const mate = ids.find((id) => id !== me && t.players.get(id)!.roomId === roomId)!;
		const other = ids.find((id) => t.players.get(id)!.roomId !== roomId)!;
		const [pMe, pMate, pOther] = [new FakePeer(), new FakePeer(), new FakePeer()];
		t.bindPlayer(pMe, me);
		t.bindPlayer(pMate, mate);
		t.bindPlayer(pOther, other);

		expect(t.move(me, { requestId: 'early-move-1', text: 'OAK' }).message).toMatch(/not in progress/);
		await t.control('start', {});
		const opened = pMe.last('board')!.b!;
		expect(opened.pool).toHaveLength(OPENING_TILES);
		expect(opened.drawn).toBe(OPENING_TILES);
		expect(opened.tiles.count).toBe(93);
		expect('bag' in opened).toBe(false); // phones never see upcoming tiles
		expect(JSON.stringify(opened)).not.toContain('requests');

		give(t, me, 'TACX');
		const before = pOther.msgs.length;
		expect(t.move(me, { requestId: 'make-move-01', text: 'cat' })).toMatchObject({ ok: true, gained: 3 });
		expect(pMate.last('board')!.b!.pool.map((x) => x.c)).toEqual(['X']);
		expect(pOther.msgs.slice(before).some((m) => m.t === 'board')).toBe(false); // other rooms are not told

		// A word that isn't in the tiles can't just be typed in.
		expect(t.move(mate, { requestId: 'free-word-01', text: 'ZEBRA' }).message).toMatch(/Letters not available/);

		give(t, mate, 'R');
		expect(t.move(mate, { requestId: 'steal-move-01', text: 'CART' })).toMatchObject({ ok: true, gained: 4 });
		const pushed = pMe.last('board')!.b!;
		expect(pushed.players[me].score).toBe(0);
		expect(pushed.players[mate].score).toBe(4);
		expect(pushed.feed[0]).toMatchObject({ kind: 'steal', from: 'CAT', text: 'CART', victim: me });

		// The same word can't be taken twice; a repeated request isn't counted twice.
		expect(t.move(me, { requestId: 'steal-move-02', text: 'CART' }).message).toMatch(/already on the board/);
		expect(t.move(mate, { requestId: 'steal-move-01', text: 'CART' }).duplicate).toBe(true);
		const b = t.boards.get(roomId)!;
		const fromWords = scoresFromWords(b);
		for (const [id, p] of Object.entries(b.players)) expect(p.score).toBe(fromWords[id]);
	});

	it('drops tiles on the server clock, ends at the chosen time, and advances the top two per room', async () => {
		fakeTimers();
		const { t, ids } = await lobby(20, FAST);
		tournaments.push(t);
		await t.control('prepare', {});
		await t.control('start', {});
		expect(t.s.timerEndsAt! - Date.now()).toBe(FAST_MS); // the organiser's round length
		const drawn = () => [...t.boards.values()].map((b) => b.drawn);
		expect(drawn()).toEqual([3, 3]);
		await vi.advanceTimersByTimeAsync(1_600); // the clock fires just after a tile is due
		expect(drawn()).toEqual([4, 4]);
		// Give one player in each room a clear lead.
		for (const b of t.boards.values()) {
			const leader = Object.keys(b.players)[0];
			give(t, leader, 'DOG');
			expect(t.move(leader, { requestId: `lead-${b.number}-aa`, text: 'DOG' }).ok).toBe(true);
		}
		await vi.advanceTimersByTimeAsync(118_500); // 120.1 s: the last tile was due at 120 s
		expect(drawn()).toEqual([83, 83]); // the bag is empty…
		expect(t.s.status).toBe('playing'); // …and the final 30 s are running
		await vi.advanceTimersByTimeAsync(30_000);
		expect(['review', 'finished']).toContain(t.s.status);
		const r = t.rounds.get(1)!;
		expect(r.rooms).toHaveLength(2);
		// Everyone else is on 0 with no word → the second place is an organiser decision.
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
		for (const p of Object.values(finalBoard.players)) expect(p.score).toBe(0); // fresh scores
		expect(finalBoard.pool).toEqual([]);
		expect(finalBoard.tiles.count).toBe(42); // a room of 4: fewer tiles over the same round
		expect(ids.filter((id) => t.players.get(id)!.status === 'eliminated')).toHaveLength(16);
	});

	it('plays the stages and number going through that the organiser chose', async () => {
		const { t } = await lobby(30, { ...DEFAULT_RULES, stages: 3, advance: 3, maxPlayers: 30 });
		tournaments.push(t);
		await t.control('prepare', {});
		expect(t.s).toMatchObject({ roomCount: 3, totalStages: 3, final: false });
		await t.control('start', {});
		await finishRound(t);
		expect(t.rounds.get(1)!.rooms.every((room) => room.advancing.length === 3)).toBe(true);
		await t.control('next-round', { round: 1 });
		expect(t.s).toMatchObject({ round: 2, roundPlayers: 9, roomCount: 2, final: false }); // rooms of 5 and 4
		await t.control('start', {});
		await finishRound(t);
		await t.control('next-round', { round: 2 });
		expect(t.s).toMatchObject({ round: 3, roundPlayers: 6, roomCount: 1, final: true });
	});

	it('rooms of different sizes drop tiles at their own pace', async () => {
		fakeTimers();
		const { t } = await lobby(21); // rooms of 11 and 10: different size bands
		tournaments.push(t);
		await t.control('prepare', {});
		await t.control('start', {});
		await vi.advanceTimersByTimeAsync(30_050); // just after any tile due at 30 s (the clock fires a moment after)
		const boards = [...t.boards.values()];
		expect(boards[0].tiles.count).toBeGreaterThan(boards[1].tiles.count);
		for (const b of boards) expect(b.drawn).toBe(OPENING_TILES + Math.floor(30_050 / b.tiles.everyMs));
		expect(boards[0].drawn).toBeGreaterThan(boards[1].drawn);
	});

	it('runs a final to a podium, decided ties included', async () => {
		const { t } = await lobby(4);
		tournaments.push(t);
		await t.control('prepare', {});
		expect(t.s.final).toBe(true); // too few for 3 stages: straight to the final
		await t.control('start', {});
		await t.control('end', { round: 1 });
		await t.control('end', { round: 1 }); // repeat is a no-op
		// All four tied on 0: places 1–3 are one tie of three slots.
		const room = t.rounds.get(1)!.rooms[0];
		expect(room.ties[0].slots).toBe(3);
		await t.control('resolve-tie', { roomId: room.roomId, tieIndex: 0, picks: room.ties[0].candidates.slice(0, 3) });
		expect(t.s.status).toBe('finished');
		expect(t.s.closed).toBe(false);
		expect(t.s.podium.map((p) => p.rank)).toEqual([1, 2, 3]);
		expect(t.players.get(t.s.podium[0].playerId)!.status).toBe('champion');
	});

	it('pausing freezes the tiles and the clock; removes players; resets', async () => {
		fakeTimers();
		const { t, ids } = await lobby(10, FAST);
		tournaments.push(t);
		await t.control('prepare', {});
		await t.control('start', {});
		await vi.advanceTimersByTimeAsync(10_000);
		await t.control('pause', {});
		expect(t.s.pausedRemainingMs).toBe(FAST_MS - 10_000);
		const first = () => [...t.boards.values()][0];
		const every = first().tiles.everyMs;
		expect(first().drawn).toBe(OPENING_TILES + Math.floor(10_000 / every));
		await vi.advanceTimersByTimeAsync(300_000);
		expect(t.s.status).toBe('paused');
		expect(first().drawn).toBe(OPENING_TILES + Math.floor(10_000 / every));
		expect(t.move(ids[1], { requestId: 'paused-mv-1', text: 'DOG' }).message).toMatch(/paused/);
		await t.control('resume', {});
		await vi.advanceTimersByTimeAsync(2_100);
		expect(first().drawn).toBe(OPENING_TILES + Math.floor(12_100 / every));
		await t.control('remove-player', { playerId: ids[0] });
		expect(t.boards.get(t.players.get(ids[0])!.roomId!)!.players[ids[0]].removed).toBe(true);
		expect(t.move(ids[0], { requestId: 'removed-mv-1', text: 'OAK' }).message).toMatch(/removed/);
		await expect(t.control('reset', { confirm: 'NOPE' })).rejects.toThrow(/confirm/);
		await t.control('reset', { confirm: 'ZHTEST' });
		expect(t.s.status).toBe('lobby');
		expect(t.boards.size).toBe(0);
		expect(t.players.get(ids[1])!.status).toBe('lobby');
		expect(t.players.get(ids[0])!.status).toBe('removed');
	});

	it('closing the lobby ends it for good and marks it closed', async () => {
		const { t } = await lobby(3);
		tournaments.push(t);
		await t.control('close', {});
		expect(t.s).toMatchObject({ status: 'finished', closed: true, registrationOpen: false });
		expect(t.s.endedAt).not.toBeNull();
		expect(t.view().closed).toBe(true); // phones use this to go home
		expect(store.sessions.get('ZHTEST')!.status).toBe('finished'); // saved straight away
		await expect(t.join('Late')).rejects.toThrow(/finished/);
		await expect(t.control('open-registration', {})).rejects.toThrow(/finished/);
		await t.control('close', {}); // a double click does nothing
	});

	it('closing during a round stops the tile clock without scoring', async () => {
		fakeTimers();
		const { t } = await lobby(4, FAST);
		tournaments.push(t);
		await t.control('prepare', {});
		await t.control('start', {});
		await t.control('close', {});
		await vi.advanceTimersByTimeAsync(FAST_MS + 5_000);
		expect(t.s.status).toBe('finished');
		expect(t.rounds.size).toBe(0);
		expect([...t.boards.values()].every((b) => b.status === 'finished' && b.drawn === OPENING_TILES)).toBe(true);
	});

	it('saves in batches and picks a running round back up after a restart', async () => {
		fakeTimers();
		const { t, ids, tokens } = await lobby(10, FAST);
		await t.control('prepare', {});
		await t.control('start', {});
		const savesBefore = store.saves;
		['DOG', 'CAT', 'SUN', 'HAT', 'PEN'].forEach((w, i) => {
			give(t, ids[i], w);
			expect(t.move(ids[i], { requestId: `mv-${i}-restart`, text: w }).ok).toBe(true);
		});
		expect(store.saves).toBe(savesBefore); // moves don't write to the database…
		await vi.advanceTimersByTimeAsync(2_100);
		expect(store.saves).toBe(savesBefore + 1); // …they are saved together, every 2 s
		const saved = structuredClone([...t.boards.values()][0]);
		t.dispose(); // the server stops

		const back = (await Tournament.load('ZHTEST', deps()))!;
		tournaments.push(back);
		expect(back.s.status).toBe('playing');
		expect(back.authenticate(ids[3], tokens[3])).toBe(true);
		expect(back.authenticate(ids[3], 'wrong')).toBe(false);
		const restored = [...back.boards.values()][0];
		expect(restored.words).toEqual(saved.words);
		expect(restored.bag).toBe(saved.bag);
		expect(restored.tiles).toEqual(saved.tiles);
		await vi.advanceTimersByTimeAsync(3_000);
		expect([...back.boards.values()][0].drawn).toBeGreaterThan(saved.drawn); // the tile clock was re-armed
		await vi.advanceTimersByTimeAsync(FAST_MS);
		expect(['review', 'finished']).toContain(back.s.status);
	});

	it('tiles turned over by the clock are not saved (a restart turns them over again)', async () => {
		fakeTimers();
		const { t } = await lobby(10, FAST);
		tournaments.push(t);
		await t.control('prepare', {});
		await t.control('start', {});
		const savesBefore = store.saves;
		await vi.advanceTimersByTimeAsync(10_000); // several tiles, no moves
		expect([...t.boards.values()][0].drawn).toBeGreaterThan(OPENING_TILES);
		expect(store.saves).toBe(savesBefore); // nothing to write
	});
});

describe('Word Heist avatars', () => {
	it('settles clashes in a room: the first to pick keeps it, the next gets the next free one', () => {
		expect(uniqueAvatars([7, 7, 3, 7, 8])).toEqual([7, 9, 3, 10, 8]);
		// The bug the 200-bot run found: a bumped 8 must not take the 9 someone later asked for.
		expect(uniqueAvatars([8, 8, 9])).toEqual([8, 10, 9]);
		expect(uniqueAvatars([99, 99])).toEqual([99, 0]);
		expect(uniqueAvatars([-1, 500])).toEqual([0, 1]); // bad picks get a free one
	});

	it('in a game an avatar can be taken once, even by two phones joining at the same moment', async () => {
		const t = (await Tournament.create('ZHTEST', 'admin@test', GAME_RULES, deps()))!;
		tournaments.push(t);
		await t.join('First', 5);
		await expect(t.join('Second', 5)).rejects.toThrow(/already picked that avatar/);
		const [a, b] = await Promise.allSettled([t.join('Racer A', 9), t.join('Racer B', 9)]);
		expect([a.status, b.status].sort()).toEqual(['fulfilled', 'rejected']);
		expect(t.view().takenAvatars.sort((x, y) => x - y)).toEqual([5, 9]);
		const noPick = await t.join('No pick');
		expect(t.me(noPick.playerId)!.avatar).not.toBe(5);
	});

	it('in a tournament everyone may pick any avatar, and each room ends up with all different ones', async () => {
		const t = (await Tournament.create('ZHTEST', 'admin@test', DEFAULT_RULES, deps()))!;
		tournaments.push(t);
		const ids: string[] = [];
		for (let i = 0; i < 30; i++) ids.push((await t.join(`Player ${i + 1}`, i % 2 ? 7 : i)).playerId); // half want 7
		expect(t.view().takenAvatars).toEqual([]);
		await t.control('prepare', {});
		for (const b of t.boards.values()) {
			const seated = Object.values(b.players);
			const avatars = seated.map((p) => p.avatar);
			expect(new Set(avatars).size).toBe(avatars.length);
			expect(seated.map((p) => p.seat).sort((x, y) => x! - y!)).toEqual(seated.map((_, i) => i));
			expect(avatars).toContain(7); // somebody in each room got the 7 they asked for
		}
		// A player's own pick is kept for the next room, where it may be free again.
		expect(t.me(ids[1])!.avatar).toBe(7);
	});
});

describe('Word Heist between stages', () => {
	/** Test hook: give everyone in the current round a different score, so no place is tied. */
	function spreadScores(t: Tournament) {
		for (const b of t.boards.values()) {
			if (b.round !== t.s.round) continue;
			Object.values(b.players).forEach((p, i) => Object.assign(p, { score: 50 - i, longest: 3, longestAt: i }));
		}
	}

	it('allots the next stage as soon as every place is decided, then waits for the organiser to start', async () => {
		fakeTimers();
		const { t, ids } = await lobby(24, { ...FAST, stages: 2, advance: 2, maxPlayers: 24 });
		tournaments.push(t);
		await t.control('prepare', {});
		await t.control('start', {});
		spreadScores(t);
		await t.control('end', { round: 1 });
		// No ties: the final's room is ready at once, with fresh tiles and everyone on 0.
		// (24 players in rooms of up to 10 → 3 rooms of 8, 2 through from each → 6 in the final.)
		expect(t.s).toMatchObject({ round: 2, status: 'ready', final: true, roomCount: 1, roundPlayers: 6 });
		const finalBoard = [...t.boards.values()].find((b) => b.round === 2)!;
		expect(finalBoard.status).toBe('ready');
		expect(Object.values(finalBoard.players).every((p) => p.score === 0)).toBe(true);
		const through = Object.keys(finalBoard.players);
		for (const id of through) expect(t.players.get(id)).toMatchObject({ status: 'playing', round: 2, roomId: finalBoard.roomId });
		expect(ids.filter((id) => t.players.get(id)!.status === 'eliminated')).toHaveLength(18);
		// Nothing starts on its own, however long the organiser takes.
		await vi.advanceTimersByTimeAsync(10 * 60_000);
		expect(t.s.status).toBe('ready');
		expect(finalBoard.drawn).toBe(0);
		await t.control('next-round', { round: 1 }); // a late click on "Prepare" does nothing
		expect(t.s.round).toBe(2);
		await t.control('start', {});
		expect(t.s.status).toBe('playing');
	});

	it('with a tie at the cutoff, waits for the decision, then allots the stage (still not started)', async () => {
		const { t } = await lobby(24, { ...FAST, stages: 2, advance: 2, maxPlayers: 24 });
		tournaments.push(t);
		await t.control('prepare', {});
		await t.control('start', {});
		await t.control('end', { round: 1 }); // everyone on 0: tied
		expect(t.s.status).toBe('review');
		expect(t.s.round).toBe(1);
		for (const room of t.rounds.get(1)!.rooms) {
			for (const [i, tie] of room.ties.entries()) await t.control('resolve-tie', { roomId: room.roomId, tieIndex: i, picks: tie.candidates.slice(0, tie.slots) });
		}
		expect(t.s).toMatchObject({ round: 2, status: 'ready' });
	});
});
