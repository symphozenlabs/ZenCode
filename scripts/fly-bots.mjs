// Flappy Bird / Symba Ride load test: up to 300 simulated phones fly during a
// real game while you run it from the admin board.
//
//   npm run fly:bots -- <GAME CODE> [--bots 200] [--url http://localhost:5173]
//
// 1. Admin → Games → Flappy Bird or Symba Ride → create a game (code ZF… / ZS…).
// 2. Run this with the code. Bots join the lobby.
// 3. Start the game from the presenter. Each bot flies again and again until
//    time is up: start a flight, fly 2–10 s, land with a score the server's
//    speed cap allows. Only the best flight counts, like real players.
// 4. When the game finishes, the script checks that every bot's leaderboard
//    score is its best saved flight and its flight count matches, then each
//    bot taps "Back to ZenCode" (the registration page) and leaves.

import { initializeApp } from 'firebase/app';
import { doc, getFirestore, onSnapshot, terminate } from 'firebase/firestore';
import { maxScore } from '../src/lib/games/flappy/engine.ts';
import { SESSIONS } from '../src/lib/games/tech-word-rush/types.ts';

const NAMES = [
	'Aarav', 'Aditi', 'Akira', 'Amir', 'Aria', 'Arjun', 'Bella', 'Carlos', 'Devi', 'Elias', 'Fatima', 'Hana',
	'Isha', 'Jaya', 'Kavi', 'Leo', 'Luna', 'Maya', 'Neel', 'Oscar', 'Priya', 'Quinn', 'Ravi', 'Sara',
	'Tara', 'Uma', 'Vivek', 'Yuki', 'Zara', 'Kenji', 'Leela', 'Mira', 'Nikhil', 'Rohan', 'Tanvi', 'Wren'
];

function parseArgs(argv) {
	const args = { code: '', bots: 200, url: 'http://localhost:5173' };
	for (let i = 0; i < argv.length; i++) {
		const a = argv[i];
		if (a === '--bots' || a === '-n') args.bots = Number(argv[++i]);
		else if (a === '--url') args.url = argv[++i];
		else if (!a.startsWith('-')) args.code = a.trim().toUpperCase().replace(/\s+/g, '');
	}
	return args;
}

const { code, bots: BOTS, url } = parseArgs(process.argv.slice(2));
const BASE = url.replace(/\/+$/, '');
if (!/^Z[FS][A-Z2-9]{4}$/.test(code) || !(BOTS >= 1 && BOTS <= 300)) {
	console.error('Usage: npm run fly:bots -- <GAME CODE ZF…/ZS…> [--bots 1-300] [--url http://localhost:5173]');
	process.exit(1);
}
if (!process.env.VITE_FIREBASE_API_KEY || !process.env.VITE_FIREBASE_PROJECT_ID) {
	console.error('Missing VITE_FIREBASE_* variables. Run through `npm run fly:bots` so .env is loaded.');
	process.exit(1);
}

const API = `${BASE}/api/games/flappy/sessions/${code}`;
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const rand = (min, max) => min + Math.floor(Math.random() * (max - min + 1));

let clockOffset = 0;
const serverNow = () => Date.now() + clockOffset;

class HttpError extends Error {
	constructor(message, status) {
		super(message);
		this.status = status;
	}
}

const latencies = [];
async function post(path, body) {
	const t = Date.now();
	const res = await fetch(`${API}${path}`, {
		method: 'POST',
		headers: { 'content-type': 'application/json', accept: 'application/json' },
		body: JSON.stringify(body)
	});
	const data = await res.json().catch(() => ({}));
	latencies.push(Date.now() - t);
	if (!res.ok) throw new HttpError(data.message || `HTTP ${res.status}`, res.status);
	if (typeof data.now === 'number') clockOffset = data.now - Date.now();
	return data;
}

const percentile = (list, p) => {
	if (!list.length) return 0;
	const sorted = [...list].sort((a, b) => a - b);
	return sorted[Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length))];
};

async function pool(items, limit, fn) {
	let next = 0;
	const worker = async () => {
		while (next < items.length) await fn(items[next++]);
	};
	await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
}

const stats = { joined: 0, started: 0, saved: 0, refused: 0, errors: 0 };
const problems = [];
const problem = (msg) => {
	problems.push(msg);
	if (problems.length <= 15) console.log(`  ⚠️  ${msg}`);
};

const bots = Array.from({ length: BOTS }, (_, i) => ({
	i,
	name: `Bot ${NAMES[i % NAMES.length]} ${i + 1}`,
	id: null,
	flights: 0, // flights the server accepted a start for (= its `rounds`)
	best: 0, // best saved flight (what the leaderboard must show)
	firstFlightAt: null
}));

async function joinBot(bot) {
	try {
		const res = await post('/join', { name: bot.name });
		bot.id = { playerId: res.playerId, token: res.token };
		stats.joined++;
		if (stats.joined % 50 === 0 || stats.joined === BOTS) console.log(`  ✅ ${stats.joined}/${BOTS} bots in the lobby`);
	} catch (err) {
		problem(`${bot.name} could not join: ${err.message}`);
	}
}

async function act(bot, body) {
	try {
		return await post('/play', { ...bot.id, ...body });
	} catch (err) {
		stats.errors++;
		problem(`${bot.name} ${body.action} failed: ${err.message}`);
		return null;
	}
}

/** Fly until time is up. A flight started in time may land up to the server's grace after. */
async function fly(bot, endsAt, t0) {
	await wait(rand(0, 1500)); // phones tap "fly" at slightly different moments
	while (serverNow() < endsAt - 1500) {
		const start = await act(bot, { action: 'start' });
		if (!start) return;
		if (start.rejected) {
			stats.refused++;
			problem(`${bot.name}: flight start refused with time left: "${start.rejected}"`);
			return;
		}
		bot.flights++;
		stats.started++;
		bot.firstFlightAt ??= Date.now() - t0;
		const startedAt = Date.now();
		// Land by time-up: the server's 4 s allowance after it is for the reply's trip, not for flying on.
		await wait(Math.max(500, Math.min(rand(2000, 10000), endsAt - serverNow())));
		// A believable score: at most what the bird could reach in that time.
		const flownMs = Date.now() - startedAt;
		const score = Math.floor(maxScore(flownMs) * (0.3 + Math.random() * 0.7));
		const end = await act(bot, { action: 'end', round: start.round, score });
		if (!end) return;
		if (end.rejected) {
			stats.refused++;
			problem(`${bot.name}: landing refused: "${end.rejected}"`);
		} else {
			if (end.saved !== score) problem(`${bot.name}: sent ${score}, server saved ${end.saved}`);
			bot.best = Math.max(bot.best, end.saved);
			stats.saved++;
		}
		await wait(rand(300, 1500)); // "fly again"
	}
}

// ── Session ──────────────────────────────────────────────────────────────

const app = initializeApp({
	apiKey: process.env.VITE_FIREBASE_API_KEY,
	authDomain: process.env.VITE_FIREBASE_AUTH_DOMAIN,
	projectId: process.env.VITE_FIREBASE_PROJECT_ID,
	appId: process.env.VITE_FIREBASE_APP_ID
});
const db = getFirestore(app);

let session = null;
let joinedPhase = false;
let flying = null;
let finishing = false;

console.log(`\n  🐦 Fly game: ${BOTS} bots\n  Game  ${code}\n  Site  ${BASE}\n`);

function onSession(s) {
	const prev = session;
	session = s;
	if (prev?.status !== s.status) console.log(`  ▶  ${s.status}`);
	if (s.status === 'playing' && joinedPhase && !flying) {
		const t0 = Date.now();
		const live = bots.filter((b) => b.id);
		flying = Promise.all(live.map((b) => fly(b, s.timerEndsAt, t0))).then(() => {
			const flew = live.filter((b) => b.flights > 0);
			const firsts = flew.map((b) => b.firstFlightAt);
			console.log(
				`  ⏱  ${flew.length}/${live.length} bots flew · ${stats.started} flights, ${stats.saved} landed · first flight of every bot within ${(Math.max(0, ...firsts) / 1000).toFixed(1)}s · replies p50 ${percentile(latencies, 50)} ms, p95 ${percentile(latencies, 95)} ms`
			);
		});
	}
	if (s.status === 'finished' && !s.ranking && !finishing) {
		finishing = true;
		Promise.resolve(flying).then(() => finish(s));
	}
}

async function finish(s) {
	const live = bots.filter((b) => b.id);
	const board = new Map(s.leaderboard.map((e) => [e.id, e]));
	console.log('\n  🏁 Game finished. Checking the final leaderboard…');
	const missing = live.filter((b) => !board.has(b.id.playerId));
	if (missing.length) problem(`${missing.length} bots missing from the final leaderboard (e.g. ${missing[0].name})`);
	for (const b of live) {
		const e = board.get(b.id.playerId);
		if (!e) continue;
		if (e.score !== b.best) problem(`${b.name}: leaderboard shows ${e.score}, best flight was ${b.best}`);
		if (e.rounds !== b.flights) problem(`${b.name}: leaderboard shows ${e.rounds} flights, bot flew ${b.flights}`);
	}
	for (let i = 1; i < s.leaderboard.length; i++) {
		const [a, b] = [s.leaderboard[i - 1], s.leaderboard[i]];
		if (b.score > a.score || (b.score === a.score && b.rank !== a.rank) || (b.score < a.score && b.rank !== i + 1)) {
			problem(`Leaderboard order is wrong at position ${i + 1}`);
			break;
		}
	}
	const top = s.leaderboard[0];
	if (top && top.score > 0 && s.winner?.name !== top.name) problem(`Winner "${s.winner?.name}" is not #1 "${top.name}"`);

	let landed = 0;
	await pool(live, 25, async (b) => {
		try {
			const res = await fetch(`${BASE}/`, { headers: { accept: 'text/html' } });
			if (res.ok && /<html/i.test(await res.text())) landed++;
		} catch {
			/* counted below */
		}
		b.id = null;
	});

	console.log(`
  ──────────────── Report ────────────────
  Bots joined          ${stats.joined}/${BOTS}
  Bots that flew       ${live.filter((b) => b.flights > 0).length}/${live.length}
  Flights started      ${stats.started}
  Flights landed       ${stats.saved}
  Refused by server    ${stats.refused}
  Request errors       ${stats.errors}
  Server replies       ${latencies.length} calls, p50 ${percentile(latencies, 50)} ms, p95 ${percentile(latencies, 95)} ms, slowest ${Math.max(0, ...latencies)} ms
  Back on registration ${landed}/${live.length}
  Top 3
${s.leaderboard.slice(0, 3).map((e) => `     #${e.rank}  ${e.name.padEnd(20)} ${e.score} (${e.rounds} flights)`).join('\n') || '     (empty)'}

  ${problems.length ? `❌ ${problems.length} problem(s) found${problems.length > 15 ? ' (first 15 shown above)' : ''}` : '✅ Everything matched: best scores, flight counts, ranking and winner.'}
`);
	await terminate(db);
	process.exit(problems.length ? 1 : 0);
}

process.on('SIGINT', async () => {
	console.log(`\n  🛑 Stopped. ${stats.joined} bots joined, ${stats.started} flights.`);
	await terminate(db).catch(() => {});
	process.exit(130);
});

const ready = new Promise((resolve, reject) => {
	onSnapshot(
		doc(db, SESSIONS, code),
		(snap) => {
			if (!snap.exists()) return reject(new Error(`Game ${code} does not exist. Create it from the admin board first.`));
			onSession(snap.data());
			resolve();
		},
		reject
	);
});
try {
	await ready;
} catch (err) {
	console.error(`  ❌ ${err.message}`);
	process.exit(1);
}
if (session.status === 'finished') {
	console.error('  ❌ This game has already ended. Create a new one.');
	process.exit(1);
}

console.log(`  📡 Joining ${BOTS} bots…`);
const joinStart = Date.now();
await pool(bots, BOTS, joinBot);
console.log(`  ⏱  joins took ${((Date.now() - joinStart) / 1000).toFixed(1)}s`);
joinedPhase = true;
console.log(stats.joined ? `\n  👉 ${stats.joined} bots are waiting. Start the game from the presenter.\n` : '\n  ❌ No bots could join.\n');
if (!stats.joined) process.exit(1);
onSession(session);
