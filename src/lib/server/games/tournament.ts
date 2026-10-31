import { error, isHttpError, json } from '@sveltejs/kit';
import { createHash, randomBytes, randomInt, timingSafeEqual } from 'node:crypto';
import { collection, doc, getDoc, getDocs, increment, runTransaction, updateDoc, writeBatch, type DocumentSnapshot, type Firestore } from 'firebase/firestore';
import { adminDb } from '$lib/server/admin-session';
import { withLock } from '$lib/server/lock';
import { hasProfanity } from '$lib/server/live/profanity';
import { SESSIONS, type LiveSession } from '$lib/games/tech-word-rush/types';
import { DEFAULT_QUESTIONS, MAX_FIXED_QUESTIONS, pickQuestions, type WordQuestion } from '$lib/games/tech-word-rush/questions';
import { DURATIONS as FLY_DURATIONS, type FlapSession } from '$lib/games/flappy/types';
import { isFlyGame } from '$lib/games/flappy/skins';
import type { DrawSession } from '$lib/games/scribble/types';
import type { DrawSettings } from '$lib/games/scribble/api';
import { advancing, assignRooms, fitFor, nextRoster, parseRules, planFor, podiumOf, rankingOf, type LeaderboardLike } from '$lib/games/tournament/plan';
import {
	CODE_RE,
	FORMAT_OF,
	GAME_TYPE,
	WORDS_PER_STAGE,
	isTournamentGame,
	type FlySettings,
	type GameSettings,
	type PlannedStage,
	type RoomRef,
	type SeatedPlayer,
	type StageResult,
	type StageRoomResult,
	type TournamentControl,
	type TournamentPlayer,
	type TournamentPlayerView,
	type TournamentRules,
	type TournamentSession,
	type TournamentTag,
	type TwrSettings
} from '$lib/games/tournament/types';
import * as twr from './tech-word-rush';
import * as fly from './flappy';
import * as draw from './scribble';

/**
 * Tournaments for the Firestore-run games. The tournament doc holds the
 * roster and the plan; every stage is made of ordinary game sessions (one per
 * room) created through each game's own `createSession` and run by its own
 * presenter and rules. Players register once (one QR code, one name, one
 * device token) and are seated in each stage's games with the same id and
 * token, so their phones carry straight on.
 *
 * Organiser actions run one at a time per tournament (withLock); they are
 * rare and small, so no transactions beyond the game modules' own.
 */

const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'; // no I, L, O, 0, 1
const NAME_MAX = 20;

const sessionRef = (db: Firestore, code: string) => doc(db, SESSIONS, code);
const playerRef = (db: Firestore, code: string, id: string) => doc(db, SESSIONS, code, 'players', id);
const stateRef = (db: Firestore, code: string, id: string) => doc(db, SESSIONS, code, 'playerState', id);
const stageRef = (db: Firestore, code: string, n: number) => doc(db, SESSIONS, code, 'stages', String(n));

const sha256 = (s: string) => createHash('sha256').update(s).digest('hex');

/** Wrap a request handler: HTTP errors pass through, anything else becomes a plain message. */
export async function handle(fn: () => Promise<unknown>) {
	try {
		return json(await fn());
	} catch (err) {
		if (isHttpError(err)) return json({ message: err.body.message }, { status: err.status });
		console.error('[tournament]', err);
		return json({ message: 'Something went wrong. Please try again.' }, { status: 500 });
	}
}

export function parseCode(raw: string | undefined): string {
	const code = (raw ?? '').trim().toUpperCase();
	if (!CODE_RE.test(code)) error(404, 'That tournament code does not exist.');
	return code;
}

export async function readBody(request: Request): Promise<Record<string, unknown>> {
	try {
		const body = await request.json();
		return body && typeof body === 'object' ? body : {};
	} catch {
		error(400, 'Invalid request.');
	}
}

const sessionData = (snap: DocumentSnapshot) => {
	const s = snap.data() as TournamentSession | undefined;
	if (!snap.exists() || s?.gameType !== GAME_TYPE) error(404, 'This tournament no longer exists.');
	return s;
};

async function listPlayers(db: Firestore, code: string) {
	const snap = await getDocs(collection(db, SESSIONS, code, 'players'));
	return snap.docs.map((d) => ({ id: d.id, ...(d.data() as TournamentPlayer) }));
}

// ── Settings ─────────────────────────────────────────────────────────────

/** Check the game's own settings for the tournament's game (400 with a plain message if wrong). */
function parseSettings(game: TournamentSession['game'], raw: unknown): GameSettings {
	const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
	if (game === 'tech-word-rush') {
		const duration = Number(r.duration);
		const words = Number(r.words);
		if (!twr.DURATIONS.includes(duration as never)) error(400, 'Choose a valid time per word.');
		if (!WORDS_PER_STAGE.includes(words as never)) error(400, 'Choose how many words each stage plays.');
		return { duration, words } satisfies TwrSettings;
	}
	if (isFlyGame(game)) {
		const duration = Number(r.duration);
		if (!FLY_DURATIONS.includes(duration as never)) error(400, 'Choose a valid game length.');
		return { duration } satisfies FlySettings;
	}
	const d = draw.parseDrawSettings(r);
	return { drawSeconds: d.drawSeconds, turns: d.turns, packs: d.packs, custom: d.customText } satisfies DrawSettings;
}

// ── Create (admin) ───────────────────────────────────────────────────────

function newCode() {
	let s = 'ZT';
	for (let i = 0; i < 4; i++) s += CODE_ALPHABET[randomInt(CODE_ALPHABET.length)];
	return s;
}

export async function createTournament(createdBy: string, body: Record<string, unknown>): Promise<{ code: string }> {
	const game = body.game;
	if (!isTournamentGame(game)) error(400, 'Choose a game for the tournament.');
	const format = FORMAT_OF[game];
	const rulesIn = (body.rules && typeof body.rules === 'object' ? body.rules : {}) as Record<string, unknown>;
	if (rulesIn.format !== format) error(400, `${game === 'scribble' ? 'Scribble Showdown' : 'This game'} runs as a ${format === 'rooms' ? 'rooms' : 'elimination'} tournament.`);
	const rules = parseRules(rulesIn);
	if (typeof rules === 'string') error(400, rules);
	const settings = parseSettings(game, body.settings);
	const plan = planFor(rules, rules.maxPlayers);
	if (typeof plan === 'string') error(400, plan);

	const db = await adminDb();
	for (let attempt = 0; attempt < 6; attempt++) {
		const code = newCode();
		const session: TournamentSession = {
			code,
			gameType: GAME_TYPE,
			game,
			format,
			status: 'lobby',
			registrationOpen: true,
			createdAt: Date.now(),
			createdBy,
			startedAt: null,
			endedAt: null,
			rules,
			settings,
			playerCount: 0,
			stage: 0,
			totalStages: rules.stages,
			final: false,
			plan,
			rooms: [],
			usedWords: [],
			closed: false,
			podium: [],
			winner: null
		};
		const created = await runTransaction(db, async (tx) => {
			if ((await tx.get(sessionRef(db, code))).exists()) return false; // code taken → try another
			tx.set(sessionRef(db, code), session);
			return true;
		});
		if (created) return { code };
	}
	error(500, 'Could not create a tournament code. Please try again.');
}

// ── Stages ───────────────────────────────────────────────────────────────

/** Tech Word Rush: `count` words the tournament hasn't played yet (repeats only once the bank is used up). */
async function stageWords(db: Firestore, t: TournamentSession, count: number): Promise<WordQuestion[]> {
	const bank = await twr.loadBank(db);
	const used = new Set(t.usedWords ?? []);
	const fresh = (list: readonly WordQuestion[]) => list.filter((q) => !used.has(q.word));
	let picked = pickQuestions(fresh(bank), fresh(DEFAULT_QUESTIONS), count);
	if (picked.length < count) picked = pickQuestions(bank, DEFAULT_QUESTIONS, count);
	if (picked.length < count) error(500, 'Not enough questions in the bank for a stage.');
	return picked.slice(0, Math.min(count, MAX_FIXED_QUESTIONS));
}

/** Make one room: a real game session with the tournament's settings, with its players seated. */
async function createRoom(db: Firestore, t: TournamentSession, st: PlannedStage, number: number, members: SeatedPlayer[]): Promise<RoomRef> {
	const tag: TournamentTag = { code: t.code, game: t.game, stage: st.stage, totalStages: t.totalStages, room: number, rooms: st.sizes.length, final: st.final };
	let code: string;
	if (t.game === 'tech-word-rush') {
		const s = t.settings as TwrSettings;
		const words = await stageWords(db, t, s.words);
		t.usedWords = [...(t.usedWords ?? []), ...words.map((w) => w.word)];
		code = (await twr.createSession(t.createdBy, s.duration, words)).code;
		await twr.seedTournament(db, code, tag, members);
	} else if (isFlyGame(t.game)) {
		code = (await fly.createSession(t.createdBy, (t.settings as FlySettings).duration, t.game)).code;
		await fly.seedTournament(db, code, tag, members);
	} else {
		code = (await draw.createSession(t.createdBy, t.settings as unknown as Record<string, unknown>)).code;
		await draw.seedTournament(db, code, tag, members);
	}
	return { code, number, players: members.length };
}

/**
 * Build stage `plan[0]` for `roster` (ordered): deal the rooms, create their
 * games, seat everyone, and point the tournament at them. `plan` is the rest
 * of the tournament from this stage on.
 */
async function buildStage(db: Firestore, t: TournamentSession, plan: PlannedStage[], roster: (SeatedPlayer & { id: string })[]) {
	const st = plan[0];
	const stageNo = st.stage;
	t.totalStages = stageNo - 1 + plan.length;
	const rooms = assignRooms(roster, st.sizes.length);
	const refs: RoomRef[] = [];
	for (let i = 0; i < rooms.length; i++) refs.push(await createRoom(db, t, st, i + 1, rooms[i]));

	const now = Date.now();
	for (let i = 0; i < roster.length; i += 400) {
		const batch = writeBatch(db);
		rooms.forEach((members, r) => {
			for (const m of members.slice(0)) {
				if (roster.indexOf(m) < i || roster.indexOf(m) >= i + 400) continue;
				batch.update(playerRef(db, t.code, m.id), { status: 'playing', stage: stageNo, room: refs[r].code, roomNumber: refs[r].number } satisfies Partial<TournamentPlayer>);
			}
		});
		await batch.commit();
	}
	const patch: Partial<TournamentSession> = {
		status: 'stage',
		stage: stageNo,
		totalStages: t.totalStages,
		final: st.final,
		plan: [...t.plan.slice(0, stageNo - 1), ...plan],
		rooms: refs,
		usedWords: t.usedWords ?? [],
		startedAt: t.startedAt ?? now
	};
	await updateDoc(sessionRef(db, t.code), patch);
	Object.assign(t, patch);
}

/** The seated form of tournament players (their device-token hashes come from playerState). */
async function seats(db: Firestore, code: string, players: { id: string; name: string; joinedAt: number }[]): Promise<(SeatedPlayer & { id: string })[]> {
	const states = await getDocs(collection(db, SESSIONS, code, 'playerState'));
	const hashes = new Map(states.docs.map((d) => [d.id, String(d.data().tokenHash ?? '')]));
	return players.map((p) => ({ id: p.id, name: p.name, joinedAt: p.joinedAt, tokenHash: hashes.get(p.id) ?? '' }));
}

async function prepare(db: Firestore, t: TournamentSession) {
	if (t.status !== 'lobby') error(409, 'Entries are already locked.');
	const roster = (await listPlayers(db, t.code)).filter((p) => p.status === 'lobby').sort((a, b) => a.joinedAt - b.joinedAt || a.id.localeCompare(b.id));
	if (roster.length < 2) error(409, 'At least 2 players must register first.');
	const plan = fitFor(t.rules, roster.length);
	if (!plan) error(409, 'These players cannot be placed with the current rules.');
	await buildStage(db, t, plan, await seats(db, t.code, roster));
}

type RoomSession = LiveSession | FlapSession | DrawSession;

/**
 * Close the current stage: every room's game must have finished. Each room is
 * ranked from its game's final leaderboard (the game's own tie-breaks), the
 * top players go through — or, in the final, make the podium — and the next
 * stage's games are made straight away, so players see where they're going.
 */
async function finishStage(db: Firestore, t: TournamentSession) {
	if (t.status !== 'stage') error(409, 'No stage is running.');
	const snaps = await Promise.all(t.rooms.map((r) => getDoc(sessionRef(db, r.code))));
	const games = snaps.map((snap, i) => {
		const r = t.rooms[i];
		const s = snap.data() as RoomSession | undefined;
		if (!snap.exists() || !s) error(409, `Room ${r.number}'s game (${r.code}) was deleted. Close the tournament.`);
		if (s.status !== 'finished') error(409, `Room ${r.number} (${r.code}) hasn't finished yet. End it from its presenter first.`);
		if ((s as LiveSession).ranking || (s as DrawSession).scoring) error(409, `Room ${r.number}'s scores are still being counted. Try again in a moment.`);
		return s;
	});

	const players = await listPlayers(db, t.code);
	const st = t.plan[t.stage - 1];
	const perRoom = t.final ? 3 : t.format === 'rooms' ? (t.rules.format === 'rooms' ? t.rules.advance : 0) : st.advance;
	const rooms: StageRoomResult[] = t.rooms.map((r, i) => {
		const members = players.filter((p) => p.status === 'playing' && p.stage === t.stage && p.room === r.code);
		const ranking = rankingOf(games[i].leaderboard as LeaderboardLike[], members);
		return { code: r.code, number: r.number, ranking, advancing: advancing(ranking, perRoom) };
	});
	const result: StageResult = { stage: t.stage, final: t.final, rooms, createdAt: Date.now() };

	// Players: where they finished, and whether they go on.
	const batch = writeBatch(db);
	batch.set(stageRef(db, t.code, t.stage), result);
	for (const room of rooms) {
		const through = new Set(room.advancing);
		for (const e of room.ranking) {
			const patch: Partial<TournamentPlayer> = { lastRank: e.rank, lastScore: e.score };
			if (t.final) {
				patch.place = e.rank;
				patch.status = e.rank === 1 && room.advancing[0] === e.id ? 'champion' : 'finalist';
			} else patch.status = through.has(e.id) ? 'qualified' : 'eliminated';
			batch.update(playerRef(db, t.code, e.id), patch);
		}
	}
	await batch.commit();

	if (t.final) {
		const podium = podiumOf(rooms[0]?.ranking ?? []);
		const patch: Partial<TournamentSession> = { status: 'finished', podium, winner: podium[0] ? { name: podium[0].name, score: podium[0].score } : null, endedAt: Date.now(), registrationOpen: false };
		await updateDoc(sessionRef(db, t.code), patch);
		return;
	}
	const ids = nextRoster(rooms);
	const byId = new Map(players.map((p) => [p.id, p]));
	const roster = ids.map((id) => byId.get(id)!).filter(Boolean);
	if (roster.length < 2) error(409, 'Not enough players went through to play on.');
	const plan = fitFor(t.rules, roster.length, Math.max(1, t.totalStages - t.stage));
	if (!plan) error(409, 'The qualifiers cannot be placed with the current rules.');
	await buildStage(db, t, plan.map((s, i) => ({ ...s, stage: t.stage + 1 + i })), await seats(db, t.code, roster));
}

/** End every room's game that is still open, so nothing is left running. */
async function closeRooms(t: TournamentSession) {
	for (const r of t.rooms) {
		try {
			if (t.game === 'tech-word-rush') await twr.control(r.code, 'finish');
			else if (isFlyGame(t.game)) await fly.control(r.code, 'finish');
			else await draw.control(r.code, 'finish');
		} catch (err) {
			if (!isHttpError(err)) console.error('[tournament] close room', r.code, err);
		}
	}
}

export async function control(code: string, action: TournamentControl, body: Record<string, unknown>): Promise<{ now: number }> {
	const actions: TournamentControl[] = ['sync', 'open-registration', 'close-registration', 'prepare', 'finish-stage', 'remove-player', 'close'];
	if (!actions.includes(action)) error(400, 'Unknown action.');
	const db = await adminDb();
	await withLock(`tournament/${code}`, async () => {
		const t = sessionData(await getDoc(sessionRef(db, code)));
		switch (action) {
			case 'sync':
				return;
			case 'open-registration':
			case 'close-registration':
				if (t.status === 'finished') error(409, 'This tournament has finished.');
				await updateDoc(sessionRef(db, code), { registrationOpen: action === 'open-registration' });
				return;
			case 'prepare':
				await prepare(db, t);
				return;
			case 'finish-stage':
				await finishStage(db, t);
				return;
			case 'remove-player': {
				const id = String(body.playerId ?? '');
				const snap = await getDoc(playerRef(db, code, id));
				if (!snap.exists()) error(404, 'That player is not in this tournament.');
				await updateDoc(playerRef(db, code, id), { status: 'removed' } satisfies Partial<TournamentPlayer>);
				return;
			}
			case 'close':
				if (t.status === 'finished') return;
				if (t.status === 'stage') await closeRooms(t);
				await updateDoc(sessionRef(db, code), { status: 'finished', closed: true, registrationOpen: false, endedAt: Date.now() } satisfies Partial<TournamentSession>);
				return;
		}
	});
	return { now: Date.now() };
}

// ── Participants ─────────────────────────────────────────────────────────

function cleanName(raw: unknown): string {
	const name = (typeof raw === 'string' ? raw : '')
		.replace(/[\u0000-\u001f\u007f<>]/g, '')
		.replace(/\s+/g, ' ')
		.trim();
	if (!name) error(400, 'Enter a display name.');
	if (name.length > NAME_MAX) error(400, `Keep your name under ${NAME_MAX} characters.`);
	if (hasProfanity(name)) error(400, 'Pick a different name.');
	return name;
}

export async function join(code: string, rawName: unknown) {
	const name = cleanName(rawName);
	const db = await adminDb();
	const t = sessionData(await getDoc(sessionRef(db, code)));
	if (t.status === 'finished') error(410, 'This tournament has ended.');
	if (!t.registrationOpen) error(409, 'Registration is closed.');
	if (t.playerCount >= t.rules.maxPlayers) error(409, `This tournament is full (${t.rules.maxPlayers} players).`);

	// Firestore ids are 20 letters and digits, which the games' play endpoints accept.
	const id = doc(collection(db, SESSIONS, code, 'players')).id;
	const token = randomBytes(24).toString('base64url');
	const nameRef = doc(db, SESSIONS, code, 'names', sha256(name.toLowerCase()));
	const now = Date.now();
	await withLock(`${code}/name/${nameRef.id}`, async () => {
		if ((await getDoc(nameRef)).exists()) error(409, 'That name is already taken in this tournament. Try another.');
		// Entries locked: later arrivals are reserves and do not play.
		const player: TournamentPlayer = { name, joinedAt: now, status: t.status === 'lobby' ? 'lobby' : 'reserve', stage: 0, room: null, roomNumber: null, place: null, lastRank: null, lastScore: null };
		const batch = writeBatch(db);
		batch.set(nameRef, { playerId: id });
		batch.set(playerRef(db, code, id), player);
		batch.set(stateRef(db, code, id), { tokenHash: sha256(token) });
		batch.update(sessionRef(db, code), { playerCount: increment(1) });
		await batch.commit();
	});
	return { playerId: id, token, name, now: Date.now() };
}

/** A phone checking it is still in: its token must match. */
export async function play(code: string, body: Record<string, unknown>): Promise<TournamentPlayerView> {
	const playerId = typeof body.playerId === 'string' ? body.playerId : '';
	const token = typeof body.token === 'string' ? body.token : '';
	if (!playerId || !/^[A-Za-z0-9]{10,40}$/.test(playerId) || !token) error(401, 'Join the tournament first.');
	if (body.action !== 'state') error(400, 'Unknown action.');
	const db = await adminDb();
	sessionData(await getDoc(sessionRef(db, code)));
	const [stSnap, pSnap] = await Promise.all([getDoc(stateRef(db, code, playerId)), getDoc(playerRef(db, code, playerId))]);
	const st = stSnap.data() as { tokenHash?: string } | undefined;
	const p = pSnap.data() as TournamentPlayer | undefined;
	const given = Buffer.from(sha256(token));
	const stored = Buffer.from(st?.tokenHash ?? '');
	if (!st || !p || given.length !== stored.length || !timingSafeEqual(given, stored)) error(401, 'This device is no longer in the tournament. Join again.');
	return { now: Date.now(), playerId, player: p };
}
