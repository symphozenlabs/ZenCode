// Simulated phones for rehearsing a live session before deployment.
//
//   npm run live:bots -- <join code> [--players 8] [--url http://localhost:5173]
//
// Each bot joins with a nickname and avatar, then answers every open slide
// after a short random delay (quiz answers are random, so scores vary).
// Stop with Ctrl+C; bots exit on their own when the host ends the session.

const AVATARS = ['fox', 'panda', 'owl', 'frog', 'tiger', 'koala', 'octopus', 'penguin', 'unicorn', 'turtle', 'bee', 'lion', 'whale', 'monkey', 'hedgehog', 'cat'];
const NAMES = ['Ada', 'Linus', 'Grace', 'Alan', 'Margaret', 'Dennis', 'Barbara', 'Ken', 'Radia', 'Guido', 'Hedy', 'Tim', 'Katherine', 'Bjarne', 'Frances', 'Vint'];
const WORDS = ['caffeine', 'teamwork', 'chaos', 'learning', 'pizza', 'bugs', 'deploy', 'ideas', 'sleepless', 'fun'];
const SENTENCES = ['A farm sensor dashboard', 'An app that reminds me to drink water', 'A bot that writes my commit messages', 'Something with drones'];

function parseArgs(argv) {
	const args = { code: '', players: 8, url: 'http://localhost:5173' };
	for (let i = 0; i < argv.length; i++) {
		const a = argv[i];
		if (a === '--players' || a === '-n') args.players = Number(argv[++i]);
		else if (a === '--url') args.url = argv[++i];
		else if (!a.startsWith('-')) args.code = a.replace(/\s+/g, '');
	}
	return args;
}

const { code, players, url } = parseArgs(process.argv.slice(2));
if (!/^\d{6}$/.test(code) || !(players >= 1 && players <= 200)) {
	console.error('Usage: npm run live:bots -- <6-digit join code> [--players 1-200] [--url http://localhost:5173]');
	process.exit(1);
}
const socketUrl = `${url.replace(/^http/, 'ws').replace(/\/$/, '')}/live`;

const pick = (list) => list[Math.floor(Math.random() * list.length)];
const shuffle = (list) => [...list].sort(() => Math.random() - 0.5);

/** A random but valid answer for a public slide. */
function answerFor(slide) {
	switch (slide.input) {
		case 'tap': {
			const ids = slide.options.map((o) => o.id);
			return { input: 'tap', ids: slide.multi ? shuffle(ids).slice(0, 1 + Math.floor(Math.random() * 2)) : [pick(ids)] };
		}
		case 'text':
			return { input: 'text', texts: slide.long ? [pick(SENTENCES)] : shuffle(WORDS).slice(0, slide.maxEntries) };
		case 'number':
			return {
				input: 'number',
				values: slide.numbers.map((n) => {
					const steps = Math.floor((n.max - n.min) / n.step);
					return Math.min(n.max, n.min + Math.round(Math.random() * steps) * n.step);
				})
			};
		case 'order':
			return { input: 'order', ids: shuffle(slide.options.map((o) => o.id)) };
		default:
			return null;
	}
}

let answers = 0;
let open = 0;
const bots = [];

function startBot(i) {
	const nickname = `${NAMES[i % NAMES.length]}${i >= NAMES.length ? ` ${Math.floor(i / NAMES.length) + 1}` : ''} (bot)`;
	const avatar = AVATARS[i % AVATARS.length];
	const answered = new Set();
	const ws = new WebSocket(socketUrl);
	bots.push(ws);

	const send = (msg) => ws.readyState === WebSocket.OPEN && ws.send(JSON.stringify(msg));

	function onSlide(state) {
		const slide = state?.slide;
		if (!slide || state.view !== 'slide' || state.phase !== 'open' || state.answered || answered.has(slide.id)) return;
		const value = answerFor(slide);
		if (!value) return;
		answered.add(slide.id);
		// Answer within the first part of the timer so most bots beat the clock.
		const window = slide.timeLimit ? Math.min(slide.timeLimit * 600, 8000) : 4000;
		setTimeout(() => send({ t: 'submit_response', slideId: slide.id, value }), 500 + Math.random() * window);
	}

	ws.addEventListener('open', () => send({ t: 'join', code, nickname, avatar }));
	ws.addEventListener('message', (e) => {
		const msg = JSON.parse(String(e.data));
		switch (msg.t) {
			case 'welcome_player':
				open++;
				console.log(`+ ${nickname} joined (${open}/${players})`);
				return onSlide(msg.state.slide);
			case 'player_state':
				return onSlide(msg.state);
			case 'response_ack':
				answers++;
				return;
			case 'session_ended':
				console.log(`- ${nickname}: session ended`);
				return ws.close();
			case 'error':
				console.warn(`! ${nickname}: ${msg.code} — ${msg.message}`);
				if (['not_found', 'session_closed', 'nickname_invalid', 'nickname_taken'].includes(msg.code)) ws.close();
		}
	});
	ws.addEventListener('close', () => {
		bots.splice(bots.indexOf(ws), 1);
		if (!bots.length) {
			console.log(`All bots disconnected. ${answers} answers accepted.`);
			process.exit(0);
		}
	});
	ws.addEventListener('error', () => console.warn(`! ${nickname}: could not connect to ${socketUrl}`));
}

console.log(`Joining ${players} bot(s) to ${code} via ${socketUrl}`);
for (let i = 0; i < players; i++) setTimeout(() => startBot(i), i * 150);

setInterval(() => answers && console.log(`  ${answers} answers accepted so far`), 15_000).unref();
process.on('SIGINT', () => {
	console.log(`\nStopping. ${answers} answers accepted.`);
	for (const ws of bots) ws.close();
	process.exit(0);
});
