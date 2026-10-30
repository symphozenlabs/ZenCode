<script lang="ts">
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import { tick, untrack } from 'svelte';
	import { fade, fly, scale } from 'svelte/transition';
	import { backOut } from 'svelte/easing';
	import { Pause, Wifi, WifiOff, Sparkles, Hourglass, Crown, Medal, DoorClosed } from '@lucide/svelte';
	import { serverNow } from '$lib/games/tech-word-rush/api';
	import { CODE_RE, formatClock, type FeedEntry } from '$lib/games/word-heist/types';
	import { letterDiff, rankBoard, roundClock, takeTiles } from '$lib/games/word-heist/engine';
	import { HeistClient } from '$lib/games/word-heist/client.svelte';
	import type { BoardView } from '$lib/games/word-heist/protocol';
	import { AVATARS, AVATAR_COUNT, avatarOf, colorOf, inkOn } from '$lib/games/word-heist/avatars';
	import GameStage from '$lib/components/games/GameStage.svelte';
	import XpCounter from '$lib/components/games/XpCounter.svelte';
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

	// ── Tiles keep their place ───────────────────────────────────────────
	// 7 to a row. A tile stays in its slot until it is used; the slot is then
	// left empty and the next tile to drop fills the first empty slot. Rows
	// are padded to a full 7, and empty rows at the bottom are dropped.
	const COLS = 7;
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

	// ── Players: avatar, colour, points ──────────────────────────────────
	type Seat = { id: string; name: string; score: number; avatar: string; color: string; mine: boolean };
	const seats = $derived.by<Seat[]>(() => {
		const b = shown;
		if (!b) return [];
		return Object.entries(b.players)
			.map(([id, p], i) => ({ id, p, seat: p.seat ?? i }))
			.filter(({ p }) => !p.removed)
			.sort((a, b) => Number(b.id === identity?.playerId) - Number(a.id === identity?.playerId) || a.seat - b.seat)
			.map(({ id, p, seat }) => ({ id, name: p.name, score: p.score, avatar: avatarOf(p.avatar ?? seat), color: colorOf(seat), mine: id === identity?.playerId }));
	});
	const seatById = $derived(new Map(seats.map((p) => [p.id, p])));

	/** Everyone's words, oldest first, in their owner's colour. */
	const tableWords = $derived.by(() => {
		const b = shown;
		if (!b) return [];
		return Object.entries(b.words)
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

	// ── The steal animation ──────────────────────────────────────────────
	const EASE = 'cubic-bezier(.45,1.45,.8,1)';
	const STEP_MS = 200;
	const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
	let overlay = $state<HTMLDivElement>();
	/** The staging row: one cell per letter of the word being made, coloured once the letters are in place. */
	let staging = $state<{ n: number; color: string; filled: boolean; out: boolean } | null>(null);
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
	function flyTo(el: HTMLElement, home: DOMRect, at: DOMRect | null, to: DOMRect, delay = 0) {
		const tf = (r: DOMRect) => `translate(${r.left - home.left}px, ${r.top - home.top}px) scale(${r.width / home.width}, ${r.height / home.height})`;
		return el.animate([{ transform: at ? tf(at) : 'translate(0, 0) scale(1)' }, { transform: tf(to) }], { duration: STEP_MS, delay, easing: EASE, fill: 'forwards' }).finished;
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

		staging = { n: text.length, color: thief.color, filled: false, out: false };
		await tick();
		const cells = [...document.querySelectorAll<HTMLElement>('[data-stage-cell]')].map((el) => el.getBoundingClientRect());
		if (cells.length !== text.length) return;

		// 1. The word's letters rise to the staging row, in their own order.
		const letterClones: { el: HTMLElement; home: DOMRect; at: DOMRect }[] = [];
		if (srcId) {
			const victim = seatById.get(f.victim ?? f.by);
			const boxes = [...document.querySelectorAll<HTMLElement>(`[data-word="${srcId}"] [data-letter]`)];
			if (boxes.length === f.from!.length) {
				const color = victim?.color ?? '#888888';
				boxes.forEach((el, i) => letterClones.push({ el: cloneBox(el.getBoundingClientRect(), f.from![i], color, inkOn(color)), home: el.getBoundingClientRect(), at: cells[i] }));
				hiddenWord = srcId;
				await Promise.all(letterClones.map((c, i) => flyTo(c.el, c.home, null, cells[i])));
				await wait(STEP_MS);
			}
		}
		// 2. They re-sort into the new word while the tiles it used fly in from the grid.
		const tileClones = tiles.flatMap((t, j) => {
			const el = document.querySelector<HTMLElement>(`[data-tile="${t.id}"]`);
			if (!el || tileMap[j] < 0) return [];
			const home = el.getBoundingClientRect();
			return [{ el: cloneBox(home, t.c, 'var(--color-sun)', 'var(--color-stage)'), home, to: cells[tileMap[j]] }];
		});
		hiddenTiles = tiles.map((t) => t.id);
		await Promise.all([
			...letterClones.map((c, i) => (srcMap[i] >= 0 ? flyTo(c.el, c.home, c.at, cells[srcMap[i]]) : Promise.resolve())),
			...tileClones.map((c) => flyTo(c.el, c.home, null, c.to))
		]);
		// 3. The row takes the thief's colour, then the thief sweeps the word away.
		for (const c of [...letterClones, ...tileClones]) c.el.animate([{ background: thief.color, color: inkOn(thief.color) }], { duration: STEP_MS, fill: 'forwards' });
		if (staging) staging.filled = true;
		await wait(STEP_MS);
		const byIndex = new Map<number, HTMLElement>();
		letterClones.forEach((c, i) => srcMap[i] >= 0 && byIndex.set(srcMap[i], c.el));
		tileClones.forEach((c, j) => byIndex.set(tileMap[j], c.el));
		const sweep = document.createElement('span');
		sweep.textContent = thief.avatar;
		sweep.className = 'grid place-items-center';
		const size = cells[0].height * 1.15;
		Object.assign(sweep.style, { position: 'fixed', left: `${cells[0].left - size}px`, top: `${cells[0].top + cells[0].height / 2 - size / 2}px`, width: `${size}px`, height: `${size}px`, fontSize: `${size * 0.8}px`, zIndex: '51', opacity: '0', willChange: 'transform' });
		overlay.appendChild(sweep);
		clones.push(sweep);
		await sweep.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 150, fill: 'forwards' }).finished;
		for (let i = 0; i < cells.length; i++) {
			const dx = cells[i].left + cells[i].width / 2 - (cells[0].left - size / 2);
			sweep.animate([{ transform: `translateX(${dx}px)` }], { duration: 100, easing: 'linear', fill: 'forwards' });
			byIndex.get(i)?.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 100, fill: 'forwards' });
			await wait(100);
		}
		await sweep.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 100, fill: 'forwards' }).finished;
		// 4. The staging row drops away; the new word then appears in the list.
		if (staging) staging.out = true;
		await wait(STEP_MS);
		clearStage();
	}

	// ── Moves ────────────────────────────────────────────────────────────
	let input = $state('');
	let sending = $state(false);
	let error = $state<{ text: string; key: number } | null>(null);
	let inputEl = $state<HTMLInputElement>();

	// The round screen fits the space above the keyboard: the board scrolls, the word box stays put.
	let fit = $state(false);
	const fitRound = () => {
		fit = true;
		return () => (fit = false);
	};

	async function submit(e: SubmitEvent) {
		e.preventDefault();
		if (!client || !identity || sending || !live) return;
		const text = input.trim();
		if (!text) return;
		sending = true;
		const result = await client!.move(text);
		sending = false;
		if (result.ok) {
			input = '';
			error = null;
		} else {
			const key = Date.now();
			error = { text: result.message, key };
			setTimeout(() => error?.key === key && (error = null), 2_500);
			// The word box shakes its head (Pilfer's ±30px, six quick steps); the text stays to be fixed.
			if (!reduceMotion) inputEl?.animate([0, -30, 30, -30, 30, -30, 0].map((x) => ({ transform: `translateX(${x}px)` })), { duration: 600, easing: 'ease-in-out' });
		}
		inputEl?.focus();
	}

	const placeLabel = (n: number) => (n === 1 ? '1st' : n === 2 ? '2nd' : n === 3 ? '3rd' : `${n}th`);
</script>

<svelte:head><title>Word Heist · {code} — ZenCode</title></svelte:head>

<GameStage {fit}>
	<header class="sticky top-0 z-20 flex items-center gap-3 border-b border-white/10 bg-stage/85 px-4 py-3 backdrop-blur">
		<div class="min-w-0">
			<p class="font-display text-sm leading-tight font-bold tracking-[0.14em] uppercase">Word Heist</p>
			<p class="font-mono text-[11px] tracking-[0.2em] text-cream/50">
				{code}{#if session && session.round > 0} · {session.final ? 'Final' : `Round ${session.round}`}{/if}{#if me?.roomNumber && inRound} · Room {me.roomNumber}{/if}
			</p>
		</div>
		{#if offline}
			<span class="ml-auto inline-flex items-center gap-1 rounded-md bg-attention/15 px-2 py-1 text-xs font-semibold text-attention" role="status"><WifiOff class="size-3.5" /> Reconnecting…</span>
		{/if}
		{#if inRound && myEntry}
			<div class="{offline ? '' : 'ml-auto'} flex items-baseline gap-1 rounded-md border border-green-300/30 bg-forest-900/70 px-3 py-1.5" aria-live="polite">
				<XpCounter value={myEntry.score} class="font-display text-lg font-bold text-cream" />
				<span class="text-xs font-semibold text-cream/60">pts</span>
			</div>
		{/if}
	</header>

	<main class="mx-auto flex w-full max-w-4xl flex-1 flex-col px-3 sm:px-4 {fit ? 'min-h-0 pt-2 pb-2' : 'pt-5 pb-8'}">
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
			<div class="m-auto w-full max-w-md text-center">
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
				{#if ranking.length && me.round === session.round}
					<ol class="mt-8 space-y-1.5 text-left" aria-label="Room ranking">
						{#each ranking as r (r.playerId)}
							<li class="flex items-center gap-3 rounded-lg border px-4 py-2 {r.playerId === identity.playerId ? 'border-sun/60 bg-sun/10' : 'border-stage-line bg-stage-raised/80'}">
								<span class="w-6 font-mono text-sm text-cream/60 tabular">{r.rank}</span>
								<span class="min-w-0 flex-1 truncate font-semibold">{r.name}</span>
								<span class="font-display font-bold tabular">{r.score}</span>
							</li>
						{/each}
					</ol>
				{/if}
			</div>
		{:else if status === 'scoring' || (inRound && board?.status === 'finished')}
			<div class="m-auto text-center" role="status">
				<p class="font-display text-4xl font-bold uppercase">Round over</p>
				<p class="mt-3 flex items-center justify-center gap-2 text-cream/70"><Spinner class="size-4" /> Counting the scores…</p>
			</div>
		{:else if inRound && board && shown}
			<!-- ROUND (ready / playing / paused) -->
			<div class="relative -mx-3 flex min-h-0 flex-1 flex-col sm:-mx-4">
				<div class="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto overscroll-contain px-3 pb-3 sm:px-4" {@attach fitRound}>
					<!-- Tiles left / final countdown, and everyone's points -->
					<div class="flex items-center gap-3">
						<div class="relative grid size-12 shrink-0 place-items-center" role="timer" aria-label={clock?.finalCountdown ? `${formatClock(timeLeft)} left` : `${clock?.tilesLeft ?? board.tiles.count} tiles left`}>
							<svg viewBox="0 0 40 40" class="absolute inset-0 -rotate-90" aria-hidden="true">
								<circle cx="20" cy="20" r="16" fill="none" stroke="currentColor" stroke-width="5" class="text-stage-line" />
								<circle cx="20" cy="20" r="16" fill="none" stroke="currentColor" stroke-width="5" stroke-linecap="round" pathLength="100" stroke-dasharray="{ringLeft * 100} 100" class="transition-[stroke-dasharray] duration-300 {clock?.finalCountdown ? 'text-attention' : 'text-green-300'}" />
							</svg>
							<span class="relative font-display text-sm font-bold tabular {clock?.finalCountdown ? 'text-attention' : 'text-cream'}">
								{board.status === 'ready' ? board.tiles.count : clock?.finalCountdown ? Math.ceil(timeLeft / 1000) : (clock?.tilesLeft ?? board.tiles.count)}
							</span>
						</div>
						<ul class="flex min-w-0 flex-1 gap-3 overflow-x-auto py-1" aria-label="Players">
							{#each seats as p (p.id)}
								<li class="flex w-12 shrink-0 flex-col items-center gap-0.5" aria-label="{p.mine ? 'You' : p.name}: {p.score} points">
									<span
										class="relative grid size-10 place-items-center rounded-full text-xl"
										style="background: {p.color}26; box-shadow: 0 0 0 2.5px {p.color}{p.mine ? ', 0 0 16px ' + p.color + 'aa' : ''}"
									>
										<span aria-hidden="true">{p.avatar}</span>
										{#if deltas[p.id]}
											{#key deltas[p.id].key}
												<span
													class="absolute -top-2.5 left-1/2 -translate-x-1/2 rounded-full px-1.5 font-display text-[11px] font-bold whitespace-nowrap shadow {deltas[p.id].v > 0 ? 'bg-green-300 text-stage' : 'bg-attention text-white'}"
													in:fly={{ y: 6, duration: 220 }}
													out:fade={{ duration: 300 }}>{deltas[p.id].v > 0 ? '+' : ''}{deltas[p.id].v}</span
												>
											{/key}
										{/if}
									</span>
									<span class="min-w-6 rounded-full px-1.5 text-center font-display text-xs font-bold tabular" style="background: {p.color}; color: {inkOn(p.color)}">{p.score}</span>
									<span class="w-full truncate text-center text-[10px] text-cream/60">{p.mine ? 'You' : p.name}</span>
								</li>
							{/each}
						</ul>
					</div>

					<!-- The tiles: 7 to a row, each keeping its place until it is used -->
					<ul class="grid grid-cols-7 gap-1" aria-label="Letters — free for anyone to use" aria-live="polite">
						{#each slots as t, i (t ? `t${t.id}` : `e${i}`)}
							{#if t}
								<li
									data-tile={t.id}
									class="tile grid aspect-square place-items-center rounded bg-sun font-display text-2xl font-bold text-stage {hiddenTiles.includes(t.id) ? 'opacity-0' : ''}"
								>
									{t.c}
								</li>
							{:else}
								<li class="aspect-square rounded bg-stage-raised" aria-hidden="true"></li>
							{/if}
						{/each}
					</ul>

					<!-- Staging row: where a word being made comes together -->
					<div class="flex h-11 items-center justify-center gap-1" aria-hidden="true">
						{#if staging}
							{@const cell = Math.min(44, Math.floor((Math.min(window.innerWidth, 896) - 24 - (staging.n - 1) * 4) / staging.n))}
							{#each Array(staging.n) as _, i (i)}
								<span
									data-stage-cell
									class="rounded transition-[opacity,transform,background-color] duration-200 {staging.out ? 'translate-y-4 opacity-0' : ''}"
									style="width: {cell}px; height: {cell}px; background: {staging.filled ? staging.color : 'transparent'}"
								></span>
							{/each}
						{:else if board.status === 'ready'}
							<p class="text-sm text-cream/50">Waiting for the organiser to start…</p>
						{/if}
					</div>

					<!-- Everyone's words, in their owner's colour -->
					<ul class="flex flex-wrap justify-center gap-x-2 gap-y-1.5" aria-label="Words on the table">
						{#each tableWords as w (w.id)}
							<li
								data-word={w.id}
								in:scale={{ start: 0.75, duration: 320, easing: backOut }}
								class="flex gap-0.5 rounded px-0.5 py-0.5 {hiddenWord === w.id ? 'opacity-0' : ''}"
								style="background: {w.color}33"
							>
								<span class="sr-only">{w.text}, {w.mine ? 'yours' : (seatById.get(w.owner)?.name ?? '')}</span>
								{#each [...w.text] as c, i (i)}
									<span data-letter={i} aria-hidden="true" class="grid size-6 place-items-center rounded font-display text-sm font-bold sm:size-7 sm:text-base" style="background: {w.color}; color: {inkOn(w.color)}">{c}</span>
								{/each}
							</li>
						{/each}
					</ul>
				</div>

				<!-- Paused: everything stops behind a big pause mark -->
				{#if board.status === 'paused'}
					<div class="absolute inset-0 z-30 grid place-items-center bg-stage/75 backdrop-blur-[2px]" role="status" transition:fade={{ duration: 200 }}>
						<div class="text-center" in:scale={{ start: 0.7, duration: 300, easing: backOut }}>
							<Pause class="mx-auto size-32 text-cream" fill="currentColor" strokeWidth={0} />
							<p class="mt-2 font-display text-2xl font-bold tracking-[0.2em] text-cream uppercase">Paused</p>
						</div>
					</div>
				{/if}
			</div>

			<!-- Move: pinned under the board, just above the phone keyboard -->
			<form class="relative shrink-0 pt-2" onsubmit={submit} novalidate>
				{#if error}
					{#key error.key}
						<p class="absolute -top-8 left-0 right-0 text-center text-sm font-semibold text-attention" role="alert" in:fly={{ y: 6, duration: 200 }} out:fade={{ duration: 200 }}>{error.text}</p>
					{/key}
				{/if}
				<div class="flex gap-2">
						<input
							bind:this={inputEl}
							bind:value={input}
							maxlength="20"
							autocomplete="off"
							autocapitalize="characters"
							spellcheck="false"
							enterkeyhint="send"
							disabled={!live}
							placeholder={live ? 'Type a word and press enter' : board.status === 'paused' ? 'Paused' : 'Waiting to start…'}
							aria-label="Your word"
							class="h-14 min-w-0 flex-1 rounded-lg border-2 bg-stage px-4 font-mono text-xl font-bold tracking-[0.12em] text-cream uppercase outline-none transition-colors placeholder:font-sans placeholder:text-base placeholder:font-normal placeholder:tracking-normal placeholder:text-cream/30 placeholder:normal-case focus:border-green-300 disabled:opacity-50
								{error ? 'border-attention' : 'border-stage-line'}"
						/>
						<!-- preventDefault on press keeps focus in the word box, so the keyboard stays up -->
						<Button type="submit" variant="sun" size="xl" class="px-5!" loading={sending} disabled={!live || sending} onpointerdown={(e: PointerEvent) => e.preventDefault()}>Play</Button>
				</div>
			</form>
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
	/* A new tile drops in from above and settles with a small bounce (Pilfer's 0.8 s slide). */
	.tile {
		animation: tile-drop 0.8s cubic-bezier(0.45, 1.25, 0.8, 1) both;
	}
	@keyframes tile-drop {
		from {
			transform: translateY(-80vh);
		}
		to {
			transform: translateY(0);
		}
	}
	@media (prefers-reduced-motion: reduce) {
		.tile {
			animation: none;
		}
	}
</style>
