// Word Heist load test: up to 300 simulated phones play a real tournament
// over the same WebSocket the phones use (the live server, `/heist`).
//
//   npm run heist:bots -- <CODE> [--bots 200] [--url http://localhost:5173]
//   npm run heist:bots -- --auto [--bots 200] [--seconds 60] [--url ...]
//
// With a code: create the tournament in Admin → Games → Word Heist, then run
// this. Bots register, wait in the lobby and play every round you start from
// the dashboard (lock rooms, start, end, decide ties, next round).
//
// --auto: the script also plays organiser — it signs in with ADMIN_EMAIL /
// ADMIN_PASSWORD from .env, creates a quick tournament on the live server
// (40 tiles, one every 3 s) and drives every round to the final. Rounds end
// on their own when the tiles run out; --seconds ends each one sooner.
// Open the printed dashboard link to watch.
//
// Bots play like people: they only use the face-up tiles — making words from
// them, or stealing a word by adding one or two tiles.
//
// Every bot has its own socket. The report gives the move round trip (send →
// verdict), how long a move takes to reach the other phones in the room, and
// connection problems. At the end it checks what the server saved to
// Firestore: every score equals the letters held, no word twice in a room,
// room sizes follow the allocation rule, two qualifiers per room, a podium.
// It exits 1 on any problem. Bot names start with "Bot ".

import { initializeApp } from 'firebase/app';
import { getAuth, signInWithEmailAndPassword } from 'firebase/auth';
import { collection, doc, getDoc, getDocs, getFirestore, terminate } from 'firebase/firestore';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);

// Copy of an engine.ts helper (that file's extensionless imports don't load in plain Node).
function scoresFromWords(board) {
	const out = {};
	for (const id of Object.keys(board.players)) out[id] = 0;
	for (const w of Object.values(board.words)) out[w.owner] = (out[w.owner] ?? 0) + w.text.length;
	return out;
}

// ── Args ─────────────────────────────────────────────────────────────────

function parseArgs(argv) {
	const args = { code: '', bots: 200, url: 'http://localhost:5173', auto: false, seconds: 0, breakSeconds: 10 };
	for (let i = 0; i < argv.length; i++) {
		const a = argv[i];
		if (a === '--bots' || a === '-n') args.bots = Number(argv[++i]);
		else if (a === '--url') args.url = argv[++i];
		else if (a === '--seconds') args.seconds = Number(argv[++i]);
		else if (a === '--break') args.breakSeconds = Number(argv[++i]);
		else if (a === '--auto') args.auto = true;
		else if (!a.startsWith('-')) args.code = a.trim().toUpperCase();
	}
	return args;
}

const args = parseArgs(process.argv.slice(2));
const BASE = args.url.replace(/\/+$/, '');
if ((!args.auto && !/^ZH[A-Z2-9]{4}$/.test(args.code)) || !(args.bots >= 2 && args.bots <= 300) || !(args.seconds === 0 || args.seconds >= 10)) {
	console.error('Usage: npm run heist:bots -- <CODE> [--bots 2-300] [--url http://localhost:5173]');
	console.error('       npm run heist:bots -- --auto [--bots 200] [--seconds 60 (end rounds early)] [--break 10 (seconds before starting each later stage)]');
	process.exit(1);
}
const env = process.env;
if (!env.VITE_FIREBASE_API_KEY || !env.VITE_FIREBASE_PROJECT_ID) {
	console.error('Missing VITE_FIREBASE_* variables. Run through `npm run heist:bots` so .env is loaded.');
	process.exit(1);
}

// ── Dictionary (same SCOWL lists as the server) ──────────────────────────

const WORDS = new Set();
for (const d of ['english', 'american', 'british']) {
	for (const n of [10, 20, 35, 40, 50, 55, 60]) {
		for (const w of require(`wordlist-english/${d}-words-${n}.json`)) if (/^[a-z]+$/.test(w)) WORDS.add(w.toUpperCase());
	}
}
const COMMON = new Set();
for (const d of ['english', 'american', 'british']) for (const n of [10, 20]) for (const w of require(`wordlist-english/${d}-words-${n}.json`)) if (/^[a-z]{3,7}$/.test(w)) COMMON.add(w.toUpperCase());
const COMMON_LIST = [...COMMON];
const sortKey = (w) => [...w].sort().join('');
const ANAGRAMS = new Map();
for (const w of WORDS) {
	if (w.length > 14) continue;
	const k = sortKey(w);
	if (!ANAGRAMS.has(k)) ANAGRAMS.set(k, []);
	ANAGRAMS.get(k).push(w);
}
/** Can `word` be spelled from these tile letters (repeats counted)? */
function fromTiles(word, letters) {
	const left = [...letters];
	for (const c of word) {
		const i = left.indexOf(c);
		if (i < 0) return false;
		left.splice(i, 1);
	}
	return true;
}
/** Steals of `w` that add one or two of these tile letters (never just S on the end). */
function stealsOf(w, letters) {
	const adds = new Set();
	for (let i = 0; i < letters.length; i++) {
		adds.add(letters[i]);
		for (let j = i + 1; j < letters.length; j++) adds.add(letters[i] + letters[j]);
	}
	const out = [];
	for (const add of adds) for (const cand of ANAGRAMS.get(sortKey(w + add)) ?? []) if (cand !== w + 'S') out.push(cand);
	return out;
}

// ── Helpers ──────────────────────────────────────────────────────────────

const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const rand = (min, max) => min + Math.floor(Math.random() * (max - min + 1));
const pick = (list) => list[Math.floor(Math.random() * list.length)];
const rid = () => `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
const percentile = (list, p) => {
	if (!list.length) return 0;
	const s = [...list].sort((a, b) => a - b);
	return s[Math.min(s.length - 1, Math.floor((p / 100) * s.length))];
};

const stats = { moves: 0, ok: 0, timeouts: 0, rejected: {}, rtt: [], spread: [], drops: 0, errors: {} };
const problems = [];
const problem = (msg) => {
	problems.push(msg);
	if (problems.length <= 20) console.log(`  ⚠️  ${msg}`);
};

const SOCKET = BASE.replace(/^http/, 'ws') + '/heist';

function connect(onMessage) {
	return new Promise((resolve, reject) => {
		const ws = new WebSocket(SOCKET);
		ws.onopen = () => resolve(ws);
		ws.onerror = () => reject(new Error(`could not connect to ${SOCKET}`));
		ws.onmessage = (e) => onMessage(JSON.parse(e.data));
	});
}

// ── Organiser / watcher ──────────────────────────────────────────────────

const app = initializeApp({ apiKey: env.VITE_FIREBASE_API_KEY, authDomain: env.VITE_FIREBASE_AUTH_DOMAIN, projectId: env.VITE_FIREBASE_PROJECT_ID, appId: env.VITE_FIREBASE_APP_ID });
const db = getFirestore(app);
// Signed in as the organiser: creates the tournament and reads the saved results.
const cred = await signInWithEmailAndPassword(getAuth(app), env.ADMIN_EMAIL, env.ADMIN_PASSWORD);
const adminToken = await cred.user.getIdToken();

let code = args.code;
let session = null;
const controls = new Map();

if (args.auto) {
	const res = await fetch(`${BASE}/api/live/heist`, {
		method: 'POST',
		headers: { 'content-type': 'application/json', authorization: `Bearer ${adminToken}` },
		// Two-minute rounds; 3 stages with 2 going through takes up to 432.
		body: JSON.stringify({ rules: { mode: 'tournament', roundSeconds: 120, stages: 3, advance: 2, maxPlayers: Math.max(args.bots, 24) } })
	});
	const data = await res.json().catch(() => ({}));
	if (!res.ok) {
		console.error(`Could not create a tournament: ${data.message ?? res.status}`);
		process.exit(1);
	}
	code = data.code;
	console.log(`Created tournament ${code}`);
}

const adminWs = await connect((m) => {
	if (m.t === 'tournament') session = m.s;
	if (m.t === 'control') controls.get(m.reqId)?.(m);
	if (m.t === 'error') problem(`organiser socket: ${m.message}`);
});
adminWs.send(JSON.stringify({ t: 'admin', code, token: adminToken }));

function control(action, extra = {}) {
	const reqId = rid();
	return new Promise((resolve, reject) => {
		controls.set(reqId, (m) => {
			controls.delete(reqId);
			if (m.ok) resolve();
			else reject(new Error(m.message));
		});
		adminWs.send(JSON.stringify({ t: 'control', reqId, action, ...extra }));
	});
}

async function waitFor(pred, label, ms = 30 * 60_000) {
	const end = Date.now() + ms;
	while (!pred()) {
		if (Date.now() > end) throw new Error(`Timed out waiting for ${label}`);
		await wait(100);
	}
}
await waitFor(() => session, 'the tournament', 15_000).catch(() => {
	console.error(`No Word Heist tournament ${code} on ${BASE} (is the dev server / live server running?).`);
	process.exit(1);
});
console.log(`Dashboard: ${BASE}/admin/games/word-heist/live/${code}`);
console.log(`Players:   ${BASE}/join/heist/${code}\n`);

// ── Bots ─────────────────────────────────────────────────────────────────

/** When each accepted word was sent ("TEXT@at" → time), to time how fast room-mates see it. */
const sentAt = new Map();
let finished = false;

/** Avatars (see src/lib/games/word-heist/avatars.ts): 100, by index. */
const AVATAR_COUNT = 100;
const AVATAR_CLASH = 7;
const avatarStats = { rooms: 0, kept: 0, moved: 0 };

class Bot {
	constructor(i) {
		this.i = i;
		this.name = `Bot ${i + 1}`;
		this.id = null;
		this.me = null;
		this.board = null;
		this.pending = new Map();
		this.seen = new Set();
		// Every 4th bot wants the same avatar, so rooms are sure to have clashes to settle;
		// every 50th sends a bad one (the server must pick for it); the rest pick at random.
		this.avatar = i % 50 === 3 ? 999 : i % 4 === 0 ? AVATAR_CLASH : Math.floor(Math.random() * AVATAR_COUNT);
	}

	async open() {
		this.ws = await connect((m) => this.onMessage(m));
		this.ws.onclose = () => {
			if (!finished) {
				stats.drops++;
				problem(`${this.name}'s connection dropped`);
			}
		};
	}

	onMessage(m) {
		if (m.t === 'joined') this.joined?.(m);
		else if (m.t === 'me') this.me = m.me;
		else if (m.t === 'board') {
			this.board = m.b;
			if (!m.b) return;
			const now = Date.now();
			for (const w of Object.values(m.b.words)) {
				const key = `${w.text}@${w.at}`;
				if (this.seen.has(key)) continue;
				this.seen.add(key);
				const at = sentAt.get(key);
				if (at && w.owner !== this.id) stats.spread.push(now - at);
			}
		} else if (m.t === 'move') this.pending.get(m.requestId)?.(m.result);
		else if (m.t === 'error') {
			stats.errors[m.message] = (stats.errors[m.message] ?? 0) + 1;
			this.joined?.({ error: m.message });
		}
	}

	join() {
		return new Promise((resolve, reject) => {
			this.joined = (m) => {
				this.joined = null;
				if (m.error) return reject(new Error(m.error));
				this.id = m.playerId;
				resolve();
			};
			this.ws.send(JSON.stringify({ t: 'join', code, name: this.name, avatar: this.avatar }));
		});
	}

	send(body) {
		const requestId = rid();
		const t0 = Date.now();
		return new Promise((resolve) => {
			const timer = setTimeout(() => {
				this.pending.delete(requestId);
				stats.timeouts++;
				resolve(null);
			}, 10_000);
			this.pending.set(requestId, (result) => {
				clearTimeout(timer);
				this.pending.delete(requestId);
				stats.rtt.push(Date.now() - t0);
				resolve({ result, t0 });
			});
			this.ws.send(JSON.stringify({ t: 'move', requestId, ...body }));
		});
	}

	/** One turn, from the face-up tiles: steal a word if it can, else make one; now and then a bad move. */
	async turn() {
		const board = this.board;
		if (!board || board.status !== 'playing') return;
		const rules = board.rules;
		const letters = board.pool.map((t) => t.c);
		const onBoard = new Set(Object.values(board.words).map((w) => w.text));
		const steals = Object.values(board.words)
			.filter(() => Math.random() < 0.6)
			.flatMap((w) => stealsOf(w.text, letters))
			.filter((c) => !onBoard.has(c));
		const roll = Math.random();
		let text;
		if (roll < 0.04) text = pick(['QZXV', 'AB', 'ZEBRA']); // not a word / too short / letters not there
		else if (steals.length && roll < 0.8) text = pick(steals);
		else {
			const made = COMMON_LIST.filter((w) => w.length >= rules.minWordLength && !onBoard.has(w) && fromTiles(w, letters));
			if (!made.length) return; // nothing to play yet: wait for more tiles
			text = pick(made);
		}
		const body = { text };
		stats.moves++;
		const t0 = Date.now();
		const out = await this.send(body);
		if (!out) return;
		if (out.result.ok) {
			stats.ok++;
			// The pushed board (which arrives before the verdict) holds the new word.
			const mine = Object.values(this.board?.words ?? {}).find((w) => w.text === body.text && w.owner === this.id);
			if (mine) sentAt.set(`${mine.text}@${mine.at}`, t0);
		} else {
			const reason = out.result.message.replace(/[A-Z]{2,}/g, 'WORD');
			stats.rejected[reason] = (stats.rejected[reason] ?? 0) + 1;
		}
	}
}

const bots = Array.from({ length: args.bots }, (_, i) => new Bot(i));
const t0 = Date.now();
await Promise.all(
	bots.map(async (b) => {
		await wait(rand(0, 3000)); // a crowd scanning the QR code
		try {
			await b.open();
			await b.join();
		} catch (err) {
			problem(`${b.name} could not join: ${err.message}`);
		}
	})
);
const joined = bots.filter((b) => b.id);
console.log(`Registered ${joined.length}/${args.bots} in ${((Date.now() - t0) / 1000).toFixed(1)} s`);

async function playRound(round) {
	await waitFor(() => joined.every((b) => b.me?.round !== round || b.board?.status === 'playing'), 'boards', 10_000).catch(() => {});
	const mine = joined.filter((b) => b.me?.status === 'playing' && b.me.round === round);
	console.log(`Round ${round}: ${mine.length} bots in ${new Set(mine.map((b) => b.board?.roomId)).size} rooms`);
	const [rtt0, spread0, moves0] = [stats.rtt.length, stats.spread.length, stats.moves];
	const live = () => session.status === 'playing' || session.status === 'paused';
	await Promise.all(
		mine.map(async (b) => {
			await wait(rand(300, 3000));
			while (live()) {
				if (session.status === 'playing') await b.turn();
				await wait(rand(1500, 5000));
			}
		})
	);
	const rtt = stats.rtt.slice(rtt0);
	const spread = stats.spread.slice(spread0);
	console.log(
		`  ${stats.moves - moves0} moves · verdict p50 ${percentile(rtt, 50)} ms, p95 ${percentile(rtt, 95)} ms, max ${Math.max(0, ...rtt)} ms` +
			` · seen by room-mates p50 ${percentile(spread, 50)} ms, p95 ${percentile(spread, 95)} ms`
	);
}

// ── Rounds ───────────────────────────────────────────────────────────────

const roundsPlayed = [];
try {
	for (;;) {
		if (args.auto) {
			if (session.status === 'lobby') {
				await wait(1000);
				console.log(`Locking rooms: ${joined.length} players`);
				await control('prepare');
			}
			await waitFor(() => session.status === 'ready', 'round to be prepared');
			// Rooms for the next stage are allotted on their own; like an organiser, take a breather before starting.
			if (session.round > 1 && args.breakSeconds > 0) {
				console.log(`  Stage ${session.round} rooms are ready (${session.roomCount}) — starting in ${args.breakSeconds} s`);
				await wait(args.breakSeconds * 1000);
				if (session.status !== 'ready') problem(`stage ${session.round} started without the organiser`);
			}
			await control('start');
		} else console.log('Waiting for the organiser to lock rooms and start…');
		await waitFor(() => session.status === 'playing', 'the round to start');
		const round = session.round;
		const final = session.final;
		const ending = args.auto && args.seconds ? wait(args.seconds * 1000).then(() => (session.round === round && session.status === 'playing' ? control('end', { round }) : undefined)) : Promise.resolve();
		await playRound(round);
		await ending;
		// Results, or (with no ties to decide) the next stage's rooms already allotted.
		await waitFor(() => (['review', 'finished'].includes(session.status) && session.round === round) || session.round > round, 'results');
		roundsPlayed.push(round);
		if (session.openTies) {
			console.log(`  ${session.openTies} tie(s) at the cutoff`);
			if (args.auto) {
				// Results are saved straight away when a round ends.
				const r = (await getDoc(doc(db, 'liveSessions', code, 'rounds', String(round)))).data();
				for (const room of r.rooms) for (const [i, t] of room.ties.entries()) if (!t.resolved) await control('resolve-tie', { roomId: room.roomId, tieIndex: i, picks: t.candidates.slice(0, t.slots) });
			}
			await waitFor(() => session.openTies === 0, 'tie decisions');
		}
		if (final || session.status === 'finished') break;
		if (args.auto) await control('next-round', { round });
		else console.log('Waiting for the organiser to prepare the next round…');
		await waitFor(() => session.round === round + 1 && session.status === 'ready', 'next round');
	}
} catch (err) {
	problem(`stopped: ${err.message}`);
}
finished = true;

// ── Checks (against what the server saved to Firestore) ──────────────────

console.log('\nChecking the saved results…');
await wait(2_500); // one save interval
const roundDocs = (await getDocs(collection(db, 'liveSessions', code, 'rounds'))).docs.map((d) => d.data()).sort((a, b) => a.round - b.round);
const boardDocs = new Map((await getDocs(collection(db, 'liveSessions', code, 'boards'))).docs.map((d) => [d.id, d.data()]));
if (roundDocs.length !== roundsPlayed.length) problem(`${roundsPlayed.length} rounds played but ${roundDocs.length} saved`);
const byId = new Map(joined.map((b) => [b.id, b]));
for (const r of roundDocs) {
	const players = r.rooms.flatMap((room) => room.ranking.map((e) => e.playerId));
	if (new Set(players).size !== players.length) problem(`round ${r.round}: a player is in two rooms`);
	const sizes = r.rooms.map((room) => room.ranking.length).sort((a, b) => b - a);
	// Rooms hold at most 12, sizes differ by at most one, and the final is a single room.
	if (sizes[0] > 12 || sizes[0] - sizes[sizes.length - 1] > 1) problem(`round ${r.round}: uneven or oversized rooms ${sizes.join(',')}`);
	if (r.final && sizes.length !== 1) problem(`round ${r.round}: the final has ${sizes.length} rooms`);
	for (const room of r.rooms) {
		const b = boardDocs.get(room.roomId);
		if (!b) {
			problem(`round ${r.round} room ${room.number}: board not saved`);
			continue;
		}
		const fromWords = scoresFromWords(b);
		for (const [id, p] of Object.entries(b.players)) if (!p.removed && p.score !== fromWords[id]) problem(`round ${r.round} room ${room.number}: ${p.name} score ${p.score} ≠ letters held ${fromWords[id]}`);
		const texts = Object.values(b.words).map((w) => w.text);
		if (new Set(texts).size !== texts.length) problem(`round ${r.round} room ${room.number}: duplicate word on the board`);
		const want = Math.min(r.places ?? (r.final ? 3 : 2), room.ranking.length);
		if (room.advancing.length !== want) problem(`round ${r.round} room ${room.number}: ${room.advancing.length} advancing, expected ${want}`);
		for (const e of room.ranking) if (b.players[e.playerId] && b.players[e.playerId].score !== e.score) problem(`round ${r.round}: saved ranking differs from the board for ${e.name}`);

		// Avatars: one each, all different in the room; colours (seats) all different too.
		const seated = Object.entries(b.players);
		const avatars = seated.map(([, p]) => p.avatar);
		if (avatars.some((a) => !Number.isInteger(a) || a < 0 || a >= AVATAR_COUNT)) problem(`round ${r.round} room ${room.number}: a player has no valid avatar`);
		if (new Set(avatars).size !== avatars.length) problem(`round ${r.round} room ${room.number}: two players share an avatar`);
		const seats = seated.map(([, p]) => p.seat).sort((x, y) => x - y);
		if (seats.join() !== seated.map((_, i) => i).join()) problem(`round ${r.round} room ${room.number}: seats (colours) are not 0…${seated.length - 1}`);
		// Everyone who asked for an avatar nobody else in the room wanted first got it.
		const firstAsked = new Set();
		for (const [id, p] of seated.sort(([, x], [, y]) => x.seat - y.seat)) {
			const wanted = byId.get(id)?.avatar;
			if (wanted === undefined || wanted < 0 || wanted >= AVATAR_COUNT) continue;
			if (!firstAsked.has(wanted)) {
				firstAsked.add(wanted);
				if (p.avatar !== wanted) problem(`round ${r.round} room ${room.number}: ${p.name} asked for avatar ${wanted} first but got ${p.avatar}`);
			}
			if (p.avatar === wanted) avatarStats.kept++;
			else avatarStats.moved++;
		}
		avatarStats.rooms++;
	}
	const adv = r.rooms.reduce((n, room) => n + room.advancing.length, 0);
	console.log(`  Round ${r.round}${r.final ? ' (final)' : ''}: ${players.length} players, ${r.rooms.length} rooms, ${adv} ${r.final ? 'on the podium' : 'advanced'} ✓`);
}
const saved = (await getDoc(doc(db, 'liveSessions', code))).data();
if (session.status === 'finished') console.log(`  Podium: ${session.podium.map((p) => `${p.rank}. ${p.name} (${p.score})`).join(' · ')}`);
else problem(`tournament ended in status "${session.status}", not finished`);
if (saved?.status !== session.status) problem(`saved status "${saved?.status}" ≠ live status "${session.status}"`);

console.log(`  Avatars: ${avatarStats.rooms} rooms, all different in each · ${avatarStats.kept} got the one they picked, ${avatarStats.moved} moved to a free one (a clash or a bad pick)`);
if (!avatarStats.moved) problem('no avatar clashes were settled — the test should have forced some');

console.log(`\nMoves: ${stats.moves} sent, ${stats.ok} accepted, ${stats.timeouts} without an answer`);
console.log(`Verdict round trip: p50 ${percentile(stats.rtt, 50)} ms · p95 ${percentile(stats.rtt, 95)} ms · max ${Math.max(0, ...stats.rtt)} ms`);
console.log(`Seen by room-mates: p50 ${percentile(stats.spread, 50)} ms · p95 ${percentile(stats.spread, 95)} ms`);
console.log(`Dropped connections: ${stats.drops} · server errors: ${JSON.stringify(stats.errors)}`);
const top = Object.entries(stats.rejected).sort((a, b) => b[1] - a[1]).slice(0, 6);
if (top.length) console.log(`Rejections (expected for bad/racing moves): ${top.map(([m, n]) => `${n}× "${m}"`).join(', ')}`);
if (stats.timeouts) problem(`${stats.timeouts} moves got no answer within 10 s`);
console.log(problems.length ? `\n❌ ${problems.length} problem(s)` : '\n✅ No problems');

for (const b of bots) b.ws?.close();
adminWs.close();
await terminate(db);
process.exit(problems.length ? 1 : 0);
