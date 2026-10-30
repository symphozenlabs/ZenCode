<script lang="ts">
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import { fade, fly, scale } from 'svelte/transition';
	import { Timer, Pause, Wifi, WifiOff, Sparkles, Hourglass, Crown, Medal, DoorClosed } from '@lucide/svelte';
	import { serverNow } from '$lib/games/tech-word-rush/api';
	import { CODE_RE, formatClock } from '$lib/games/word-heist/types';
	import { rankBoard, roundClock } from '$lib/games/word-heist/engine';
	import { HeistClient } from '$lib/games/word-heist/client.svelte';
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
	/** 0 → 1 as the next tile gets closer. */
	const tileProgress = $derived(board && clock?.nextTileAt ? Math.min(1, Math.max(0, 1 - (clock.nextTileAt - now) / board.tiles.everyMs)) : 0);

	// ── The table: everyone's avatar, colour and points; words in their colour ──
	type Seat = { id: string; name: string; score: number; avatar: string; color: string; mine: boolean };
	const seats = $derived.by<Seat[]>(() => {
		if (!board) return [];
		return Object.entries(board.players)
			.map(([id, p], i) => ({ id, p, seat: p.seat ?? i }))
			.filter(({ p }) => !p.removed)
			.sort((a, b) => a.seat - b.seat)
			.map(({ id, p, seat }) => ({ id, name: p.name, score: p.score, avatar: avatarOf(p.avatar ?? seat), color: colorOf(seat), mine: id === identity?.playerId }));
	});
	// You top-left; everyone else alternates right, left, right… (like two sides of a table).
	const others = $derived(seats.filter((p) => !p.mine));
	const leftSeats = $derived([...seats.filter((p) => p.mine), ...others.filter((_, i) => i % 2 === 1)]);
	const rightSeats = $derived(others.filter((_, i) => i % 2 === 0));
	const seatById = $derived(new Map(seats.map((p) => [p.id, p])));

	/** Tap an avatar to light up that player's words. */
	let focusId = $state<string | null>(null);
	/** Words just made or stolen glow for a moment. */
	const FRESH_MS = 2_500;
	const tableWords = $derived.by(() => {
		if (!board) return [];
		return Object.entries(board.words)
			.sort(([, a], [, b]) => a.at - b.at)
			.map(([id, w]) => {
				const owner = seatById.get(w.owner);
				return { id, text: w.text, owner: w.owner, ownerName: owner?.name ?? '—', color: owner?.color ?? '#888888', mine: w.owner === identity?.playerId, fresh: now - w.at < FRESH_MS };
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

	// ── Moves ────────────────────────────────────────────────────────────
	let input = $state('');
	let sending = $state(false);
	let feedback = $state<{ tone: 'ok' | 'error'; text: string } | null>(null);
	let inputEl = $state<HTMLInputElement>();
	/** While the word box has focus (the phone keyboard is up), drop the help line to save room. */
	let typing = $state(false);

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
		if (!text) {
			feedback = { tone: 'error', text: 'Type a word.' };
			return;
		}
		sending = true;
		feedback = null;
		const result = await client!.move(text);
		sending = false;
		if (result.ok) {
			feedback = { tone: 'ok', text: result.message };
			input = '';
			celebrate(result.gained ?? 0);
		} else {
			feedback = { tone: 'error', text: result.message };
		}
		inputEl?.focus();
	}

	let burst = $state<{ id: number; text: string } | null>(null);
	function celebrate(points: number) {
		const id = Date.now();
		burst = { id, text: `+${points}` };
		setTimeout(() => burst?.id === id && (burst = null), 1400);
	}

	// Tell the player when someone steals from them.
	let alert = $state<{ id: number; text: string } | null>(null);
	let seenSeq = 0;
	$effect(() => {
		const latest = board?.feed[0];
		if (!latest || !identity) return;
		if (seenSeq && latest.seq > seenSeq) {
			const hits = board!.feed.filter((f) => f.seq > seenSeq && f.victim === identity!.playerId);
			if (hits.length) {
				const h = hits[0];
				alert = { id: h.seq, text: `${h.byName} stole ${h.from} → ${h.text}` };
				setTimeout(() => alert?.id === h.seq && (alert = null), 3500);
			}
		}
		seenSeq = latest.seq;
	});

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
			<div class="relative {offline ? '' : 'ml-auto'} flex items-baseline gap-1 rounded-md border border-green-300/30 bg-forest-900/70 px-3 py-1.5" aria-live="polite">
				<XpCounter value={myEntry.score} class="font-display text-lg font-bold text-cream" />
				<span class="text-xs font-semibold text-cream/60">pts</span>
				{#if burst}
					{#key burst.id}
						<span class="absolute -bottom-7 right-2 font-display text-base font-bold text-green-300" in:fly={{ y: -8, duration: 260 }} out:fade={{ duration: 300 }}>{burst.text}</span>
					{/key}
				{/if}
			</div>
		{/if}
	</header>

	<main class="mx-auto flex w-full max-w-4xl flex-1 flex-col px-3 sm:px-4 {fit ? 'min-h-0 pt-3 pb-3' : 'pt-5 pb-8'}">
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
		{:else if inRound && board}
			<!-- ROUND (ready / playing / paused): avatars down both sides, the table in the middle -->
			{#snippet seat(p: Seat)}
				<button
					type="button"
					onclick={() => (focusId = focusId === p.id ? null : p.id)}
					aria-pressed={focusId === p.id}
					aria-label="{p.mine ? 'You' : p.name}: {p.score} points. Show their words."
					class="flex w-full flex-col items-center gap-1 rounded-lg py-1 transition-opacity {focusId && focusId !== p.id ? 'opacity-45' : ''}"
				>
					<span
						class="relative grid size-11 place-items-center rounded-full text-2xl sm:size-14 sm:text-3xl"
						style="background: {p.color}26; box-shadow: 0 0 0 3px {p.color}{p.mine ? ', 0 0 18px ' + p.color + '99' : ''}"
					>
						<span aria-hidden="true">{p.avatar}</span>
						{#if deltas[p.id]}
							{#key deltas[p.id].key}
								<span
									class="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full px-1.5 font-display text-xs font-bold whitespace-nowrap shadow {deltas[p.id].v > 0 ? 'bg-green-300 text-stage' : 'bg-attention text-white'}"
									in:fly={{ y: 6, duration: 220 }}
									out:fade={{ duration: 300 }}>{deltas[p.id].v > 0 ? '+' : ''}{deltas[p.id].v}</span
								>
							{/key}
						{/if}
					</span>
					<span class="w-full truncate text-center text-[10px] font-semibold text-cream/80 sm:text-xs">{p.mine ? 'You' : p.name}</span>
					<span class="min-w-7 rounded-full px-1.5 text-center font-display text-sm font-bold tabular" style="background: {p.color}; color: {inkOn(p.color)}">{p.score}</span>
				</button>
			{/snippet}

			<div class="-mx-3 min-h-0 flex-1 overflow-y-auto overscroll-contain px-3 pb-3 sm:-mx-4 sm:px-4" {@attach fitRound}>
				<div class="grid grid-cols-[3.25rem_minmax(0,1fr)_3.25rem] gap-2 sm:grid-cols-[5rem_minmax(0,1fr)_5rem] sm:gap-4">
					<aside class="flex flex-col gap-3" aria-label="Players">
						{#each leftSeats as p (p.id)}{@render seat(p)}{/each}
					</aside>

					<div class="flex min-w-0 flex-col gap-4">
						{#if board.status === 'ready' && board.round > 1}
							<p class="rounded-lg border border-green-300/40 bg-green-300/10 px-4 py-3 text-sm font-semibold text-green-300" role="status" in:fly={{ y: -8, duration: 300 }}>
								You're through to {session.final ? 'the final' : `stage ${board.round}`}! This is your new room (Room {board.number}) — the organiser will start it when everyone's ready.
							</p>
						{/if}
						<!-- Tiles left / final countdown -->
						<div
							class="rounded-lg border px-4 py-3 transition-colors duration-300 {clock?.finalCountdown ? 'border-attention/60 bg-attention/10' : 'border-stage-line bg-stage-raised/80'}"
							role="timer"
							aria-label={clock?.finalCountdown ? `${formatClock(timeLeft)} left` : `${clock?.tilesLeft ?? board.tiles.count} tiles left`}
						>
							<div class="flex items-center gap-3">
								<Timer class="size-5 shrink-0 {clock?.finalCountdown ? 'text-attention' : 'text-green-300'}" />
								{#if board.status === 'ready'}
									<span class="font-display text-2xl font-bold tabular text-cream">{board.tiles.count} tiles</span>
									<span class="ml-auto text-sm text-cream/60">Waiting for the organiser to start…</span>
								{:else if clock?.finalCountdown}
									<span class="font-display text-3xl font-bold tabular text-attention">{formatClock(timeLeft)}</span>
									<span class="ml-auto text-right text-sm font-semibold text-attention">{board.status === 'paused' ? 'Paused' : 'No tiles left — last chance!'}</span>
								{:else}
									<span class="font-display text-3xl font-bold tabular text-cream">{clock?.tilesLeft ?? board.tiles.count}</span>
									<span class="text-xs font-semibold tracking-[0.14em] text-cream/50 uppercase">tiles left</span>
									<span class="ml-auto text-sm text-cream/60">{board.status === 'paused' ? 'Paused' : formatClock(timeLeft)}</span>
								{/if}
							</div>
							{#if board.status === 'playing' && clock && !clock.finalCountdown}
								<div class="mt-2 h-1 overflow-hidden rounded-full bg-stage" aria-hidden="true">
									<div class="h-full rounded-full bg-sun" style="width: {tileProgress * 100}%"></div>
								</div>
							{/if}
						</div>

						{#if alert}
							<p class="rounded-lg border border-attention/40 bg-attention/10 px-4 py-2 text-sm font-semibold text-attention" in:fly={{ y: -8, duration: 200 }} out:fade role="alert">{alert.text}</p>
						{/if}

						<!-- Shared letters -->
						<section aria-label="Letters — free for anyone to use">
							<ul class="flex min-h-12 flex-wrap justify-center gap-1.5" aria-live="polite">
								{#each board.pool as t (t.id)}
									<li
										in:fly={{ y: -24, duration: 320 }}
										out:scale={{ start: 0.5, duration: 180 }}
										class="grid size-10 place-items-center rounded-md border-b-4 border-sun/60 bg-sun font-display text-xl font-bold text-stage shadow-sm sm:size-11"
									>
										{t.c}
									</li>
								{:else}
									<li class="self-center text-center text-sm text-cream/50">
										{board.status === 'ready' ? `Letters drop here every ${(board.tiles.everyMs / 1000).toFixed(1)} s once the round starts.` : 'The next letter is on its way.'}
									</li>
								{/each}
							</ul>
						</section>

						<!-- Everyone's words, in their owner's colour -->
						<section class="min-h-24 rounded-xl border border-stage-line bg-stage-raised/60 p-3" aria-label="Words on the table">
							<ul class="flex flex-wrap justify-center gap-x-3 gap-y-2.5">
								{#each tableWords as w (w.id)}
									<li
										in:scale={{ start: 0.6, duration: 260 }}
										title="{w.mine ? 'Your' : `${w.ownerName}'s`} word"
										class="flex gap-0.5 rounded-md p-0.5 transition-opacity duration-200 {w.fresh ? 'word-fresh' : ''} {focusId && focusId !== w.owner ? 'opacity-25' : ''}"
										style="--ring: {w.color}; {focusId === w.owner ? `box-shadow: 0 0 0 2px ${w.color}` : ''}"
									>
										<span class="sr-only">{w.text}, {w.mine ? 'yours' : w.ownerName}</span>
										{#each [...w.text] as c, i (i)}
											<span aria-hidden="true" class="grid size-7 place-items-center rounded font-display text-base font-bold sm:size-8 sm:text-lg" style="background: {w.color}; color: {inkOn(w.color)}">{c}</span>
										{/each}
									</li>
								{:else}
									<li class="self-center py-6 text-sm text-cream/50">Words people make appear here, in their colour.</li>
								{/each}
							</ul>
						</section>
					</div>

					<aside class="flex flex-col gap-3" aria-label="Players">
						{#each rightSeats as p (p.id)}{@render seat(p)}{/each}
					</aside>
				</div>
			</div>

			<!-- Move: pinned under the board, just above the phone keyboard -->
			<form class="shrink-0 rounded-xl border border-stage-line bg-stage-raised/90 p-3 sm:mx-[6rem] sm:p-4" onsubmit={submit} novalidate>
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
						placeholder="Type a word and press enter"
						aria-label="Your word"
						aria-describedby="move-help move-feedback"
						onfocus={() => (typing = true)}
						onblur={() => (typing = false)}
						class="h-14 min-w-0 flex-1 rounded-lg border-2 bg-stage px-4 font-mono text-xl font-bold tracking-[0.12em] text-cream uppercase outline-none transition-colors placeholder:font-sans placeholder:text-base placeholder:font-normal placeholder:tracking-normal placeholder:text-cream/30 placeholder:normal-case focus:border-green-300 disabled:opacity-50
							{feedback?.tone === 'error' ? 'border-attention' : 'border-stage-line'}"
					/>
					<!-- preventDefault on press keeps focus in the word box, so the keyboard stays up -->
					<Button type="submit" variant="sun" size="xl" class="px-5!" loading={sending} disabled={!live || sending} onpointerdown={(e: PointerEvent) => e.preventDefault()}>Play</Button>
				</div>
				<p id="move-help" class="mt-2 text-xs text-cream/50 {typing ? 'max-sm:hidden' : ''}">
					Make a word ({board.rules.minWordLength}+ letters) from the letters, or steal any word by adding at least one letter to it. Adding just an S to the end doesn't count.
				</p>
				<div id="move-feedback" aria-live="assertive" class="min-h-6 pt-2">
					{#if feedback}
						<p class="text-sm {feedback.tone === 'ok' ? 'text-green-300' : 'text-attention'}" in:fly={{ y: -6, duration: 200 }}>{feedback.text}</p>
					{/if}
				</div>
				{#if board.status === 'paused'}
					<p class="flex items-center gap-2 text-sm text-sun" role="status"><Pause class="size-4" /> The organiser paused the round.</p>
				{:else if board.status === 'ready'}
					<p class="text-sm text-cream/60">Everyone starts on 0. Moves open when the round starts.</p>
				{/if}
			</form>
		{:else}
			<div class="m-auto text-center" role="status">
				<Wifi class="mx-auto size-8 text-cream/40" />
				<p class="mt-3 text-lg text-cream/70">Waiting for the organisers…</p>
			</div>
		{/if}
	</main>
</GameStage>

<style>
	/* A word just made or stolen pulses in its owner's colour. */
	.word-fresh {
		animation: word-fresh 0.9s ease-out 2;
	}
	@keyframes word-fresh {
		0% {
			box-shadow: 0 0 0 0 var(--ring);
		}
		100% {
			box-shadow: 0 0 0 10px transparent;
		}
	}
</style>
