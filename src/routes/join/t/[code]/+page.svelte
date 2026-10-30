<script lang="ts">
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import { doc, onSnapshot } from 'firebase/firestore';
	import { fade, fly, scale } from 'svelte/transition';
	import { CloudOff, Crown, Medal, Sparkles, DoorClosed, Play, Hourglass } from '@lucide/svelte';
	import { db } from '$lib/firebase/client';
	import { SESSIONS } from '$lib/games/tech-word-rush/types';
	import { CODE_RE, GAME_TYPE, type TournamentPlayer, type TournamentSession } from '$lib/games/tournament/types';
	import { enterRoom, forgetIdentity, join, loadIdentity, state as checkState, type Identity } from '$lib/games/tournament/api';
	import { gameName } from '$lib/games/registry';
	import GameStage from '$lib/components/games/GameStage.svelte';
	import XpCounter from '$lib/components/games/XpCounter.svelte';
	import Logo from '$lib/components/site/Logo.svelte';
	import Button from '$lib/components/ui/Button.svelte';
	import Spinner from '$lib/components/ui/Spinner.svelte';

	/**
	 * A participant's tournament screen: register once, then be sent into
	 * each stage's game (the game's own phone screen) and come back here for
	 * the result. Everything shown comes from the public tournament doc and
	 * this player's own doc.
	 */
	const code = $derived((page.params.code ?? '').toUpperCase());

	let session = $state<TournamentSession | null>(null);
	let loadState = $state<'loading' | 'ready' | 'missing' | 'error'>('loading');
	let attempt = $state(0);
	$effect(() => {
		attempt;
		const c = code;
		loadState = 'loading';
		if (!CODE_RE.test(c)) {
			loadState = 'missing';
			return;
		}
		return onSnapshot(
			doc(db(), SESSIONS, c),
			(snap) => {
				const s = snap.data() as TournamentSession | undefined;
				session = s?.gameType === GAME_TYPE ? s : null;
				loadState = session ? 'ready' : 'missing';
			},
			() => (loadState = 'error')
		);
	});

	// ── Identity (device token, no account) ──────────────────────────────
	let identity = $state<Identity | null>(null);
	let resuming = $state(true);
	let me = $state<TournamentPlayer | null>(null);
	$effect(() => {
		const c = code;
		const saved = loadIdentity(c);
		if (!saved) {
			resuming = false;
			return;
		}
		checkState(c, saved)
			.then(() => (identity = saved))
			.catch((err) => {
				if (err.status === 401) forgetIdentity(c);
				else identity = saved; // network blip: the listeners catch up
			})
			.finally(() => (resuming = false));
	});
	$effect(() => {
		if (!identity) return;
		return onSnapshot(doc(db(), SESSIONS, code, 'players', identity.playerId), (snap) => {
			me = snap.exists() ? (snap.data() as TournamentPlayer) : null;
		});
	});

	let name = $state('');
	let joining = $state(false);
	let joinError = $state('');
	async function submitJoin(e: SubmitEvent) {
		e.preventDefault();
		if (joining) return;
		if (!name.trim()) {
			joinError = 'Enter a display name.';
			return;
		}
		joining = true;
		joinError = '';
		try {
			identity = await join(code, name);
		} catch (err) {
			joinError = (err as Error).message || 'Unable to join.';
		} finally {
			joining = false;
		}
	}

	// ── My room: the game I'm seated in this stage ───────────────────────
	const status = $derived(session?.status ?? 'lobby');
	const closed = $derived(!!session?.closed);
	const game = $derived(session ? gameName(session.game) : '');
	const myRoom = $derived(me?.status === 'playing' && me.room && session?.status === 'stage' && me.stage === session.stage ? me.room : null);
	let roomStatus = $state<string | null>(null);
	$effect(() => {
		const r = myRoom;
		roomStatus = null;
		if (!r) return;
		return onSnapshot(doc(db(), SESSIONS, r), (snap) => (roomStatus = (snap.data()?.status as string | undefined) ?? null));
	});
	/** The room's game is open: go and play (its own screen takes over). */
	const canPlay = $derived(!!myRoom && roomStatus !== null && roomStatus !== 'finished');
	function play() {
		if (!myRoom || !identity || !session) return;
		goto(enterRoom(session.game, myRoom, identity));
	}
	// Go in on your own a moment after being seated, once per room.
	let autoEntered = $state<string | null>(null);
	$effect(() => {
		if (!canPlay || !myRoom || autoEntered === myRoom) return;
		const room = myRoom;
		const t = setTimeout(() => {
			autoEntered = room;
			play();
		}, 2500);
		return () => clearTimeout(t);
	});

	// Closed: everyone goes home.
	$effect(() => {
		if (!closed) return;
		const t = setTimeout(() => goto('/'), 3_000);
		return () => clearTimeout(t);
	});

	const placeLabel = (n: number) => (n === 1 ? '1st' : n === 2 ? '2nd' : n === 3 ? '3rd' : `${n}th`);
	const roomWord = $derived(session?.format === 'rooms' ? 'room' : 'game');
</script>

<svelte:head><title>Tournament · {code} — ZenCode</title></svelte:head>

<GameStage>
	<header class="sticky top-0 z-20 flex items-center gap-3 border-b border-white/10 bg-stage/85 px-4 py-3 backdrop-blur">
		<div class="min-w-0">
			<p class="font-display text-sm leading-tight font-bold tracking-[0.14em] uppercase">{game || 'Tournament'}</p>
			<p class="font-mono text-[11px] tracking-[0.2em] text-cream/50">
				{code}{#if session && session.stage > 0} · {session.final ? 'Final' : `Stage ${session.stage} of ${session.totalStages}`}{/if}
			</p>
		</div>
		{#if identity}<span class="ml-auto truncate text-sm font-semibold text-sun">{identity.name}</span>{/if}
	</header>

	<main class="mx-auto flex w-full max-w-md flex-1 flex-col px-4 pt-5 pb-8">
		{#if loadState === 'loading' || resuming}
			<div class="m-auto flex items-center gap-3 text-cream/70" role="status"><Spinner /> Loading…</div>
		{:else if loadState === 'error'}
			<div class="m-auto text-center" role="alert">
				<CloudOff class="mx-auto size-10 text-cream/50" />
				<p class="mt-3 text-xl font-semibold">Can't reach the tournament.</p>
				<Button variant="stage" class="mt-6" onclick={() => attempt++}>Retry</Button>
			</div>
		{:else if loadState === 'missing' || !session}
			<div class="m-auto text-center" role="alert">
				<p class="text-xl font-semibold">Tournament not found.</p>
				<p class="mt-1 text-cream/60">Check the code on the big screen and try again.</p>
				<Button variant="stage" class="mt-6" href="/join">Enter a code</Button>
			</div>
		{:else if !identity}
			<!-- REGISTER -->
			{#if status === 'finished'}
				<div class="m-auto text-center">
					<p class="eyebrow text-green-300">Tournament {code}</p>
					<p class="mt-3 font-display text-3xl font-bold uppercase">This tournament has {closed ? 'been closed' : 'finished'}</p>
				</div>
			{:else if !session.registrationOpen}
				<div class="m-auto text-center">
					<p class="eyebrow text-green-300">Tournament {code}</p>
					<p class="mt-3 font-display text-3xl font-bold uppercase">Registration is closed</p>
					<p class="mt-2 text-cream/60">Ask an organiser if you think you should be in.</p>
				</div>
			{:else}
				<div class="my-auto w-full" in:fly={{ y: 16, duration: 300 }}>
					<Logo class="mb-8" />
					<p class="eyebrow text-green-300">Tournament</p>
					<h1 class="mt-1 font-display text-4xl leading-none font-bold tracking-tight uppercase">{game}</h1>
					<p class="mt-2 text-sun">{session.rules.stages} stages. One champion.</p>
					{#if status !== 'lobby'}
						<p class="mt-4 rounded-lg border border-sun/30 bg-sun/10 px-3 py-2 text-sm text-sun">Entries are locked — you'll join the reserve list.</p>
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
					<p class="mt-4 text-center text-xs text-cream/40">No sign-up needed. Your name is used for every stage of this tournament.</p>
				</div>
			{/if}
		{:else if !me}
			<div class="m-auto flex items-center gap-3 text-cream/70" role="status"><Spinner /> Loading your place…</div>
		{:else if closed || (status === 'finished' && !session.podium.length)}
			<div class="m-auto text-center">
				<DoorClosed class="mx-auto size-12 text-cream/50" />
				<p class="mt-3 font-display text-3xl font-bold uppercase">Tournament closed</p>
				<p class="mt-2 text-cream/60">The organisers closed this tournament. Thanks for playing, {identity.name}. Taking you home…</p>
			</div>
		{:else if me.status === 'removed'}
			<div class="m-auto text-center" role="alert">
				<p class="font-display text-3xl font-bold uppercase">You've been removed</p>
				<p class="mt-2 text-cream/60">An organiser removed you from this tournament.</p>
			</div>
		{:else if me.status === 'reserve'}
			<div class="m-auto text-center">
				<p class="font-display text-4xl font-bold uppercase">You're on the reserve list</p>
				<p class="mt-3 text-cream/70">Entries were locked before you registered, {identity.name}. Organisers can see you're here.</p>
			</div>
		{:else if me.status === 'lobby'}
			<!-- LOBBY -->
			<div class="m-auto text-center">
				<p class="font-display text-5xl font-bold tracking-tight uppercase" in:scale={{ start: 0.85, duration: 400 }}>You're in.</p>
				<p class="mt-3 text-lg text-cream/80">Welcome, <span class="font-semibold text-sun">{identity.name}</span>.</p>
				<p class="mt-8 text-cream/60">Waiting for the organisers to lock the entries. You'll be sent straight into your first {roomWord}.</p>
				<p class="mt-8 font-display text-3xl font-bold text-green-300" aria-live="polite">
					<XpCounter value={session.playerCount} duration={400} />
					<span class="block text-xs font-semibold tracking-[0.2em] text-cream/50 uppercase">{session.playerCount === 1 ? 'player registered' : 'players registered'}</span>
				</p>
			</div>
		{:else if myRoom}
			<!-- SEATED IN THIS STAGE'S GAME -->
			<div class="m-auto w-full text-center" in:fly={{ y: 18, duration: 320 }}>
				<p class="eyebrow text-green-300">{session.final ? 'The final' : `Stage ${session.stage} of ${session.totalStages}`}</p>
				{#if session.format === 'rooms'}
					<p class="mt-3 font-display text-6xl font-bold text-green-300" in:scale={{ start: 0.7, duration: 350 }}>Room {me.roomNumber}</p>
				{:else}
					<p class="mt-3 font-display text-4xl font-bold uppercase" in:scale={{ start: 0.85, duration: 350 }}>You're playing</p>
				{/if}
				<p class="mt-3 text-cream/70">Your {game} game is <span class="font-mono font-semibold text-cream">{myRoom}</span>.</p>
				{#if roomStatus === 'finished'}
					<p class="mt-8 flex items-center justify-center gap-2 text-cream/70" role="status"><Hourglass class="size-4" /> Game over — waiting for the organisers to finish the stage.</p>
				{:else if roomStatus === null}
					<p class="mt-8 flex items-center justify-center gap-2 text-cream/70" role="status"><Spinner class="size-4" /> Opening your {roomWord}…</p>
				{:else}
					<Button variant="sun" size="xl" class="mt-8 w-full" onclick={play}><Play class="size-5" /> Play now</Button>
					<p class="mt-3 text-xs text-cream/40">Taking you in automatically. Your name is already on the list.</p>
				{/if}
			</div>
		{:else if me.status === 'champion' || me.status === 'finalist'}
			<!-- FINAL RESULT -->
			<div class="m-auto w-full text-center">
				{#if me.status === 'champion'}
					<Crown class="mx-auto size-14 text-sun" />
					<p class="mt-3 font-display text-5xl font-bold uppercase" in:scale={{ start: 0.7, duration: 420 }}>Champion!</p>
					<p class="mt-2 text-cream/70">You won the {game} tournament, {identity.name}.</p>
				{:else}
					<Medal class="mx-auto size-12 text-sun" />
					<p class="mt-3 font-display text-4xl font-bold uppercase">{me.place ? `${placeLabel(me.place)} place` : 'Finalist'}</p>
					<p class="mt-2 text-cream/70">{me.place && me.place <= 3 ? 'You made the podium.' : 'You made the final.'}{me.lastScore !== null ? ` Final score: ${me.lastScore}.` : ''}</p>
				{/if}
				{#if session.podium.length}
					<ol class="mt-8 space-y-1.5 text-left" aria-label="Podium">
						{#each session.podium as p (p.playerId)}
							<li class="flex items-center gap-3 rounded-lg border px-4 py-2 {p.playerId === identity.playerId ? 'border-sun/60 bg-sun/10' : 'border-stage-line bg-stage-raised/80'}">
								<span class="w-6 font-mono text-sm text-cream/60 tabular">{p.rank}</span>
								<span class="min-w-0 flex-1 truncate font-semibold">{p.name}</span>
								<span class="font-display font-bold tabular">{p.score}</span>
							</li>
						{/each}
					</ol>
				{/if}
			</div>
		{:else if me.status === 'qualified'}
			<div class="m-auto text-center">
				<Sparkles class="mx-auto size-12 text-green-300" />
				<p class="mt-3 font-display text-4xl font-bold text-green-300 uppercase" in:scale={{ start: 0.7, duration: 420 }}>You advance!</p>
				<p class="mt-2 text-cream/70">{me.lastRank ? `${placeLabel(me.lastRank)} in stage ${me.stage}` : `Through from stage ${me.stage}`}{me.lastScore !== null ? ` with ${me.lastScore}` : ''}. The next stage is being prepared — stay on this page.</p>
			</div>
		{:else if me.status === 'eliminated'}
			<div class="m-auto text-center">
				<p class="font-display text-3xl font-bold uppercase">Thanks for playing</p>
				<p class="mt-2 text-cream/70">You didn't go through this time{me.lastRank ? ` — you finished ${placeLabel(me.lastRank)} in your ${roomWord}` : ''}.</p>
				{#if session.podium.length}
					<p class="mt-6 text-sm text-cream/60">Champion: <span class="font-semibold text-sun">{session.podium[0].name}</span></p>
				{/if}
			</div>
		{:else}
			<div class="m-auto text-center">
				<p class="font-display text-3xl font-bold uppercase">Stage over</p>
				<p class="mt-3 flex items-center justify-center gap-2 text-cream/70" role="status"><Spinner class="size-4" /> Waiting for the results…</p>
			</div>
		{/if}
	</main>
</GameStage>
