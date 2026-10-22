<script lang="ts">
	import { page } from '$app/state';
	import { fade, fly, scale } from 'svelte/transition';
	import { flip } from 'svelte/animate';
	import { Timer, Trophy, Pause, Wifi, WifiOff, X, Sparkles, Hourglass, Crown, Medal } from '@lucide/svelte';
	import { serverNow } from '$lib/games/tech-word-rush/api';
	import { CODE_RE, WARNING_SECONDS, formatClock } from '$lib/games/word-heist/types';
	import { letterDiff, normalizeWord, rankBoard } from '$lib/games/word-heist/engine';
	import { HeistClient } from '$lib/games/word-heist/client.svelte';
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
	const me = $derived(client?.me ?? null);
	const board = $derived(client?.board ?? null);
	const identity = $derived(client?.identity ?? null);
	const loadState = $derived(!client || client.load === 'missing' ? 'missing' : client.load);
	const offline = $derived(!!client && client.status !== 'open' && client.status !== 'connecting');

	// ── Join ─────────────────────────────────────────────────────────────
	let name = $state('');
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
			await client.join(name);
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
	const timeLeft = $derived(board?.endsAt ? Math.max(0, board.endsAt - now) : board?.pausedRemainingMs ?? 0);
	const live = $derived(board?.status === 'playing' && timeLeft > 0);
	const warning = $derived(live && timeLeft <= WARNING_SECONDS * 1000);

	type Tile = { id: string; text: string; owner: string; ownerName: string; mine: boolean };
	const tiles = $derived.by<Tile[]>(() => {
		if (!board) return [];
		const b = board;
		return Object.entries(b.words)
			.map(([id, w]) => ({ id, text: w.text, owner: w.owner, ownerName: b.players[w.owner]?.name ?? '—', mine: w.owner === identity?.playerId }))
			.sort((a, b2) => b2.text.length - a.text.length || a.text.localeCompare(b2.text));
	});
	const myTiles = $derived(tiles.filter((t) => t.mine));
	const otherTiles = $derived(tiles.filter((t) => !t.mine));

	// ── Moves ────────────────────────────────────────────────────────────
	let selectedId = $state<string | null>(null);
	const selected = $derived(selectedId ? (tiles.find((t) => t.id === selectedId) ?? null) : null);
	let input = $state('');
	let sending = $state(false);
	let feedback = $state<{ tone: 'ok' | 'error'; text: string } | null>(null);
	let inputEl = $state<HTMLInputElement>();

	// A selected word can vanish when someone steals it first.
	$effect(() => {
		if (selectedId && !tiles.some((t) => t.id === selectedId)) {
			selectedId = null;
			feedback = { tone: 'error', text: 'That word was just taken. Pick another.' };
		}
	});

	const typed = $derived(normalizeWord(input) ?? input.toUpperCase().replace(/[^A-Z]/g, ''));
	const diff = $derived(selected && typed ? letterDiff(selected.text, typed) : null);
	const sourceLetters = $derived.by(() => {
		if (!selected) return [];
		const used = new Map<string, number>();
		for (const c of typed) used.set(c, (used.get(c) ?? 0) + 1);
		return [...selected.text].map((c) => {
			const n = used.get(c) ?? 0;
			if (n > 0) used.set(c, n - 1);
			return { c, used: n > 0 };
		});
	});

	function pick(t: Tile) {
		feedback = null;
		selectedId = selectedId === t.id ? null : t.id;
		if (selectedId) input = '';
		inputEl?.focus();
	}

	async function submit(e: SubmitEvent) {
		e.preventDefault();
		if (!client || !identity || sending || !live) return;
		const text = input.trim();
		if (!text) {
			feedback = { tone: 'error', text: selected ? `Type a word that uses every letter of ${selected.text}.` : 'Type a word.' };
			return;
		}
		sending = true;
		feedback = null;
		const result = await client!.move(selected ? 'steal' : 'create', text, selected?.id);
		sending = false;
		if (result.ok) {
			feedback = { tone: 'ok', text: result.message };
			input = '';
			selectedId = null;
			celebrate(result.gained ?? 0);
		} else {
			feedback = { tone: 'error', text: result.message };
		}
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

<GameStage>
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
				<span class="text-xs font-semibold text-cream/60">pts · #{myEntry.rank}</span>
				{#if burst}
					{#key burst.id}
						<span class="absolute -bottom-7 right-2 font-display text-base font-bold text-green-300" in:fly={{ y: -8, duration: 260 }} out:fade={{ duration: 300 }}>{burst.text}</span>
					{/key}
				{/if}
			</div>
		{/if}
	</header>

	<main class="mx-auto flex w-full max-w-2xl flex-1 flex-col px-4 pt-5 pb-8">
		{#if loadState === 'loading'}
			<div class="m-auto flex items-center gap-3 text-cream/70" role="status"><Spinner /> {offline ? 'Reconnecting…' : 'Loading tournament…'}</div>
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
					<p class="eyebrow text-green-300">Tournament {code}</p>
					<p class="mt-3 font-display text-3xl font-bold uppercase">This tournament has finished</p>
				</div>
			{:else if !session.registrationOpen}
				<div class="m-auto text-center">
					<p class="eyebrow text-green-300">Tournament {code}</p>
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
						<Button type="submit" variant="sun" size="xl" class="w-full" loading={joining}>{joining ? 'Joining…' : 'Join tournament'}</Button>
					</form>
					<p class="mt-4 text-center text-xs text-cream/40">No sign-up needed. Your name is only used for this tournament.</p>
				</div>
			{/if}
		{:else if !me}
			<div class="m-auto flex items-center gap-3 text-cream/70" role="status"><Spinner /> Loading your place…</div>
		{:else if me.status === 'removed'}
			<div class="m-auto text-center" role="alert">
				<p class="font-display text-3xl font-bold uppercase">You've been removed</p>
				<p class="mt-2 text-cream/60">An organiser removed you from this tournament.</p>
			</div>
		{:else if me.status === 'reserve'}
			<div class="m-auto text-center">
				<p class="font-display text-4xl font-bold uppercase">You're on the reserve list</p>
				<p class="mt-3 text-cream/70">Rooms were locked before you registered, {identity.name}. Organisers can see you're here.</p>
			</div>
		{:else if status === 'lobby' || (status === 'ready' && !inRound && me.status === 'lobby')}
			<!-- LOBBY -->
			<div class="m-auto text-center">
				<p class="font-display text-5xl font-bold tracking-tight uppercase" in:scale={{ start: 0.85, duration: 400 }}>You're in.</p>
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
					<p class="mt-2 text-cream/70">Top two in Room {me.roomNumber}. Next round rooms are being prepared — stay on this page.</p>
				{:else if me.status === 'tied'}
					<Hourglass class="mx-auto size-12 text-sun" />
					<p class="mt-3 font-display text-3xl font-bold uppercase">Tied at the cutoff</p>
					<p class="mt-2 text-cream/70">You're level with another player on every tie-break. An organiser is deciding.</p>
				{:else}
					<p class="font-display text-3xl font-bold uppercase">Thanks for playing</p>
					<p class="mt-2 text-cream/70">You didn't make the top two this time{myEntry ? ` — you finished #${myEntry.rank} in Room ${me.roomNumber}` : ''}.</p>
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
			<!-- ROUND (ready / playing / paused) -->
			<div class="flex flex-col gap-4">
				<div
					class="flex items-center gap-3 rounded-lg border px-4 py-3 transition-colors duration-300 {warning ? 'border-attention/60 bg-attention/10' : 'border-stage-line bg-stage-raised/80'}"
					role="timer"
					aria-label="{formatClock(timeLeft)} left"
				>
					<Timer class="size-5 {warning ? 'text-attention' : 'text-green-300'}" />
					<span class="font-display text-3xl font-bold tabular {warning ? 'text-attention' : 'text-cream'}">{board.status === 'ready' ? formatClock(board.rules.roundSeconds * 1000) : formatClock(timeLeft)}</span>
					<span class="ml-auto text-sm text-cream/60">
						{#if board.status === 'ready'}Waiting for the start…{:else if board.status === 'paused'}Paused{:else if warning}Last {WARNING_SECONDS} seconds!{:else}Room {board.number}{/if}
					</span>
				</div>

				{#if alert}
					<p class="rounded-lg border border-attention/40 bg-attention/10 px-4 py-2 text-sm font-semibold text-attention" in:fly={{ y: -8, duration: 200 }} out:fade role="alert">{alert.text}</p>
				{/if}

				<!-- Move editor -->
				<form class="rounded-xl border border-stage-line bg-stage-raised/80 p-4" onsubmit={submit} novalidate>
					<div class="flex items-center justify-between gap-2">
						<p class="eyebrow text-cream/60">
							{#if selected}{selected.mine ? 'Extend your word' : `Steal from ${selected.ownerName}`}{:else}Make a new word ({board.rules.minWordLength}–{board.rules.maxCreateLength} letters){/if}
						</p>
						{#if selected}
							<button type="button" class="inline-flex items-center gap-1 rounded px-2 py-1 text-xs text-cream/60 hover:text-cream" onclick={() => (selectedId = null)}><X class="size-3.5" /> Clear</button>
						{/if}
					</div>
					{#if selected}
						<div class="mt-3 flex flex-wrap gap-1.5" aria-label="Letters you must keep">
							{#each sourceLetters as l, i (i)}
								<button
									type="button"
									onclick={() => (input = (input + l.c).toUpperCase())}
									class="grid size-10 place-items-center rounded-md border-2 font-display text-lg font-bold transition-colors {l.used ? 'border-green-300 bg-forest-900 text-green-300' : 'border-stage-line bg-stage text-cream/80'}"
									aria-label="Add {l.c}"
								>{l.c}</button>
							{/each}
						</div>
						<p class="mt-2 text-xs text-cream/50">Use all of {selected.text}'s letters in any order, plus at least one more. Plurals don't count.</p>
					{/if}
					<div class="mt-3 flex gap-2">
						<input
							bind:this={inputEl}
							bind:value={input}
							maxlength="20"
							autocomplete="off"
							autocapitalize="characters"
							spellcheck="false"
							enterkeyhint="send"
							disabled={!live}
							placeholder={selected ? `${selected.text} + letters` : 'Type a word'}
							aria-label={selected ? `New word using ${selected.text}` : 'New word'}
							aria-describedby="move-feedback"
							class="h-14 min-w-0 flex-1 rounded-lg border-2 bg-stage px-4 font-mono text-xl font-bold tracking-[0.12em] text-cream uppercase outline-none transition-colors placeholder:font-sans placeholder:text-base placeholder:font-normal placeholder:tracking-normal placeholder:text-cream/30 placeholder:normal-case focus:border-green-300 disabled:opacity-50
								{feedback?.tone === 'error' ? 'border-attention' : 'border-stage-line'}"
						/>
						<Button type="submit" variant="sun" size="xl" class="px-5!" loading={sending} disabled={!live || sending}>{selected ? (selected.mine ? 'Extend' : 'Steal') : 'Make'}</Button>
					</div>
					{#if diff && (diff.missing.length || !diff.added.length)}
						<p class="mt-2 text-xs text-cream/60">
							{#if diff.missing.length}Still need: <span class="font-mono font-semibold text-sun">{diff.missing.join(' ')}</span>{:else}Add at least one more letter.{/if}
						</p>
					{/if}
					<div id="move-feedback" aria-live="assertive" class="min-h-6 pt-2">
						{#if feedback}
							<p class="text-sm {feedback.tone === 'ok' ? 'text-green-300' : 'text-attention'}" in:fly={{ y: -6, duration: 200 }}>{feedback.text}</p>
						{/if}
					</div>
					{#if board.status === 'paused'}
						<p class="flex items-center gap-2 text-sm text-sun" role="status"><Pause class="size-4" /> The organiser paused the round.</p>
					{:else if board.status === 'ready'}
						<p class="text-sm text-cream/60">Your starter words are below. Moves open when the round starts.</p>
					{/if}
				</form>

				<!-- Board -->
				<section aria-labelledby="mine-h">
					<h2 id="mine-h" class="eyebrow mb-2 text-cream/60">Your words · {myTiles.reduce((n, t) => n + t.text.length, 0)} pts</h2>
					<ul class="flex flex-wrap gap-2">
						{#each myTiles as t (t.id)}
							<li animate:flip={{ duration: 250 }} in:scale={{ start: 0.6, duration: 300 }}>
								<button
									type="button"
									onclick={() => pick(t)}
									aria-pressed={selectedId === t.id}
									class="rounded-lg border-2 px-3 py-2 font-display text-lg font-bold tracking-wider transition-colors {selectedId === t.id ? 'border-sun bg-sun/15 text-sun' : 'border-green-300/50 bg-forest-900 text-cream hover:border-green-300'}"
								>{t.text} <span class="text-xs font-semibold text-cream/50">{t.text.length}</span></button>
							</li>
						{:else}
							<li class="text-sm text-cream/50">No words — make one or steal one.</li>
						{/each}
					</ul>
				</section>

				<section aria-labelledby="room-h">
					<h2 id="room-h" class="eyebrow mb-2 text-cream/60">Room words — tap one to steal it</h2>
					<ul class="flex flex-wrap gap-2">
						{#each otherTiles as t (t.id)}
							<li animate:flip={{ duration: 250 }} in:scale={{ start: 0.6, duration: 300 }}>
								<button
									type="button"
									onclick={() => pick(t)}
									aria-pressed={selectedId === t.id}
									class="rounded-lg border-2 px-3 py-1.5 text-left transition-colors {selectedId === t.id ? 'border-sun bg-sun/15' : 'border-stage-line bg-stage-raised hover:border-cream/40'}"
								>
									<span class="block font-display text-lg font-bold tracking-wider {selectedId === t.id ? 'text-sun' : 'text-cream'}">{t.text}</span>
									<span class="block max-w-28 truncate text-[11px] text-cream/50">{t.ownerName}</span>
								</button>
							</li>
						{/each}
					</ul>
				</section>

				<div class="grid gap-4 sm:grid-cols-2">
					<section class="rounded-xl border border-stage-line bg-stage-raised/80 p-4" aria-labelledby="rank-h">
						<h2 id="rank-h" class="eyebrow mb-2 flex items-center gap-1.5 text-cream/60"><Trophy class="size-3.5" /> Room {board.number} ranking</h2>
						<ol class="space-y-1">
							{#each ranking as r (r.playerId)}
								<li animate:flip={{ duration: 400 }} class="flex items-center gap-2 rounded px-2 py-1 text-sm {r.playerId === identity.playerId ? 'bg-sun/10 text-sun' : ''}">
									<span class="w-5 font-mono text-cream/50 tabular">{r.rank}</span>
									<span class="min-w-0 flex-1 truncate">{r.name}</span>
									{#if r.rank <= 2}<span class="text-[10px] font-semibold text-green-300 uppercase">{session.final ? '' : 'advancing'}</span>{/if}
									<span class="font-semibold tabular">{r.score}</span>
								</li>
							{/each}
						</ol>
					</section>
					<section class="rounded-xl border border-stage-line bg-stage-raised/80 p-4" aria-labelledby="feed-h">
						<h2 id="feed-h" class="eyebrow mb-2 text-cream/60">Recent moves</h2>
						<ul class="space-y-1 text-sm">
							{#each board.feed.slice(0, 8) as f (f.seq)}
								<li in:fly={{ y: -6, duration: 220 }} class="truncate text-cream/80">
									<span class="font-semibold text-cream">{f.byName}</span>
									{#if f.kind === 'create'}made <span class="font-mono font-semibold text-green-300">{f.text}</span>
									{:else if f.kind === 'extend'}grew <span class="font-mono">{f.from}</span> → <span class="font-mono font-semibold text-green-300">{f.text}</span>
									{:else}stole <span class="font-mono">{f.from}</span> → <span class="font-mono font-semibold text-sun">{f.text}</span>{#if f.victimName}<span class="text-cream/50"> from {f.victimName}</span>{/if}{/if}
								</li>
							{:else}
								<li class="text-cream/50">No moves yet.</li>
							{/each}
						</ul>
					</section>
				</div>
			</div>
		{:else}
			<div class="m-auto text-center" role="status">
				<Wifi class="mx-auto size-8 text-cream/40" />
				<p class="mt-3 text-lg text-cream/70">Waiting for the organisers…</p>
			</div>
		{/if}
	</main>
</GameStage>
