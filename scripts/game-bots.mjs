// Tech Word Rush load test: up to 300 simulated phones play a real game
// while you run it from the admin board.
//
//   npm run game:bots -- <GAME CODE> [--bots 200] [--url http://localhost:5173]
//
// 1. Admin → Games → Tech Word Rush → create a game. Keep the admin board open.
// 2. Run this with the game code (e.g. ZC7K42). Bots join the lobby.
// 3. Drive the game from the admin board as usual: start, reveal, next, finish.
//    Bots react to the same live session doc the phones listen to.
// 4. When you finish the game, the script checks every bot's score against
//    the leaderboard, then each bot taps "Back to ZenCode" (the registration
//    page) and closes its tab. The script exits with a report.
//
// Stop early with Ctrl+C. Bot names start with "Bot " so they are easy to spot.

import { initializeApp } from 'firebase/app';
import { doc, getFirestore, onSnapshot, terminate } from 'firebase/firestore';
import { FREE_HINTS, MAX_GUESSES, PAID_HINT_COST, rewardAfter } from '../src/lib/games/tech-word-rush/engine.ts';
import { DEFAULT_QUESTIONS } from '../src/lib/games/tech-word-rush/questions.ts';
import { SESSIONS } from '../src/lib/games/tech-word-rush/types.ts';

const NAMES = [
	'Aarav', 'Aditi', 'Akira', 'Amir', 'Aria', 'Arjun', 'Bella', 'Carlos', 'Devi', 'Elias', 'Fatima', 'Hana',
	'Isha', 'Jaya', 'Kavi', 'Leo', 'Luna', 'Maya', 'Neel', 'Oscar', 'Priya', 'Quinn', 'Ravi', 'Sara',
	'Tara', 'Uma', 'Vivek', 'Yuki', 'Zara', 'Kenji', 'Leela', 'Mira', 'Nikhil', 'Rohan', 'Tanvi', 'Wren'
];
// Plausible wrong answers for bots that don't know the word.
const NOISE = ['PYTHON', 'KERNEL', 'DOCKER', 'ROUTER', 'BINARY', 'CACHE', 'THREAD', 'SCHEMA', 'PACKET', 'LAMBDA', 'MUTEX', 'TOKEN', 'PIXEL', 'SOCKET', 'BUFFER', 'MODEM'];
const BANK = [...new Set(DEFAULT_QUESTIONS.map((q) => q.word))];

/**
 * How each bot plays. `know` = chance it works the word out from the clue
 * (it still only guesses words that fit the letters on screen).
 */
const PERSONAS = [
	{ kind: 'sharp', share: 0.3, know: 0.85, hints: [0, 1], guesses: 1 },
	{ kind: 'average', share: 0.35, know: 0.5, hints: [0, 2], guesses: 2 },
	{ kind: 'hinter', share: 0.15, know: 0.6, hints: [2, 4], guesses: 3 },
	{ kind: 'wild', share: 0.1, know: 0.1, hints: [0, 0], guesses: 3 },
	{ kind: 'skipper', share: 0.05, know: 0, hints: [0, 1], guesses: 0 },
	{ kind: 'idle', share: 0.05, know: 0, hints: [0, 0], guesses: 0 }
];

// ── Args and config ──────────────────────────────────────────────────────

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
if (!/^ZC[A-Z2-9]{4}$/.test(code) || !(BOTS >= 1 && BOTS <= 300)) {
	console.error('Usage: npm run game:bots -- <GAME CODE> [--bots 1-300] [--url http://localhost:5173]');
	console.error('Example: npm run game:bots -- ZC7K42 --bots 200');
	process.exit(1);
}
if (!process.env.VITE_FIREBASE_API_KEY || !process.env.VITE_FIREBASE_PROJECT_ID) {
	console.error('Missing VITE_FIREBASE_* variables. Run through `npm run game:bots` so .env is loaded.');
	process.exit(1);
}

const API = `${BASE}/api/games/tech-word-rush/sessions/${code}`;

// ── Helpers ──────────────────────────────────────────────────────────────

const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const rand = (min, max) => min + Math.floor(Math.random() * (max - min + 1));
const pick = (list) => list[Math.floor(Math.random() * list.length)];
const shuffle = (list) => [...list].sort(() => Math.random() - 0.5);

let clockOffset = 0; // server clock minus ours, like the phones' syncClock
const serverNow = () => Date.now() + clockOffset;

class HttpError extends Error {
	constructor(message, status) {
		super(message);
		this.status = status;
	}
}

async function post(path, body) {
	const res = await fetch(`${API}${path}`, {
		method: 'POST',
		headers: { 'content-type': 'application/json', accept: 'application/json' },
		body: JSON.stringify(body)
	});
	const data = await res.json().catch(() => ({}));
	if (!res.ok) throw new HttpError(data.message || `HTTP ${res.status}`, res.status);
	// Same rule as the phones: replies are stamped just before sending.
	if (typeof data.now === 'number') clockOffset = data.now - Date.now();
	return data;
}

/** Run `fn` over `items` with at most `limit` in flight. */
async function pool(items, limit, fn) {
	let next = 0;
	const worker = async () => {
		while (next < items.length) await fn(items[next++]);
	};
	await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
}

// ── Stats ────────────────────────────────────────────────────────────────

const stats = { joined: 0, joinFailed: 0, guesses: 0, hints: 0, skips: 0, rejected: 0, errors: 0, slowest: 0, totalMs: 0, calls: 0 };
const problems = [];
const problem = (msg) => {
	problems.push(msg);
	if (problems.length <= 15) console.log(`  ⚠️  ${msg}`);
};

/** Response times during the current word, for the per-word line. */
let wordLatencies = [];
const percentile = (list, p) => {
	if (!list.length) return 0;
	const sorted = [...list].sort((a, b) => a - b);
	return sorted[Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length))];
};

async function timed(fn) {
	const t = Date.now();
	try {
		return await fn();
	} finally {
		const ms = Date.now() - t;
		wordLatencies.push(ms);
		stats.calls++;
		stats.totalMs += ms;
		stats.slowest = Math.max(stats.slowest, ms);
	}
}

// ── Bots ─────────────────────────────────────────────────────────────────

function personaFor(i) {
	let x = (i * 0.618034) % 1; // spreads personas evenly instead of clumping
	for (const p of PERSONAS) {
		if ((x -= p.share) < 0) return p;
	}
	return PERSONAS[0];
}

const bots = Array.from({ length: BOTS }, (_, i) => ({
	i,
	name: `Bot ${NAMES[i % NAMES.length]} ${i + 1}`,
	persona: personaFor(i),
	id: null,
	expectedXp: 0,
	word: null, // this bot's state on the current word
	results: { correct: 0, failed: 0, skipped: 0, missed: 0 }
}));

async function joinBot(bot) {
	for (let attempt = 1; attempt <= 4; attempt++) {
		try {
			const res = await timed(() => post('/join', { name: bot.name }));
			bot.id = { playerId: res.playerId, token: res.token };
			stats.joined++;
			if (stats.joined % 25 === 0 || stats.joined === BOTS) console.log(`  ✅ ${stats.joined}/${BOTS} bots in the lobby`);
			return;
		} catch (err) {
			if (err.status === 409 && /taken/i.test(err.message)) bot.name = `Bot ${NAMES[bot.i % NAMES.length]} ${bot.i + 1}${String.fromCharCode(97 + attempt)}`;
			else if (err.status && err.status < 500) break; // 404 / 410 / full: retrying won't help
			await wait(500 * attempt);
			if (attempt === 4) bot.lastError = err.message;
			else continue;
		}
	}
	stats.joinFailed++;
	problem(`${bot.name} could not join: ${bot.lastError ?? 'rejected'}`);
}

/** Words from the bank that fit what's on screen: length, first/last letter, revealed letters. */
function candidates(q, revealed) {
	return BANK.filter(
		(w) =>
			w.length === q.length &&
			w[0] === q.first &&
			w[w.length - 1] === q.last &&
			Object.entries(revealed).every(([pos, ch]) => w[Number(pos)] === ch)
	);
}

async function act(bot, body) {
	try {
		const v = await timed(() => post('/play', { ...bot.id, ...body }));
		if (v.rejected) {
			stats.rejected++;
			// Bots only answer inside the timer, so a refused answer or skip is a bug.
			// (Hints can be refused fairly: out of letters or not enough XP.)
			if (body.action !== 'hint') problem(`${bot.name} ${body.action} refused: "${v.rejected}"`);
		}
		return v;
	} catch (err) {
		stats.errors++;
		problem(`${bot.name} ${body.action} failed: ${err.message}`);
		return null;
	}
}

/** One bot's turn on one word, finished before the timer runs out. */
async function playWord(bot, q, deadline) {
	const p = bot.persona;
	const w = (bot.word = { index: q.index, hintsUsed: 0, guesses: [], skipped: false, hintCost: 0 });
	const timeLeft = () => deadline - serverNow() - 1500;

	// Everyone hits the server together, like a room that already knows the word.
	await wait(rand(100, 1000));
	if (p.kind === 'idle' || timeLeft() <= 0) return;

	if (p.kind === 'skipper') {
		const v = await act(bot, { action: 'skip' });
		if (v?.result === 'skipped') {
			w.skipped = true;
			w.doneAt = Date.now();
			stats.skips++;
		}
		return;
	}

	let revealed = {};
	const hints = rand(p.hints[0], p.hints[1]);
	for (let h = 0; h < hints && timeLeft() > 0; h++) {
		const v = await act(bot, { action: 'hint', expect: w.hintsUsed });
		if (v?.result !== 'hint') break; // out of letters or not enough XP
		w.hintCost += w.hintsUsed >= FREE_HINTS ? PAID_HINT_COST : 0;
		w.hintsUsed++;
		stats.hints++;
		revealed = v.q.revealed;
		await wait(rand(50, 250));
	}

	const fits = shuffle(candidates(q, revealed));
	const knows = Math.random() < p.know;
	const tries = [];
	for (const word of fits) if (knows || Math.random() < 0.5) tries.push(word);
	while (tries.length < p.guesses) tries.push(pick(NOISE));

	for (const text of [...new Set(tries)].slice(0, Math.min(p.guesses, MAX_GUESSES))) {
		if (timeLeft() <= 0) break;
		const v = await act(bot, { action: 'answer', answer: text, expect: w.guesses.length });
		if (v?.result !== 'guess') break;
		// judgedAt = the server's clock when it checked the timer (saving can take longer).
		const judged = v.judgedAt ?? v.now;
		if (judged > deadline) problem(`${bot.name}: server accepted an answer ${((judged - deadline) / 1000).toFixed(1)}s after the timer ended. Is ${BASE} running the latest code?`);
		w.guesses.push({ text, reward: rewardAfter(w.hintsUsed) });
		w.doneAt ??= Date.now(); // first answer = "answered" on the presenter
		stats.guesses++;
		await wait(rand(50, 300));
	}
}

/** After the reveal: the phone's view must match what the rules say this bot earned. */
async function checkReveal(bot, index, answer) {
	const w = bot.word?.index === index ? bot.word : null; // null = sat this word out
	const hit = w?.guesses.find((g) => g.text === answer);
	const status = !w ? 'missed' : w.skipped ? 'skipped' : hit ? 'correct' : w.guesses.length ? 'failed' : 'missed';
	bot.results[status]++;
	bot.expectedXp += (hit?.reward ?? 0) - (w?.hintCost ?? 0);

	await wait(rand(0, 3000)); // phones don't all ask at once
	const v = await act(bot, { action: 'state' });
	// The host may already have started the next word; the reply then describes
	// that word (and any hint spent on it), so there is nothing to compare.
	if (v?.q && v.q.index !== index) return;
	if (v && v.q && v.q.status !== status) problem(`${bot.name}: expected "${status}" on word ${index + 1}, server said "${v.q.status}"`);
	if (v && v.xp !== bot.expectedXp) problem(`${bot.name}: expected ${bot.expectedXp} XP after word ${index + 1}, server said ${v.xp}`);
	if (v) bot.expectedXp = v.xp; // re-sync so one slip isn't reported every word
}

// ── Session ──────────────────────────────────────────────────────────────

const app = initializeApp({
	apiKey: process.env.VITE_FIREBASE_API_KEY,
	authDomain: process.env.VITE_FIREBASE_AUTH_DOMAIN,
	projectId: process.env.VITE_FIREBASE_PROJECT_ID,
	storageBucket: process.env.VITE_FIREBASE_STORAGE_BUCKET,
	messagingSenderId: process.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
	appId: process.env.VITE_FIREBASE_APP_ID
});
const db = getFirestore(app);

const startedAt = Date.now();
let session = null;
let joinedPhase = false;
let playedIndex = -1;
let revealedIndex = -1;
let finishing = false;
const inFlight = new Set();
/** XP is paid out just after the reveal; resolves once the server says it's done. */
const ranked = async () => {
	for (let t = 0; session?.ranking && t < 120; t++) await wait(500);
};
const track = (p) => {
	inFlight.add(p);
	p.finally(() => inFlight.delete(p));
	return p;
};

console.log(`
  🎮 Tech Word Rush: ${BOTS} bots
  Game  ${code}
  Site  ${BASE}
`);

function onSession(s) {
	const prev = session;
	session = s;
	const live = bots.filter((b) => b.id);

	if (prev?.status !== s.status || prev?.questionIndex !== s.questionIndex) {
		console.log(`  ▶  ${s.status}${s.questionIndex >= 0 ? `  word ${s.questionIndex + 1}/${s.totalQuestions}` : ''}  (players on board: ${s.playerCount})`);
	}

	if (s.status === 'question' && s.current && s.questionIndex !== playedIndex && joinedPhase) {
		playedIndex = s.questionIndex;
		const t0 = Date.now();
		const index = s.questionIndex;
		wordLatencies = [];
		track(
			Promise.all(live.map((b) => playWord(b, s.current, s.timerEndsAt))).then(() => {
				const done = live.filter((b) => b.word?.index === index && b.word.doneAt).map((b) => b.word.doneAt - t0);
				const acting = live.filter((b) => b.persona.kind !== 'idle').length;
				const slowest = done.length ? (Math.max(...done) / 1000).toFixed(1) : '-';
				console.log(
					`  ⏱  word ${index + 1}: ${done.length}/${acting} bots answered, all within ${slowest}s of the word starting · server replies p50 ${percentile(wordLatencies, 50)} ms, p95 ${percentile(wordLatencies, 95)} ms`
				);
			})
		);
	}

	if ((s.status === 'result' || s.status === 'finished') && s.answer && s.questionIndex !== revealedIndex && s.questionIndex === playedIndex) {
		revealedIndex = s.questionIndex;
		const answer = s.answer;
		const index = s.questionIndex;
		track(
			Promise.all([...inFlight]).then(async () => {
				await ranked();
				await Promise.all(live.map((b) => checkReveal(b, index, answer)));
				const right = live.filter((b) => b.word?.index === index && b.word.guesses.some((g) => g.text === answer)).length;
				console.log(`  ✔  word ${index + 1} was ${answer}: ${right}/${live.length} bots got it`);
			})
		);
	}

	if (s.status === 'finished' && !s.ranking && !finishing) {
		finishing = true;
		track(wait(500)).then(() => Promise.all([...inFlight])).then(() => finish(s));
	}
}

/** Final leaderboard checks, then every bot goes back to the registration page and closes. */
async function finish(s) {
	const live = bots.filter((b) => b.id);
	const board = new Map(s.leaderboard.map((e) => [e.id, e]));
	console.log('\n  🏁 Game finished. Checking the final leaderboard…');

	const missing = live.filter((b) => !board.has(b.id.playerId));
	if (missing.length) problem(`${missing.length} bots are missing from the final leaderboard (e.g. ${missing[0].name})`);
	for (const b of live) {
		const e = board.get(b.id.playerId);
		if (e && e.xp !== b.expectedXp) problem(`${b.name}: leaderboard shows ${e.xp} XP, expected ${b.expectedXp}`);
	}
	for (let i = 1; i < s.leaderboard.length; i++) {
		const [a, b] = [s.leaderboard[i - 1], s.leaderboard[i]];
		if (b.xp > a.xp || (b.xp === a.xp && b.rank !== a.rank) || (b.xp < a.xp && b.rank !== i + 1)) {
			problem(`Leaderboard order is wrong at position ${i + 1} (${b.name})`);
			break;
		}
	}
	if (s.leaderboard[0] && s.winner?.name !== s.leaderboard[0].name) problem(`Winner is "${s.winner?.name}" but #1 on the board is "${s.leaderboard[0].name}"`);

	// "Back to ZenCode" on the finished screen links to "/", the registration page.
	console.log('  🚪 Bots tapping "Back to ZenCode" and closing their tabs…');
	let landed = 0;
	await pool(live, 25, async (b) => {
		try {
			const res = await fetch(`${BASE}/`, { headers: { accept: 'text/html' } });
			const html = await res.text();
			if (res.ok && /<html/i.test(html)) landed++;
			else problem(`${b.name}: registration page answered ${res.status}`);
		} catch (err) {
			problem(`${b.name}: could not open the registration page (${err.message})`);
		}
		b.id = null; // tab closed: identity dropped, like closing the browser tab
	});

	report(s, landed);
	await terminate(db);
	process.exit(problems.length ? 1 : 0);
}

function report(s, landed) {
	const sum = (k) => bots.reduce((n, b) => n + b.results[k], 0);
	const ours = new Set(bots.map((b) => b.name));
	const top = s.leaderboard.slice(0, 5).map((e) => `     #${e.rank}  ${e.name.padEnd(20)} ${e.xp} XP${ours.has(e.name) ? '' : '  (not a bot)'}`);
	const mins = ((Date.now() - startedAt) / 60000).toFixed(1);
	console.log(`
  ──────────────── Report ────────────────
  Bots joined          ${stats.joined}/${BOTS}${stats.joinFailed ? `  (${stats.joinFailed} failed)` : ''}
  Words played         ${s.questionIndex + 1}/${s.totalQuestions}
  Guesses / hints      ${stats.guesses} / ${stats.hints}
  Skips                ${stats.skips}
  Results              ✅ ${sum('correct')} correct  ❌ ${sum('failed')} wrong  ⏭ ${sum('skipped')} skipped  💤 ${sum('missed')} missed
  Server replies       ${stats.calls} calls, avg ${stats.calls ? Math.round(stats.totalMs / stats.calls) : 0} ms, slowest ${stats.slowest} ms
  Request errors       ${stats.errors}
  Refused by server    ${stats.rejected}
  Back on registration ${landed}/${stats.joined} (tabs closed)
  Duration             ${mins} min

  Top 5
${top.join('\n') || '     (empty)'}

  ${problems.length ? `❌ ${problems.length} problem(s) found:\n${problems.map((p) => `     - ${p}`).join('\n')}` : '✅ Everything matched: scores, statuses, ranking and winner.'}
`);
}

// ── Main ─────────────────────────────────────────────────────────────────
process.on('SIGINT', async () => {
	console.log(`\n  🛑 Stopped. ${stats.joined} bots joined, ${stats.guesses} guesses sent.`);
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
		(err) => reject(err)
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
if (session.status !== 'lobby') console.log('  ℹ️  The game has already started. Bots will join the next word.');

console.log(`  📡 Joining ${BOTS} bots…`);
const joinStart = Date.now();
await pool(bots, BOTS, joinBot); // all at once
console.log(`  ⏱  joins took ${((Date.now() - joinStart) / 1000).toFixed(1)}s`);
joinedPhase = true;
console.log(
	stats.joined
		? `\n  👉 ${stats.joined} bots are waiting. Start the game from the admin board.\n`
		: '\n  ❌ No bots could join. Is the site running at that URL?\n'
);
if (!stats.joined) process.exit(1);
if (session) onSession(session); // already mid-question → jump in
