<script lang="ts">
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import { tick, untrack } from 'svelte';
	import { fade, fly, scale } from 'svelte/transition';
	import { flip } from 'svelte/animate';
	import { backOut } from 'svelte/easing';
	import { Pause, Wifi, WifiOff, Sparkles, Hourglass, Crown, Medal, DoorClosed, Delete, CornerDownLeft, X } from '@lucide/svelte';
	import { serverNow } from '$lib/games/tech-word-rush/api';
	import { CODE_RE, formatClock, type FeedEntry } from '$lib/games/word-heist/types';
	import { letterDiff, rankBoard, roundClock, takeTiles } from '$lib/games/word-heist/engine';
	import { HeistClient } from '$lib/games/word-heist/client.svelte';
	import type { BoardView } from '$lib/games/word-heist/protocol';
	import { AVATARS, AVATAR_COUNT, avatarOf, colorOf, inkOn } from '$lib/games/word-heist/avatars';
	import GameStage from '$lib/components/games/GameStage.svelte';
	import XpCounter from '$lib/components/games/XpCounter.svelte';
	import HeistStandings, { type Standing } from '$lib/components/games/HeistStandings.svelte';
	import Logo from '$lib/components/site/Logo.svelte';
	import Button from '$lib/components/ui/Button.svelte';
	import Spinner from '$lib/components/ui/Spinner.svelte';

	const code = $derived((page.params.code ?? '').toUpperCase());

	// ── Live connection (one WebSocket to the live server) ───────────────
	let client = $state<HeistClient | null>(null);
	$effect(() => {
		const c = code;
		if (!CODE_RE.test(c)) {
			client = null;
			return;
		}
		const next = new HeistClient(c, 'player');
		client = next;
		return next.start();
	});

	const session = $derived(client?.tournament ?? null);
	const noun = $derived(session?.rules.mode === 'game' ? 'game' : 'tournament');

	// When the organisers close the lobby, everyone is sent back to the home page.
	const closed = $derived(!!session?.closed);
	$effect(() => {
		if (!closed) return;
		const t = setTimeout(() => goto('/'), 3_000);
		return () => clearTimeout(t);
	});
	const me = $derived(client?.me ?? null);
	const board = $derived(client?.board ?? null);
	const identity = $derived(client?.identity ?? null);
	const loadState = $derived(!client || client.load === 'missing' ? 'missing' : client.load);
	const offline = $derived(!!client && client.status !== 'open' && client.status !== 'connecting');

	// ── Join ─────────────────────────────────────────────────────────────
	let name = $state('');
	/** In a game an avatar can be taken once; in a tournament clashes are settled per room. */
	const takenAvatars = $derived(new Set(session?.takenAvatars ?? []));
	let pickedAvatar = $state<number | null>(null);
	/** A free avatar to start with (changes only if someone takes it first). */
	let startAvatar = Math.floor(Math.random() * AVATAR_COUNT);
	const avatar = $derived.by(() => {
		if (pickedAvatar !== null && !takenAvatars.has(pickedAvatar)) return pickedAvatar;
		let a = startAvatar;
		for (let i = 0; i < AVATAR_COUNT && takenAvatars.has(a); i++) a = (a + 1) % AVATAR_COUNT;
		return a;
	});
	let joining = $state(false);
	let joinError = $state('');

	async function submitJoin(e: SubmitEvent) {
		e.preventDefault();
		if (joining || !client) return;
		if (!name.trim()) {
			joinError = 'Enter a display name.';
			return;
		}
		joining = true;
		joinError = '';
		try {
			await client.join(name, avatar);
		} catch (err) {
			joinError = (err as Error).message || 'Unable to join.';
		} finally {
			joining = false;
		}
	}

	// ── Provisional room (lobby) ─────────────────────────────────────────
	const lobbyRoom = $derived(me?.lobbyRoom ?? null);
	let shownRoom = $state<number | null>(null);
	let roomMoved = $state(false);
	$effect(() => {
		const r = lobbyRoom;
		if (r === null) return;
		if (shownRoom !== null && r !== shownRoom) {
			roomMoved = true;
			setTimeout(() => (roomMoved = false), 5000);
		}
		shownRoom = r;
	});

	const status = $derived(session?.status ?? 'lobby');
	const inRound = $derived(!!me && !!session && !!board && me.round === session.round && board.round === me.round);
	const ranking = $derived(board ? rankBoard(board) : []);
	const myEntry = $derived(identity ? (ranking.find((r) => r.playerId === identity!.playerId) ?? null) : null);

	let now = $state(serverNow());
	$effect(() => {
		const t = setInterval(() => (now = serverNow()), 250);
		return () => clearInterval(t);
	});
	const clock = $derived(board && board.status !== 'ready' ? roundClock(board.tiles, board.endsAt, board.pausedRemainingMs, now) : null);
	const timeLeft = $derived(clock?.remainingMs ?? 0);
	const live = $derived(board?.status === 'playing' && timeLeft > 0);
	/** How much of the round's tiles (or of the final countdown) is left, 0–1, for the ring. */
	const ringLeft = $derived(
		!board || !clock ? 1 : clock.finalCountdown ? Math.min(1, timeLeft / Math.max(1, board.rules.finalSeconds * 1000)) : clock.tilesLeft / Math.max(1, board.tiles.count)
	);

	// ── The table as shown ───────────────────────────────────────────────
	// Boards arrive the instant a move lands. They are applied one at a time
	// so a move can play out first (Pilfer's steal: the word's letters rise to
	// a staging row, the tiles it used fly in, the thief sweeps it away, and
	// the new word drops into the list) while the table still shows the old
	// state. Catching up after a reconnect skips the show.
	let shown = $state<BoardView | null>(null);
	let queue: BoardView[] = [];
	let draining = false;
	const reduceMotion = typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches;
	$effect(() => {
		const b = board;
		if (!b) {
			queue = [];
			shown = null;
			return;
		}
		queue.push(b);
		void drain();
	});
	async function drain() {
		if (draining) return;
		draining = true;
		try {
			while (queue.length) {
				const next = queue.shift()!;
				const prev = untrack(() => shown);
				const prevSeq = prev?.feed[0]?.seq ?? 0;
				const sameRoom = !!prev && prev.roomId === next.roomId && prev.round === next.round;
				const moves = sameRoom && !reduceMotion && queue.length < 2 ? next.feed.filter((f) => f.seq > prevSeq).sort((a, b) => a.seq - b.seq) : [];
				if (moves.length === 1) await animateMove(moves[0], prev!).catch(() => {});
				shown = next;
			}
		} finally {
			draining = false;
			clearStage();
		}
	}

	// ── Screen ───────────────────────────────────────────────────────────
	// Phones get 7 tiles to a row and the on-screen keyboard (the phone's own
	// keyboard never opens); tablets and computers get up to 14 to a row.
	let wide = $state(false);
	let touch = $state(false);
	$effect(() => {
		const w = matchMedia('(min-width: 640px)');
		const t = matchMedia('(pointer: coarse)');
		const update = () => {
			wide = w.matches;
			touch = t.matches;
		};
		update();
		w.addEventListener('change', update);
		t.addEventListener('change', update);
		return () => {
			w.removeEventListener('change', update);
			t.removeEventListener('change', update);
		};
	});

	// ── Tiles keep their place ───────────────────────────────────────────
	// 7 (or 14) to a row. A tile stays in its slot until it is used; the slot
	// is then left empty and the next tile to drop fills the first empty slot.
	// Rows are padded to a full row, and empty rows at the bottom are dropped.
	const COLS = $derived(wide ? 14 : 7);
	let slotIds = $state<(number | null)[]>([]);
	let slotsRoom = '';
	$effect(() => {
		const b = shown;
		const pool = b?.pool ?? [];
		const roomKey = b ? `${b.roomId}:${b.round}` : '';
		const current = untrack(() => (roomKey === slotsRoom ? slotIds : []));
		slotsRoom = roomKey;
		const have = new Set(pool.map((t) => t.id));
		const next: (number | null)[] = current.map((id) => (id !== null && have.has(id) ? id : null));
		const placed = new Set(next.filter((x): x is number => x !== null));
		for (const t of pool) {
			if (placed.has(t.id)) continue;
			const i = next.indexOf(null);
			if (i >= 0) next[i] = t.id;
			else next.push(t.id);
			placed.add(t.id);
		}
		let last = next.length - 1;
		while (last >= 0 && next[last] === null) last--;
		const rows = Math.max(1, Math.ceil((last + 1) / COLS));
		next.length = Math.min(next.length, rows * COLS);
		while (next.length < rows * COLS) next.push(null);
		if (next.length !== current.length || next.some((id, i) => id !== current[i])) slotIds = next;
	});
	const tileById = $derived(new Map((shown?.pool ?? []).map((t) => [t.id, t])));
	const slots = $derived(slotIds.map((id) => (id === null ? null : (tileById.get(id) ?? null))));

	// The grid always fits the space it has: tiles shrink as rows are added,
	// and only scroll once they would be too small to read.
	const GAP = $derived(wide ? 6 : 4);
	const MIN_TILE = 22;
	let gridBox = $state<{ w: number; h: number } | null>(null);
	const measureGrid = (el: HTMLElement) => {
		const ro = new ResizeObserver(([e]) => (gridBox = { w: e.contentRect.width, h: e.contentRect.height }));
		ro.observe(el);
		return () => ro.disconnect();
	};
	const gridRows = $derived(Math.max(1, Math.ceil(slotIds.length / COLS)));
	const tileSize = $derived.by(() => {
		if (!gridBox) return 36;
		const byWidth = (gridBox.w - (COLS - 1) * GAP) / COLS;
		const byHeight = (gridBox.h - (gridRows - 1) * GAP) / gridRows;
		return Math.floor(Math.max(MIN_TILE, Math.min(wide ? 60 : 50, byWidth, byHeight)));
	});
	const gridFits = $derived(!gridBox || gridRows * tileSize + (gridRows - 1) * GAP <= gridBox.h + 1);

	// ── Players: avatar, colour, points ──────────────────────────────────
	// From the live board, so points change the moment a move lands (as in
	// Pilfer), while the table below still plays the move out.
	type Seat = { id: string; name: string; score: number; avatar: string; color: string; mine: boolean };
	const seats = $derived.by<Seat[]>(() => {
		const b = board;
		if (!b) return [];
		return Object.entries(b.players)
			.map(([id, p], i) => ({ id, p, seat: p.seat ?? i }))
			.filter(({ p }) => !p.removed)
			.sort((a, b) => Number(b.id === identity?.playerId) - Number(a.id === identity?.playerId) || a.seat - b.seat)
			.map(({ id, p, seat }) => ({ id, name: p.name, score: p.score, avatar: avatarOf(p.avatar ?? seat), color: colorOf(seat), mine: id === identity?.playerId }));
	});
	const seatById = $derived(new Map(seats.map((p) => [p.id, p])));
	/** The room's ranking with each player's avatar and colour, for the standings after a round. */
	const standings = $derived.by<Standing[]>(() => {
		const b = board;
		if (!b) return [];
		const ids = Object.keys(b.players);
		return ranking.map((r) => {
			const p = b.players[r.playerId];
			const seat = p?.seat ?? ids.indexOf(r.playerId);
			return { id: r.playerId, name: r.name, score: r.score, longest: r.longest, rank: r.rank, avatar: avatarOf(p?.avatar ?? seat), color: colorOf(seat), mine: r.playerId === identity?.playerId };
		});
	});
	/** Players sit down the two edges of the screen, as in Pilfer: you top-left, the others alternating right and left. */
	const rails = $derived([seats.filter((_, i) => i % 2 === 0), seats.filter((_, i) => i % 2 === 1)]);
	const crowded = $derived(rails[0].length > 4);

	/** Everyone's words, oldest first, in their owner's colour. A word being stolen leaves the list the moment its letters lift off. */
	const tableWords = $derived.by(() => {
		const b = shown;
		if (!b) return [];
		return Object.entries(b.words)
			.filter(([id]) => id !== hiddenWord)
			.sort(([, a], [, c]) => a.at - c.at)
			.map(([id, w]) => {
				const owner = seatById.get(w.owner);
				return { id, text: w.text, owner: w.owner, color: owner?.color ?? '#888888', mine: w.owner === identity?.playerId };
			});
	});

	// "+5" / "−4" next to an avatar when their points change.
	let deltas = $state<Record<string, { v: number; key: number }>>({});
	let lastScores: Record<string, number> = {};
	$effect(() => {
		const next: Record<string, number> = {};
		for (const p of seats) {
			next[p.id] = p.score;
			const before = lastScores[p.id];
			if (before !== undefined && before !== p.score) {
				const key = Date.now() + Math.random();
				deltas[p.id] = { v: p.score - before, key };
				setTimeout(() => deltas[p.id]?.key === key && delete deltas[p.id], 1_600);
			}
		}
		lastScores = next;
	});

	// ── The move animation (timed from Pilfer's own) ─────────────────────
	// The screen floods with the mover's colour. The letters come together in
	// a staging row under the grid: a stolen word's letters lift out of the
	// list, the tiles it used fly in from the grid (their slots go dark), the
	// mover's avatar sweeps across and each letter it passes takes their
	// colour, the row sinks away, and the word pops into the list.
	const EASE = 'cubic-bezier(.45,1.45,.8,1)';
	const STEP_MS = 200;
	const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
	let overlay = $state<HTMLDivElement>();
	/** The staging row: one (invisible) cell per letter of the word being made; the flying letters sit on top. */
	let staging = $state<{ n: number; out: boolean } | null>(null);
	/** Colour wash behind the board while someone's move plays. */
	let glow = $state<string | null>(null);
	/** Whose seat is sliding out as a banner (Pilfer's mover banner). */
	let mover = $state<string | null>(null);
	/** "Yes!!" for the mover, "Ouch!" for whoever lost a word. */
	let reactions = $state<Record<string, { text: string; key: number }>>({});
	let hiddenWord = $state<string | null>(null);
	let hiddenTiles = $state<number[]>([]);
	let clones: HTMLElement[] = [];

	function clearStage() {
		for (const c of clones) c.remove();
		clones = [];
		staging = null;
		hiddenWord = null;
		hiddenTiles = [];
	}
	function react(id: string | undefined, text: string) {
		if (!id) return;
		const key = Date.now() + Math.random();
		reactions[id] = { text, key };
		setTimeout(() => reactions[id]?.key === key && delete reactions[id], 2_500);
	}

	/** A copy of a letter box, fixed over `r`, that can be flown around. */
	function cloneBox(r: DOMRect, text: string, bg: string, ink: string): HTMLElement {
		const el = document.createElement('span');
		el.textContent = text;
		el.className = 'grid place-items-center rounded font-display font-bold will-change-transform';
		Object.assign(el.style, { position: 'fixed', left: `${r.left}px`, top: `${r.top}px`, width: `${r.width}px`, height: `${r.height}px`, fontSize: `${r.height * 0.55}px`, background: bg, color: ink, transformOrigin: 'top left', zIndex: '50' });
		overlay?.appendChild(el);
		clones.push(el);
		return el;
	}
	/** Fly a clone (whose box is `home`) from where `at` put it to `to`. */
	function flyTo(el: HTMLElement, home: DOMRect, at: DOMRect | null, to: DOMRect, delay = 0, duration = STEP_MS) {
		const tf = (r: DOMRect) => `translate(${r.left - home.left}px, ${r.top - home.top}px) scale(${r.width / home.width}, ${r.height / home.height})`;
		return el.animate([{ transform: at ? tf(at) : 'translate(0, 0) scale(1)' }, { transform: tf(to) }], { duration, delay, easing: EASE, fill: 'forwards' }).finished;
	}

	async function animateMove(f: FeedEntry, prev: BoardView) {
		const thief = seatById.get(f.by);
		if (!thief || !overlay) return;
		const text = f.text;
		// The word it came from (stolen, or the thief's own), and the tiles it added.
		const srcId = f.from ? (Object.entries(prev.words).find(([, w]) => w.text === f.from && w.owner === (f.victim ?? f.by))?.[0] ?? null) : null;
		const added = srcId ? letterDiff(f.from!, text).added : [...text];
		const tiles = takeTiles(prev.pool, added) ?? [];
		// Where each old letter and each tile ends up in the new word.
		const used = new Array<boolean>(text.length).fill(false);
		const indexFor = (c: string) => {
			const i = [...text].findIndex((ch, k) => ch === c && !used[k]);
			if (i >= 0) used[i] = true;
			return i;
		};
		const srcMap = srcId ? [...f.from!].map(indexFor) : [];
		const tileMap = tiles.map((t) => indexFor(t.c));

		// The screen takes the mover's colour for the whole move.
		glow = thief.color;
		mover = thief.id;
		staging = { n: text.length, out: false };
		await tick();
		const cells = [...document.querySelectorAll<HTMLElement>('[data-stage-cell]')].map((el) => el.getBoundingClientRect());
		if (cells.length !== text.length) {
			glow = null;
			mover = null;
			return;
		}
		try {
			await wait(STEP_MS);
			// 1. A stolen word's letters lift out of the list to the staging row, in their own order.
			const letterClones: { el: HTMLElement; home: DOMRect; at: DOMRect }[] = [];
			if (srcId) {
				const victim = seatById.get(f.victim ?? f.by);
				const boxes = [...document.querySelectorAll<HTMLElement>(`[data-word="${srcId}"] [data-letter]`)];
				if (boxes.length === f.from!.length) {
					const color = victim?.color ?? '#888888';
					boxes.forEach((el, i) => letterClones.push({ el: cloneBox(el.getBoundingClientRect(), f.from![i], color, inkOn(color)), home: el.getBoundingClientRect(), at: cells[i] }));
					hiddenWord = srcId; // the list closes the gap at once
					await Promise.all(letterClones.map((c, i) => flyTo(c.el, c.home, null, cells[i], 0, 300)));
					await wait(STEP_MS);
				}
			}
			// 2. They re-sort into the new word while the tiles it used fly in from the grid.
			const tileClones = tiles.flatMap((t, j) => {
				const el = document.querySelector<HTMLElement>(`[data-tile="${t.id}"]`);
				if (!el || tileMap[j] < 0) return [];
				const home = el.getBoundingClientRect();
				return [{ el: cloneBox(home, t.c, 'var(--color-sun-light)', 'var(--color-stage)'), home, to: cells[tileMap[j]] }];
			});
			hiddenTiles = tiles.map((t) => t.id); // their slots go dark
			await Promise.all([
				...letterClones.map((c, i) => (srcMap[i] >= 0 ? flyTo(c.el, c.home, c.at, cells[srcMap[i]]) : Promise.resolve())),
				...tileClones.map((c) => flyTo(c.el, c.home, null, c.to))
			]);
			await wait(2 * STEP_MS);
			// 3. The mover's avatar sweeps across; every letter it passes takes their colour.
			const byIndex = new Map<number, HTMLElement>();
			letterClones.forEach((c, i) => srcMap[i] >= 0 && byIndex.set(srcMap[i], c.el));
			tileClones.forEach((c, j) => byIndex.set(tileMap[j], c.el));
			// It leaves its seat, runs along the row and goes home again.
			const sweep = document.createElement('span');
			sweep.textContent = thief.avatar;
			sweep.className = 'grid place-items-center drop-shadow-[0_6px_10px_rgb(0_0_0/0.5)]';
			const size = cells[0].height * 1.15;
			const start = { x: cells[0].left - size, y: cells[0].top + cells[0].height / 2 - size / 2 };
			Object.assign(sweep.style, { position: 'fixed', left: `${start.x}px`, top: `${start.y}px`, width: `${size}px`, height: `${size}px`, fontSize: `${size * 0.8}px`, zIndex: '51', willChange: 'transform' });
			overlay.appendChild(sweep);
			clones.push(sweep);
			const seatEl = document.querySelector<HTMLElement>(`[data-seat-avatar="${f.by}"]`)?.getBoundingClientRect();
			const home = seatEl ? `translate(${seatEl.left + seatEl.width / 2 - start.x - size / 2}px, ${seatEl.top + seatEl.height / 2 - start.y - size / 2}px) scale(.7)` : 'translate(0, 0) scale(0)';
			await sweep.animate([{ transform: home, opacity: seatEl ? 1 : 0 }, { transform: 'translate(0, 0) scale(1)', opacity: 1 }], { duration: 320, easing: 'cubic-bezier(.3,1.3,.6,1)', fill: 'forwards' }).finished;
			for (let i = 0; i < cells.length; i++) {
				const dx = cells[i].left + cells[i].width / 2 - (start.x + size / 2);
				sweep.animate([{ transform: `translate(${dx}px, 0) rotate(${i % 2 ? 8 : -8}deg)` }], { duration: 100, easing: 'linear', fill: 'forwards' });
				const box = byIndex.get(i);
				box?.animate([{ background: thief.color, color: inkOn(thief.color) }], { duration: 100, fill: 'forwards' });
				box?.animate([{ scale: '1.15' }, { scale: '1' }], { duration: 260, easing: EASE });
				await wait(100);
			}
			await wait(120);
			// 4. The row sinks away together while the avatar flies home; the new word then pops into the list.
			if (staging) staging.out = true;
			const last = cells[cells.length - 1];
			const end = `translate(${last.left + last.width / 2 - start.x - size / 2}px, 0)`;
			await Promise.all([
				sweep.animate([{ transform: end, opacity: 1 }, { transform: home, opacity: seatEl ? 1 : 0 }], { duration: 360, easing: 'cubic-bezier(.5,0,.3,1)', fill: 'forwards' }).finished,
				...[...letterClones, ...tileClones].map((c) => c.el.animate([{ opacity: 1, translate: '0 0' }, { opacity: 0, translate: '0 18px' }], { duration: 220, fill: 'forwards', composite: 'add' }).finished)
			]);
			react(f.by, 'Yes!!');
			if (f.victim && f.victim !== f.by) react(f.victim, 'Ouch!');
		} finally {
			clearStage();
			setTimeout(() => (glow = null), 300);
			setTimeout(() => mover === thief.id && (mover = null), 450);
		}
	}

	// ── Moves ────────────────────────────────────────────────────────────
	let input = $state('');
	let sending = $state(false);
	let error = $state<{ text: string; key: number } | null>(null);
	let wordEl = $state<HTMLDivElement>();

	// The round screen fills the screen exactly: header, board, word box and keyboard, no page scroll.
	let fit = $state(false);
	const fitRound = () => {
		fit = true;
		return () => (fit = false);
	};

	async function play() {
		if (!client || !identity || sending || !live) return;
		const text = input.trim();
		if (!text) return;
		sending = true;
		const result = await client!.move(text);
		sending = false;
		if (result.ok) {
			if (input === text) input = '';
			error = null;
		} else {
			const key = Date.now();
			error = { text: result.message, key };
			setTimeout(() => error?.key === key && (error = null), 2_500);
			// The word box shakes its head (Pilfer's ±30px, six quick steps), then empties for the next try.
			const clear = () => input === text && (input = '');
			if (reduceMotion || !wordEl) clear();
			else wordEl.animate([0, -30, 30, -30, 30, -30, 0].map((x) => ({ transform: `translateX(${x}px)` })), { duration: 600, easing: 'ease-in-out' }).finished.then(clear, clear);
		}
	}

	// ── Typing: the on-screen keyboard, or a real one ────────────────────
	const MAX_WORD = 20;
	const KEY_ROWS = [[...'QWERTYUIOP'], [...'ASDFGHJKL', 'back'], [...'ZXCVBNM', 'enter']];
	/** The key lit by a real keyboard, so typing there shows on screen too. */
	let lit = $state<string | null>(null);
	function press(k: string) {
		if (!live) return;
		lit = k;
		setTimeout(() => lit === k && (lit = null), 120);
		if (k === 'enter') void play();
		else if (k === 'back') input = input.slice(0, -1);
		else if (k === 'clear') input = '';
		else if (input.length < MAX_WORD) input += k;
	}
	function onKey(e: KeyboardEvent) {
		if (!fit || e.ctrlKey || e.metaKey || e.altKey) return;
		const target = e.target as HTMLElement | null;
		if (target?.closest?.('input, textarea, select, [contenteditable]')) return;
		if (/^[a-z]$/i.test(e.key)) press(e.key.toUpperCase());
		else if (e.key === 'Backspace') press('back');
		else if (e.key === 'Escape') press('clear');
		else if (e.key === 'Enter' && !target?.closest?.('button')) press('enter');
		else return;
		e.preventDefault();
	}
	/** A tap types on press (no 300 ms wait); a key reached with Tab/Enter still works as a click. */
	function keyDown(e: PointerEvent, k: string) {
		e.preventDefault();
		press(k);
	}
	function keyClick(e: MouseEvent, k: string) {
		if (e.detail === 0) press(k);
	}

	// ── Tiles left (or the final countdown) for the ring in the header ───
	const ringValue = $derived(!board ? 0 : board.status === 'ready' ? board.tiles.count : clock?.finalCountdown ? Math.ceil(timeLeft / 1000) : (clock?.tilesLeft ?? board.tiles.count));

	const placeLabel = (n: number) => (n === 1 ? '1st' : n === 2 ? '2nd' : n === 3 ? '3rd' : `${n}th`);
</script>

<svelte:head><title>Word Heist · {code} — ZenCode</title></svelte:head>
<svelte:window onkeydown={onKey} />

<GameStage {fit}>
	<header class="sticky top-0 z-20 grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-2 border-b border-white/10 bg-stage/85 backdrop-blur {fit ? 'px-3 py-1.5 sm:px-4' : 'px-4 py-3'}">
		<div class="min-w-0">
			<p class="truncate font-display text-sm leading-tight font-bold tracking-[0.14em] uppercase">Word Heist</p>
			<p class="truncate font-mono text-[11px] text-cream/50 {fit ? 'tracking-[0.08em]' : 'tracking-[0.2em]'}">
				{code}{#if session && session.round > 0} · {session.final ? 'Final' : `Round ${session.round}`}{/if}{#if me?.roomNumber && inRound} · Room {me.roomNumber}{/if}
			</p>
		</div>
		<!-- Tiles left (the final countdown once the bag is empty): the round's clock, as in Pilfer's header -->
		{#if fit && board}
			{@const final = !!clock?.finalCountdown}
			<div class="flex flex-col items-center" role="timer" aria-label={final ? `${formatClock(timeLeft)} left` : `${ringValue} tiles left`}>
				{#key final}
					<span class="rounded-full px-2 font-display text-[10px] leading-4 font-bold tracking-[0.14em] uppercase {final ? 'bg-sun text-stage' : 'text-sun'}" in:scale={{ start: 0.6, duration: 300, easing: backOut }}>{final ? 'Final countdown!' : 'Tiles left'}</span>
				{/key}
				<div class="relative mt-0.5 grid size-11 place-items-center {final && live ? 'ring-urgent' : ''}">
					<svg viewBox="0 0 40 40" class="absolute inset-0 -rotate-90" aria-hidden="true">
						<circle cx="20" cy="20" r="16.5" fill="none" stroke="currentColor" stroke-width="3.5" class="text-white/10" />
						<circle
							cx="20"
							cy="20"
							r="16.5"
							fill="none"
							stroke="currentColor"
							stroke-width="3.5"
							stroke-linecap="round"
							pathLength="100"
							stroke-dasharray="{ringLeft * 100} 100"
							class="ring-arc transition-[stroke-dasharray] duration-500 ease-out {final ? 'text-attention' : 'text-sun'}"
						/>
					</svg>
					{#key ringValue}
						<span class="relative font-display text-lg font-bold tabular {final ? 'text-attention' : 'text-cream'}" in:scale={{ start: 1.35, duration: 280, easing: backOut }}>{ringValue}</span>
					{/key}
				</div>
			</div>
		{:else}
			<span></span>
		{/if}
		<div class="flex min-w-0 items-center justify-end gap-2">
			{#if offline}
				<span class="inline-flex items-center gap-1 rounded-md bg-attention/15 px-2 py-1 text-xs font-semibold text-attention" role="status"><WifiOff class="size-3.5" /> <span class={fit ? 'sr-only sm:not-sr-only' : ''}>Reconnecting…</span></span>
			{/if}
			{#if inRound && myEntry}
				<div class="flex items-baseline gap-1 rounded-md border border-green-300/30 bg-forest-900/70 {fit ? 'px-2.5 py-1' : 'px-3 py-1.5'}" aria-live="polite">
					<XpCounter value={myEntry.score} class="font-display text-lg font-bold text-cream" />
					<span class="text-xs font-semibold text-cream/60">pts</span>
				</div>
			{/if}
		</div>
	</header>

	<main class="mx-auto flex w-full max-w-4xl flex-1 flex-col px-3 sm:px-4 {fit ? 'min-h-0' : 'pt-5 pb-8'}">
		{#if loadState === 'loading'}
			<div class="m-auto flex items-center gap-3 text-cream/70" role="status"><Spinner /> {offline ? 'Reconnecting…' : 'Loading…'}</div>
		{:else if loadState === 'missing'}
			<div class="m-auto text-center" role="alert">
				<p class="text-xl font-semibold">Tournament not found.</p>
				<p class="mt-1 text-cream/60">Check the code on the big screen and try again.</p>
				<Button variant="stage" class="mt-6" href="/join">Enter a code</Button>
			</div>
		{:else if !session}
			<div class="m-auto flex items-center gap-3 text-cream/70" role="status"><Spinner /> Connecting to the game…</div>
		{:else if !identity}
			<!-- REGISTER -->
			{#if status === 'finished'}
				<div class="m-auto text-center">
					<p class="eyebrow text-green-300">{noun === 'game' ? 'Game' : 'Tournament'} {code}</p>
					<p class="mt-3 font-display text-3xl font-bold uppercase">This {noun} has {closed ? 'been closed' : 'finished'}</p>
					{#if closed}<p class="mt-2 text-cream/60">Taking you home…</p>{/if}
				</div>
			{:else if !session.registrationOpen}
				<div class="m-auto text-center">
					<p class="eyebrow text-green-300">{noun === 'game' ? 'Game' : 'Tournament'} {code}</p>
					<p class="mt-3 font-display text-3xl font-bold uppercase">Registration is closed</p>
					<p class="mt-2 text-cream/60">Ask an organiser if you think you should be in.</p>
				</div>
			{:else}
				<div class="my-auto w-full max-w-md self-center" in:fly={{ y: 16, duration: 300 }}>
					<Logo class="mb-8" />
					<h1 class="font-display text-4xl leading-none font-bold tracking-tight uppercase">Word Heist</h1>
					<p class="mt-2 text-sun">Make words. Steal words. Keep the most letters.</p>
					{#if status !== 'lobby'}
						<p class="mt-4 rounded-lg border border-sun/30 bg-sun/10 px-3 py-2 text-sm text-sun">A round is already under way — you'll join the reserve list.</p>
					{/if}
					<form class="mt-8 space-y-3" onsubmit={submitJoin} novalidate>
						<fieldset>
							<legend class="eyebrow mb-2 flex w-full items-center gap-2 text-cream/60">
								Pick your avatar <span class="ml-auto text-3xl" aria-hidden="true">{AVATARS[avatar]}</span>
							</legend>
							<div class="grid max-h-56 grid-cols-8 gap-1 overflow-y-auto rounded-lg border border-stage-line bg-stage-raised/60 p-2 sm:grid-cols-10" role="radiogroup" aria-label="Avatars">
								{#each AVATARS as a, i (i)}
									{@const taken = takenAvatars.has(i)}
									<button
										type="button"
										role="radio"
										aria-checked={avatar === i}
										aria-label="{taken ? 'Taken' : 'Avatar'} {i + 1}"
										disabled={taken}
										onclick={() => (pickedAvatar = i)}
										class="grid aspect-square place-items-center rounded-md text-2xl transition-colors {avatar === i ? 'bg-sun/25 ring-2 ring-sun' : 'hover:bg-white/10'} disabled:cursor-not-allowed disabled:opacity-25"
									>
										{a}
									</button>
								{/each}
							</div>
							{#if noun === 'game'}<p class="mt-1.5 text-xs text-cream/40">Faded avatars are already taken in this game.</p>{/if}
						</fieldset>
						<label for="name" class="eyebrow block text-cream/60">Enter your name</label>
						<input
							id="name"
							bind:value={name}
							maxlength="20"
							autocomplete="nickname"
							enterkeyhint="go"
							placeholder="Your display name"
							aria-invalid={joinError ? 'true' : undefined}
							aria-describedby={joinError ? 'join-err' : undefined}
							class="h-14 w-full rounded-lg border-2 border-stage-line bg-stage-raised px-4 text-lg font-semibold text-cream outline-none transition-colors duration-150 placeholder:font-normal placeholder:text-cream/30 focus:border-green-300"
						/>
						{#if joinError}<p id="join-err" class="text-sm text-attention" role="alert">{joinError}</p>{/if}
						<Button type="submit" variant="sun" size="xl" class="w-full" loading={joining}>{joining ? 'Joining…' : `Join ${noun}`}</Button>
					</form>
					<p class="mt-4 text-center text-xs text-cream/40">No sign-up needed. Your name is only used for this {noun}.</p>
				</div>
			{/if}
		{:else if !me}
			<div class="m-auto flex items-center gap-3 text-cream/70" role="status"><Spinner /> Loading your place…</div>
		{:else if closed || (status === 'finished' && !session.podium.length)}
			<div class="m-auto text-center">
				<DoorClosed class="mx-auto size-12 text-cream/50" />
				<p class="mt-3 font-display text-3xl font-bold uppercase">{noun === 'game' ? 'Game' : 'Tournament'} closed</p>
				<p class="mt-2 text-cream/60">The organisers closed this {noun}. Thanks for playing, {identity.name}. Taking you home…</p>
			</div>
		{:else if me.status === 'removed'}
			<div class="m-auto text-center" role="alert">
				<p class="font-display text-3xl font-bold uppercase">You've been removed</p>
				<p class="mt-2 text-cream/60">An organiser removed you from this {noun}.</p>
			</div>
		{:else if me.status === 'reserve'}
			<div class="m-auto text-center">
				<p class="font-display text-4xl font-bold uppercase">You're on the reserve list</p>
				<p class="mt-3 text-cream/70">Rooms were locked before you registered, {identity.name}. Organisers can see you're here.</p>
			</div>
		{:else if status === 'lobby' || (status === 'ready' && !inRound && me.status === 'lobby')}
			<!-- LOBBY -->
			<div class="m-auto text-center">
				<p class="text-6xl" aria-hidden="true" in:scale={{ start: 0.6, duration: 400 }}>{avatarOf(me.avatar)}</p>
				<p class="mt-2 font-display text-5xl font-bold tracking-tight uppercase" in:scale={{ start: 0.85, duration: 400 }}>You're in.</p>
				<p class="mt-3 text-lg text-cream/80">Welcome, <span class="font-semibold text-sun">{identity.name}</span>.</p>
				<div class="mx-auto mt-8 w-fit rounded-xl border border-green-300/30 bg-forest-900/60 px-8 py-5" aria-live="polite">
					<p class="eyebrow text-cream/50">Provisional room</p>
					{#if lobbyRoom}
						{#key lobbyRoom}
							<p class="font-display text-6xl font-bold text-green-300" in:scale={{ start: 0.7, duration: 350 }}>{lobbyRoom}</p>
						{/key}
						<p class="text-xs text-cream/50">of {session.lobbyRooms}</p>
					{:else}
						<p class="mt-2 flex items-center gap-2 text-cream/60"><Spinner class="size-4" /> Assigning…</p>
					{/if}
				</div>
				{#if roomMoved}
					<p class="mt-4 text-sm text-sun" in:fade role="status">More players joined — your room changed to Room {lobbyRoom}.</p>
				{/if}
				<p class="mt-8 text-cream/60">Rooms may change as people join. They're locked when the round starts.</p>
				<p class="mt-6 font-display text-3xl font-bold text-green-300" aria-live="polite">
					<XpCounter value={session.playerCount} duration={400} />
					<span class="block text-xs font-semibold tracking-[0.2em] text-cream/50 uppercase">{session.playerCount === 1 ? 'player registered' : 'players registered'}</span>
				</p>
			</div>
		{:else if (me.status === 'eliminated' || me.status === 'qualified' || me.status === 'tied' || me.status === 'champion') && (status === 'review' || status === 'finished' || me.round < session.round || (status === 'ready' && !inRound))}
			<!-- ROUND RESULT -->
			<div class="m-auto w-full max-w-md py-4 text-center">
				{#if me.status === 'champion'}
					<Crown class="mx-auto size-14 text-sun" />
					<p class="mt-3 font-display text-5xl font-bold uppercase" in:scale={{ start: 0.7, duration: 420 }}>Champion!</p>
					<p class="mt-2 text-cream/70">You won Word Heist, {identity.name}.</p>
				{:else if me.status === 'qualified' && session.final && me.place}
					<Medal class="mx-auto size-12 text-sun" />
					<p class="mt-3 font-display text-4xl font-bold uppercase">{placeLabel(me.place)} place</p>
				{:else if me.status === 'qualified' && me.round === session.round}
					<Sparkles class="mx-auto size-12 text-green-300" />
					<p class="mt-3 font-display text-4xl font-bold text-green-300 uppercase" in:scale={{ start: 0.7, duration: 420 }}>You advance!</p>
					<p class="mt-2 text-cream/70">Top {session.rules.advance} in Room {me.roomNumber}. Next stage rooms are being prepared — stay on this page.</p>
				{:else if me.status === 'tied'}
					<Hourglass class="mx-auto size-12 text-sun" />
					<p class="mt-3 font-display text-3xl font-bold uppercase">Tied at the cutoff</p>
					<p class="mt-2 text-cream/70">You're level with another player on every tie-break. An organiser is deciding.</p>
				{:else}
					<p class="font-display text-3xl font-bold uppercase">Thanks for playing</p>
					<p class="mt-2 text-cream/70">You didn't go through this time{myEntry ? ` — you finished #${myEntry.rank} in Room ${me.roomNumber}` : ''}.</p>
				{/if}
				{#if standings.length && me.round === session.round}
					<div class="mt-8">
						<HeistStandings entries={standings} final={session.final} advance={session.rules.advance} title={session.final ? 'Final standings' : `Room ${me.roomNumber} standings`} />
					</div>
				{/if}
			</div>
		{:else if status === 'scoring' || (inRound && board?.status === 'finished')}
			<div class="m-auto text-center" role="status">
				<p class="font-display text-4xl font-bold uppercase">Round over</p>
				<p class="mt-3 flex items-center justify-center gap-2 text-cream/70"><Spinner class="size-4" /> Counting the scores…</p>
			</div>
		{:else if inRound && board && shown}
			<!-- ROUND (ready / playing / paused) -->
			<div class="relative isolate -mx-3 flex min-h-0 flex-1 flex-col sm:-mx-4">
				<!-- The whole screen floods with the mover's colour while their move plays -->
				<div
					class="pointer-events-none fixed inset-0 -z-10 transition-opacity duration-500 ease-out {glow ? 'opacity-100' : 'opacity-0'}"
					style="background: radial-gradient(ellipse 90% 70% at 50% 42%, {glow ?? 'transparent'}d9, {glow ?? 'transparent'}66 50%, transparent 100%)"
					aria-hidden="true"
				></div>
				<div class="flex min-h-0 flex-1" {@attach fitRound}>
					<!-- Players down both edges of the screen -->
					{#each rails as rail, side (side)}
						<ul class="relative z-10 flex shrink-0 flex-col pt-3 {side ? 'order-3 items-end' : 'items-start'} {crowded ? 'w-11 gap-1 sm:w-16' : 'w-13 gap-3 sm:w-20 sm:gap-4'}" aria-label={side ? 'Players' : 'You and players'}>
							{#each rail as p (p.id)}
								{@const size = crowded ? (wide ? 44 : 34) : wide ? 60 : 46}
								<li animate:flip={{ duration: 400 }} class="relative flex flex-col {side ? 'items-end' : 'items-start'}" aria-label="{p.mine ? 'You' : p.name}: {p.score} points">
									<!-- The seat: a half pill hugging the edge that slides out as a banner while its player moves -->
									<span
										class="seat relative flex items-center {side ? 'flex-row-reverse rounded-l-full pl-1' : 'rounded-r-full pr-1'} {p.mine ? 'seat-mine' : ''}"
										style="--seat: {p.color}; height: {size}px; width: {size + 8 + (mover === p.id ? (wide ? 72 : 48) : 0)}px"
									>
										<span class="flex-1"></span>
										<span data-seat-avatar={p.id} aria-hidden="true" class="grid shrink-0 place-items-center drop-shadow-[0_2px_3px_rgb(0_0_0/0.45)] transition-transform duration-300 {mover === p.id ? 'scale-110' : ''}" style="width: {size - 6}px; font-size: {size * 0.6}px">{p.avatar}</span>
										{#if deltas[p.id] || reactions[p.id]}
											{#key `${deltas[p.id]?.key ?? ''}${reactions[p.id]?.key ?? ''}`}
												<span
													class="absolute -top-3 z-10 flex items-center gap-1 rounded-full bg-cream px-2 py-0.5 font-display text-[11px] font-bold whitespace-nowrap text-stage shadow-lg shadow-black/40 {side ? 'right-[70%]' : 'left-[70%]'}"
													in:scale={{ start: 0.4, duration: 320, easing: backOut }}
													out:fade={{ duration: 300 }}
												>
													{#if deltas[p.id]}<span class={deltas[p.id].v > 0 ? 'text-forest-700' : 'text-attention'}>{deltas[p.id].v > 0 ? '+' : ''}{deltas[p.id].v}</span>{/if}
													{#if reactions[p.id]}{reactions[p.id].text}{/if}
												</span>
											{/key}
										{/if}
									</span>
									<span class="-mt-2 flex items-center {side ? 'mr-1' : 'ml-1'}">
										{#key p.score}
											<span class="relative min-w-6 rounded-full px-1.5 text-center font-display text-xs leading-4.5 font-bold tabular shadow-md shadow-black/40" style="background: {p.color}; color: {inkOn(p.color)}" in:scale={{ start: 1.5, duration: 280, easing: backOut }}>{p.score}</span>
										{/key}
									</span>
									{#if !crowded || p.mine}
										<span class="mt-0.5 truncate px-1 text-[10px] font-semibold text-cream/70 {side ? 'text-right' : ''}" style="width: {size + 8}px">{p.mine ? 'You' : p.name}</span>
									{/if}
								</li>
							{/each}
						</ul>
					{/each}

					<div class="flex min-w-0 flex-1 flex-col pt-3">
						<!--
							The tiles: 7 to a row on a phone (14 on a wider screen), each keeping
							its place until it is used. They are sized to fit the space, so the
							whole grid is always in view.
						-->
						<div class="no-scrollbar flex min-h-0 flex-1 justify-center {gridFits ? 'items-center' : 'items-start overflow-y-auto overscroll-contain'}" {@attach measureGrid}>
							<ul class="grid" style="grid-template-columns: repeat({COLS}, {tileSize}px); grid-auto-rows: {tileSize}px; gap: {GAP}px; --tile: {tileSize}px" aria-label="Letters — free for anyone to use" aria-live="polite">
								{#each slots as t, i (t ? `t${t.id}` : `e${i}`)}
									{#if t}
										<li data-tile={t.id} class="tile grid place-items-center font-display font-extrabold {hiddenTiles.includes(t.id) ? 'invisible' : ''}">
											<span class="tile-face">{t.c}</span>
										</li>
									{:else}
										<li class="slot" aria-hidden="true"></li>
									{/if}
								{/each}
							</ul>
						</div>

						<!-- Staging row: where a word being made comes together (the letters themselves fly on the overlay) -->
						<div class="flex h-12 shrink-0 items-center justify-center gap-1 sm:h-16" aria-hidden="true" data-staging>
							{#if staging}
								{@const cell = Math.max(20, Math.min(wide ? 56 : 44, Math.floor(((gridBox?.w ?? 280) - (staging.n - 1) * 4) / staging.n)))}
								{#each Array(staging.n) as _, i (i)}
									<span data-stage-cell class="rounded-md" style="width: {cell}px; height: {cell}px"></span>
								{/each}
							{:else if board.status === 'ready'}
								<p class="flex items-center gap-2 text-sm text-cream/60" in:fade><Spinner class="size-3.5" /> Waiting for the organiser to start…</p>
							{/if}
						</div>

						<!-- Everyone's words, in their owner's colour (a long table scrolls here) -->
						<ul class="no-scrollbar flex max-h-[30%] min-h-8 shrink-0 flex-wrap content-start justify-center gap-1.5 overflow-y-auto pb-2 sm:gap-2" aria-label="Words on the table">
							{#each tableWords as w (w.id)}
								<li
									data-word={w.id}
									animate:flip={{ duration: 320, easing: backOut }}
									in:scale={{ start: 0.5, duration: 420, easing: backOut }}
									class="word flex {hiddenWord === w.id ? 'opacity-0' : ''} {w.mine ? 'word-mine' : ''}"
									style="--word: {w.color}"
								>
									<span class="sr-only">{w.text}, {w.mine ? 'yours' : (seatById.get(w.owner)?.name ?? '')}</span>
									{#each [...w.text] as c, i (i)}
										<span data-letter={i} aria-hidden="true" class="letter grid h-7 w-5.5 place-items-center font-display text-[15px] font-extrabold sm:h-9 sm:w-7 sm:text-lg" style="color: {inkOn(w.color)}">{c}</span>
									{/each}
								</li>
							{/each}
						</ul>
					</div>
				</div>

				<!-- Paused: everything stops behind a big pause mark -->
				{#if board.status === 'paused'}
					<div class="absolute inset-0 z-30 grid place-items-center bg-stage/70 backdrop-blur-sm" role="status" transition:fade={{ duration: 250 }}>
						<div class="text-center" in:scale={{ start: 0.6, duration: 380, easing: backOut }}>
							<div class="breathe mx-auto grid size-36 place-items-center rounded-full border border-cream/15 bg-cream/5 shadow-[0_0_80px_-20px_var(--color-sun)]">
								<Pause class="size-20 text-cream" fill="currentColor" strokeWidth={0} />
							</div>
							<p class="mt-5 font-display text-2xl font-bold tracking-[0.3em] text-cream uppercase">Paused</p>
						</div>
					</div>
				{/if}
			</div>

			<!-- The word being typed, and (on a phone) the game's own keyboard: the phone's keyboard never opens -->
			<div class="relative -mx-3 shrink-0 sm:-mx-4 {touch ? '' : 'px-3 pb-3 sm:px-4'}">
				{#if error}
					{#key error.key}
						<p class="absolute -top-8 left-1/2 z-10 -translate-x-1/2 rounded-full bg-cream px-3 py-1 font-display text-xs font-bold tracking-[0.12em] whitespace-nowrap text-stage uppercase shadow-lg shadow-black/40" role="alert" in:fly={{ y: 10, duration: 240, easing: backOut }} out:fade={{ duration: 200 }}>{error.text}</p>
					{/key}
				{/if}
				<div
					bind:this={wordEl}
					class="word-box mx-auto flex w-full items-center gap-2 transition-shadow duration-300 {touch ? 'h-12 max-w-md rounded-t-2xl px-3' : 'h-15 max-w-lg rounded-2xl p-2 pl-4'} {error ? 'ring-2 ring-attention/70' : ''} {live ? '' : 'opacity-60'}"
					aria-label="Your word"
					aria-live="polite"
				>
					{#if touch}<span class="w-8 shrink-0"></span>{/if}
					<p class="flex min-w-0 flex-1 items-center overflow-hidden {touch ? 'justify-center' : ''}">
						{#if input}
							{#each [...input] as c, i (i)}
								<span class="font-mono text-2xl font-bold text-cream" in:fly={{ y: 10, duration: 160, easing: backOut }}>{c}</span>
							{/each}
							<span class="caret ml-0.5 h-6 w-0.5 rounded bg-sun" aria-hidden="true"></span>
						{:else}
							<span class="truncate text-base text-cream/45">{live ? 'Type a word and press enter' : board.status === 'paused' ? 'Paused' : 'Waiting to start…'}</span>
						{/if}
					</p>
					{#if touch}
						<button type="button" class="grid size-8 shrink-0 place-items-center rounded-full text-cream/60 transition-opacity {input ? 'opacity-100' : 'pointer-events-none opacity-0'}" aria-label="Clear" onpointerdown={(e) => keyDown(e, 'clear')} onclick={(e) => keyClick(e, 'clear')}><X class="size-5" /></button>
					{:else}
						<Button type="button" variant="sun" size="lg" class="h-11! rounded-xl! px-6!" loading={sending} disabled={!live || sending || !input} onclick={play}>Play</Button>
					{/if}
				</div>
				{#if touch}
					<div class="keyboard px-1 pt-1.5 pb-[max(env(safe-area-inset-bottom),8px)]" role="group" aria-label="Keyboard">
						{#each KEY_ROWS as row, r (r)}
							<div class="mx-auto flex max-w-xl justify-center gap-1.25 {r ? 'mt-1.75' : ''} {r === 1 ? 'pl-[4%]' : r === 2 ? 'pl-[9%]' : ''}">
								{#each row as k (k)}
									<button
										type="button"
										class="key {k.length > 1 ? 'key-wide' : ''} {k === 'enter' ? 'key-enter' : ''} {lit === k ? 'key-lit' : ''}"
										disabled={!live}
										aria-label={k === 'back' ? 'Delete' : k === 'enter' ? 'Play word' : k}
										onpointerdown={(e) => keyDown(e, k)}
										onclick={(e) => keyClick(e, k)}
									>
										{#if k === 'back'}<Delete class="size-5" />{:else if k === 'enter'}{#if sending}<Spinner class="size-4" />{:else}<CornerDownLeft class="size-5" />{/if}{:else}{k}{/if}
									</button>
								{/each}
							</div>
						{/each}
					</div>
				{/if}
			</div>
		{:else}
			<div class="m-auto text-center" role="status">
				<Wifi class="mx-auto size-8 text-cream/40" />
				<p class="mt-3 text-lg text-cream/70">Waiting for the organisers…</p>
			</div>
		{/if}
	</main>
	<!-- Letters and tiles in flight during a steal -->
	<div bind:this={overlay} class="pointer-events-none fixed inset-0 z-40" aria-hidden="true"></div>
</GameStage>

<style>
	/* A letter tile: pale, with a lit top edge and a thick lower lip, like a real piece. Sized by --tile. */
	.tile {
		border-radius: max(4px, calc(var(--tile) * 0.14));
		color: #1a1405;
		background: linear-gradient(180deg, #fff6d6 0%, var(--color-sun-light) 45%, var(--color-sun) 100%);
		box-shadow:
			inset 0 1px 0 rgb(255 255 255 / 0.8),
			inset 0 calc(var(--tile) * -0.08) 0 rgb(120 80 0 / 0.28),
			0 calc(var(--tile) * 0.12) calc(var(--tile) * 0.25) calc(var(--tile) * -0.1) rgb(0 0 0 / 0.75);
		/* Drops in from above and settles with a small bounce (Pilfer's 0.8 s slide). */
		animation: tile-drop 0.8s cubic-bezier(0.45, 1.25, 0.8, 1) both;
		will-change: transform;
	}
	.tile-face {
		font-size: calc(var(--tile) * 0.58);
		line-height: 1;
		transform: translateY(calc(var(--tile) * -0.03));
		text-shadow: 0 1px 0 rgb(255 255 255 / 0.5);
	}
	@keyframes tile-drop {
		0% {
			transform: translateY(-80vh) scale(0.9);
			opacity: 0;
		}
		12% {
			opacity: 1;
		}
		100% {
			transform: translateY(0) scale(1);
		}
	}
	/* Scroll areas scroll like a phone: no visible bar. */
	.no-scrollbar {
		scrollbar-width: none;
	}
	.no-scrollbar::-webkit-scrollbar {
		display: none;
	}
	/* An empty slot: a shallow well the next tile will land in. */
	.slot {
		border-radius: max(4px, calc(var(--tile) * 0.14));
		background: rgb(0 0 0 / 0.35);
		box-shadow:
			inset 0 2px 8px rgb(0 0 0 / 0.6),
			inset 0 0 0 1px rgb(255 255 255 / 0.08);
	}
	/* A word on the table: one solid band in its owner's colour, a letter to a cell (Pilfer's word chips). */
	.word {
		border-radius: 6px;
		overflow: hidden;
		box-shadow:
			0 4px 10px -4px rgb(0 0 0 / 0.7),
			0 0 0 1px color-mix(in srgb, var(--word) 70%, black);
	}
	.word-mine {
		box-shadow:
			0 4px 10px -4px rgb(0 0 0 / 0.7),
			0 0 0 2px var(--color-cream);
	}
	.letter {
		background: linear-gradient(180deg, color-mix(in srgb, var(--word) 82%, white) 0%, var(--word) 50%, color-mix(in srgb, var(--word) 85%, black) 100%);
		text-shadow: 0 1px 1px rgb(0 0 0 / 0.25);
	}
	.letter + .letter {
		box-shadow: inset 1px 0 0 rgb(0 0 0 / 0.18);
	}
	/* A seat: a half pill in the player's colour, flush with the screen edge. */
	.seat {
		background: radial-gradient(circle at 70% 40%, color-mix(in srgb, var(--seat) 70%, white), var(--seat) 55%, color-mix(in srgb, var(--seat) 70%, black));
		box-shadow:
			0 8px 18px -8px var(--seat),
			inset 0 1px 0 rgb(255 255 255 / 0.35);
		transition:
			width 0.35s cubic-bezier(0.3, 1.35, 0.6, 1),
			box-shadow 0.3s;
	}
	/* Your own seat glows gently. */
	.seat-mine {
		animation: seat-glow 2.6s ease-in-out infinite;
	}
	@keyframes seat-glow {
		0%,
		100% {
			box-shadow:
				0 0 0 2px var(--color-cream),
				0 0 14px -2px var(--seat);
		}
		50% {
			box-shadow:
				0 0 0 2px var(--color-cream),
				0 0 28px 2px var(--seat);
		}
	}
	/* The word box: a tab sitting on the keyboard (phone) or a panel (computer). */
	.word-box {
		background: rgb(0 0 0 / 0.55);
		border: 1px solid rgb(255 255 255 / 0.08);
		backdrop-filter: blur(10px);
	}
	.caret {
		animation: caret 1s steps(1) infinite;
	}
	@keyframes caret {
		50% {
			opacity: 0;
		}
	}
	/* The on-screen keyboard: compact, dark, three rows. */
	.keyboard {
		background: rgb(0 0 0 / 0.6);
		border-top: 1px solid rgb(255 255 255 / 0.06);
		backdrop-filter: blur(10px);
		touch-action: manipulation;
		user-select: none;
		-webkit-user-select: none;
	}
	.key {
		display: grid;
		flex: 1 1 0;
		max-width: 3.25rem;
		height: 2.9rem;
		place-items: center;
		border-radius: 0.45rem;
		background: #2c3443;
		color: var(--color-cream);
		font-family: var(--font-display, inherit);
		font-size: 1.2rem;
		font-weight: 700;
		box-shadow: 0 2px 0 rgb(0 0 0 / 0.55);
		-webkit-tap-highlight-color: transparent;
		transition:
			transform 0.08s,
			background-color 0.12s;
	}
	.key-wide {
		flex-grow: 1.55;
		max-width: 4.75rem;
		background: #5b6578;
	}
	.key-enter {
		background: var(--color-sun);
		color: var(--color-stage);
	}
	.key:active:not(:disabled),
	.key-lit {
		transform: translateY(1px) scale(0.94);
		background: #475167;
		box-shadow: 0 1px 0 rgb(0 0 0 / 0.55);
	}
	.key-enter:active:not(:disabled),
	.key-enter.key-lit {
		background: var(--color-sun-light);
	}
	.key:disabled {
		opacity: 0.45;
	}
	/* The arc of the ring glows in its colour. */
	.ring-arc {
		filter: drop-shadow(0 0 4px currentColor);
	}
	/* Last seconds: the ring pulses. */
	.ring-urgent {
		animation: ring-urgent 1s ease-in-out infinite;
	}
	@keyframes ring-urgent {
		0%,
		100% {
			transform: scale(1);
		}
		50% {
			transform: scale(1.08);
		}
	}
	@media (prefers-reduced-motion: reduce) {
		.tile,
		.seat-mine,
		.ring-urgent,
		.caret {
			animation: none;
		}
	}
</style>
