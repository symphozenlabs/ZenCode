<script lang="ts">
	import { page } from '$app/state';
	import { doc, onSnapshot } from 'firebase/firestore';
	import { fade, fly, scale } from 'svelte/transition';
	import { backOut } from 'svelte/easing';
	import { CloudOff, RotateCcw, Volume2, VolumeX, Timer, Trophy, Plane } from '@lucide/svelte';
	import { db } from '$lib/firebase/client';
	import { SESSIONS } from '$lib/games/tech-word-rush/types';
	import { serverNow } from '$lib/games/tech-word-rush/api';
	import { CODE_RE, asRankEntries, formatClock, type FlapSession, type FlapView } from '$lib/games/flappy/types';
	import { forgetIdentity, join, loadIdentity, play, type Identity } from '$lib/games/flappy/api';
	import { isMuted, setMuted, unlockAudio } from '$lib/games/flappy/audio';
	import FlappyGame from '$lib/components/games/flappy/FlappyGame.svelte';
	import Leaderboard from '$lib/components/games/Leaderboard.svelte';
	import XpCounter from '$lib/components/games/XpCounter.svelte';
	import Confetti from '$lib/components/live/Confetti.svelte';
	import Logo from '$lib/components/site/Logo.svelte';
	import Button from '$lib/components/ui/Button.svelte';
	import Spinner from '$lib/components/ui/Spinner.svelte';

	const code = $derived((page.params.code ?? '').toUpperCase());

	// ── Session (public doc) ─────────────────────────────────────────────
	let session = $state<FlapSession | null>(null);
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
				const s = snap.data() as FlapSession | undefined;
				session = s?.gameType === 'flappy' ? s : null;
				loadState = session ? 'ready' : 'missing';
			},
			() => (loadState = 'error')
		);
	});

	const status = $derived(session?.status ?? 'lobby');

	// Shared clock: ticks a few times a second for the countdown.
	let now = $state(serverNow());
	$effect(() => {
		const id = setInterval(() => (now = serverNow()), 250);
		return () => clearInterval(id);
	});
	const endsAt = $derived(session?.timerEndsAt ?? null);
	const timeLeft = $derived(endsAt ? Math.max(0, endsAt - now) : 0);
	const live = $derived(status === 'playing' && timeLeft > 0);
	const fraction = $derived(session && endsAt ? Math.min(1, timeLeft / (session.duration * 1000)) : 1);

	// ── Identity (device token, no account) ──────────────────────────────
	let identity = $state<Identity | null>(null);
	let resuming = $state(true);
	let view = $state<FlapView | null>(null);

	$effect(() => {
		const c = code;
		const saved = loadIdentity(c);
		if (!saved) {
			resuming = false;
			return;
		}
		play(c, saved, 'state')
			.then((v) => {
				identity = saved;
				view = v;
			})
			.catch((err) => {
				if (err.status === 401) forgetIdentity(c);
				else identity = saved; // network blip: keep going
			})
			.finally(() => (resuming = false));
	});

	let name = $state('');
	let joining = $state(false);
	let joinError = $state('');

	async function submitJoin(e: SubmitEvent) {
		e.preventDefault();
		unlockAudio();
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
			joinError = (err as Error).message || 'Unable to join the game.';
		} finally {
			joining = false;
		}
	}

	// ── Flights ──────────────────────────────────────────────────────────
	let game = $state<ReturnType<typeof FlappyGame>>();
	let phase = $state<'ready' | 'playing' | 'dying' | 'over'>('ready');
	let flightScore = $state(0);
	/** Whether the flight in progress counts (false = practice in the lobby). */
	let ranked = $state(false);
	let starting: Promise<number | null> | null = null;
	let saving = $state(false);
	let saveError = $state('');
	let lastResult = $state<{ score: number; ranked: boolean; reason: 'crash' | 'time'; capped: boolean } | null>(null);
	let muted = $state(isMuted());
	let liveNotice = $state(false);

	function onstart() {
		saveError = '';
		lastResult = null;
		ranked = live;
		if (!ranked || !identity) return;
		const id = identity;
		starting = play(code, id, 'start')
			.then((v) => {
				view = v;
				if (v.rejected) {
					ranked = false;
					saveError = v.rejected;
					return null;
				}
				return v.round;
			})
			.catch((err) => {
				saveError = (err as Error).message || 'Couldn’t reach the game — this flight won’t count.';
				return null;
			});
	}

	async function onend(score: number, reason: 'crash' | 'time') {
		lastResult = { score, ranked, reason, capped: false };
		if (!ranked || !identity) return;
		saving = true;
		try {
			const round = await starting;
			if (round === null) return;
			const v = await play(code, identity, 'end', { round, score });
			view = v;
			if (v.rejected) saveError = v.rejected;
			else if (v.saved !== undefined && v.saved < score) lastResult = { score: v.saved, ranked: true, reason, capped: true };
		} catch (err) {
			saveError = (err as Error).message || 'Couldn’t save this flight. Check your connection.';
		} finally {
			saving = false;
			starting = null;
		}
	}

	function flyAgain() {
		unlockAudio();
		lastResult = null;
		saveError = '';
		game?.reset();
	}

	// When the host starts, a practice flight in progress is cleared so the
	// next one counts.
	let wasLive = false;
	$effect(() => {
		const isLive = live;
		if (isLive && !wasLive && identity) {
			if (phase !== 'ready' && !ranked) flyAgain();
			liveNotice = true;
			setTimeout(() => (liveNotice = false), 2600);
		}
		wasLive = isLive;
	});

	// If the presenter screen was closed, nudge the server to publish results.
	let nudged = false;
	$effect(() => {
		if (identity && status === 'playing' && endsAt && now > endsAt + 6000 && !nudged) {
			nudged = true;
			play(code, identity, 'state').catch(() => {});
		}
	});

	function toggleMute() {
		muted = !muted;
		setMuted(muted);
		unlockAudio();
	}

	const board = $derived(session ? asRankEntries(session.leaderboard) : []);
	const mine = $derived(identity ? (session?.leaderboard.find((e) => e.id === identity!.playerId) ?? null) : null);
	const entry = $derived(view?.score ?? 0);
	const medal = (rank: number) => (rank === 1 ? '🥇' : rank === 2 ? '🥈' : rank === 3 ? '🥉' : '');
</script>

<svelte:head><title>Flappy Bird · {code} — ZenCode</title></svelte:head>
<svelte:window
	onkeydown={(e) => {
		if (e.key === 'Enter' && phase === 'over' && (status === 'lobby' || live) && !(e.target instanceof HTMLButtonElement)) flyAgain();
	}}
/>

<div class="fixed inset-0 flex flex-col overflow-hidden bg-stage text-cream">
	{#if loadState === 'loading' || resuming}
		<div class="m-auto flex items-center gap-3 text-cream/70" role="status"><Spinner /> Loading game…</div>
	{:else if loadState === 'missing'}
		<div class="m-auto px-6 text-center" role="alert">
			<p class="text-xl font-semibold">Game not found.</p>
			<p class="mt-1 text-cream/60">Check the code on the big screen and try again.</p>
			<Button variant="stage" class="mt-6" href="/join">Enter a code</Button>
		</div>
	{:else if loadState === 'error' || !session}
		<div class="m-auto px-6 text-center" role="alert">
			<CloudOff class="mx-auto size-9 text-cream/50" />
			<p class="mt-3 text-xl font-semibold">Unable to load the game.</p>
			<p class="mt-1 text-cream/60">Check your connection, then try again.</p>
			<Button variant="stage" class="mt-6" onclick={() => attempt++}><RotateCcw class="size-4" /> Try again</Button>
		</div>
	{:else if status === 'finished'}
		<!-- FINAL RESULTS -->
		{#if mine && mine.rank <= 3 && !session.ranking}<Confetti />{/if}
		<div class="absolute inset-0 opacity-35"><FlappyGame mode="demo" /></div>
		<div class="absolute inset-0 bg-gradient-to-b from-stage/70 via-stage/85 to-stage"></div>
		<main class="relative mx-auto flex w-full max-w-md flex-1 flex-col overflow-y-auto px-4 pt-[max(1.25rem,env(safe-area-inset-top))] pb-8">
			<Logo />
			<p class="eyebrow mt-8 text-green-300">Flappy Bird · {code}</p>
			<h1 class="mt-2 font-display text-4xl font-bold tracking-tight uppercase">Final leaderboard</h1>
			{#if session.ranking}
				<div class="mt-16 flex items-center justify-center gap-3 text-cream/70" role="status"><Spinner /> Counting final scores…</div>
			{:else}
				{#if mine}
					<div
						class="mt-6 rounded-2xl border border-sun/40 bg-gradient-to-br from-sun/20 to-transparent p-5 shadow-[0_0_60px_-24px_var(--color-sun)]"
						in:scale={{ start: 0.9, duration: 500, easing: backOut }}
					>
						<p class="eyebrow text-cream/60">Your result</p>
						<div class="mt-1 flex items-end justify-between gap-4">
							<p class="font-display text-5xl font-bold">
								{#if medal(mine.rank)}<span class="mr-1 text-4xl">{medal(mine.rank)}</span>{/if}#{mine.rank}
							</p>
							<p class="text-right font-display text-3xl font-bold text-sun">
								<XpCounter value={mine.score} from={0} duration={1200} />
								<span class="text-base text-cream/60">pts</span>
							</p>
						</div>
						<p class="mt-2 text-sm text-cream/60">of {session.leaderboard.length} players · {mine.rounds} {mine.rounds === 1 ? 'flight' : 'flights'}</p>
					</div>
				{/if}
				<div class="mt-6">
					{#if board.length}
						<Leaderboard entries={board} limit={20} highlightId={identity?.playerId ?? null} unit="pts" />
					{:else}
						<p class="text-center text-cream/60">Nobody scored this time.</p>
					{/if}
				</div>
			{/if}
		</main>
	{:else if !identity}
		<!-- JOIN -->
		<div class="absolute inset-0"><FlappyGame mode="demo" /></div>
		<div class="absolute inset-0 bg-gradient-to-t from-stage via-stage/70 to-stage/10"></div>
		<main class="relative mx-auto flex w-full max-w-md flex-1 flex-col justify-end px-5 pb-[max(1.5rem,env(safe-area-inset-bottom))]">
			<div in:fly={{ y: 24, duration: 450 }}>
				<p class="eyebrow text-green-300">Ice breaker · {code}</p>
				<h1 class="flappy-head mt-2 font-display text-6xl leading-[0.9] font-bold tracking-tight uppercase">Flappy<br />Bird</h1>
				<p class="mt-3 text-cream/80">
					{#if live}
						It’s live — {formatClock(timeLeft)} left. Fly as often as you like; only your <span class="font-semibold text-sun">latest</span> flight counts.
					{:else}
						Fly as often as you like before time runs out. Only your <span class="font-semibold text-sun">latest</span> flight counts.
					{/if}
				</p>
				<form class="mt-6 space-y-3" onsubmit={submitJoin} novalidate>
					<label for="name" class="eyebrow block text-cream/60">Your name</label>
					<input
						id="name"
						bind:value={name}
						maxlength="20"
						autocomplete="nickname"
						enterkeyhint="go"
						placeholder="Display name"
						aria-invalid={joinError ? 'true' : undefined}
						aria-describedby={joinError ? 'join-err' : undefined}
						class="h-14 w-full rounded-xl border-2 border-white/15 bg-stage/70 px-4 text-lg font-semibold text-cream backdrop-blur outline-none transition-colors duration-150 placeholder:font-normal placeholder:text-cream/35 focus:border-sun"
					/>
					{#if joinError}<p id="join-err" class="text-sm text-attention" role="alert">{joinError}</p>{/if}
					<Button type="submit" variant="sun" size="xl" class="w-full" loading={joining}>{joining ? 'Joining…' : 'Join & fly'}</Button>
				</form>
				<p class="mt-3 text-center text-xs text-cream/45">No sign-up needed. Your name is only used for this game.</p>
			</div>
		</main>
	{:else}
		<!-- PLAY -->
		<header class="relative z-20 flex items-center gap-3 px-4 pt-[max(0.6rem,env(safe-area-inset-top))] pb-2">
			<div class="min-w-0">
				<p class="truncate font-display text-sm leading-tight font-bold tracking-[0.14em] uppercase">Flappy Bird</p>
				<p class="truncate text-[11px] text-cream/55">{identity.name} · <span class="font-mono tracking-[0.15em]">{code}</span></p>
			</div>
			<div class="ml-auto flex items-center gap-2">
				{#if live}
					<span
						class="inline-flex items-center gap-1.5 rounded-full border px-3 py-1 font-mono text-sm font-bold tabular {timeLeft <= 10000
							? 'animate-pulse border-attention/60 bg-attention/15 text-attention'
							: 'border-white/15 bg-white/5'}"
						role="timer"
						aria-label="{Math.ceil(timeLeft / 1000)} seconds left"><Timer class="size-3.5" />{formatClock(timeLeft)}</span
					>
				{:else if status === 'lobby'}
					<span class="rounded-full border border-green-300/40 bg-green-300/10 px-3 py-1 text-xs font-semibold text-green-300">Practice</span>
				{/if}
				<button type="button" class="grid size-9 place-items-center rounded-full text-cream/75 hover:bg-white/10" onclick={toggleMute} aria-label={muted ? 'Unmute sound' : 'Mute sound'}>
					{#if muted}<VolumeX class="size-4.5" />{:else}<Volume2 class="size-4.5" />{/if}
				</button>
			</div>
		</header>
		{#if live}
			<div class="relative z-20 mx-4 h-1 overflow-hidden rounded-full bg-white/10" aria-hidden="true">
				<div class="h-full rounded-full transition-[width] duration-300 ease-linear {timeLeft <= 10000 ? 'bg-attention' : 'bg-sun'}" style:width="{fraction * 100}%"></div>
			</div>
		{/if}

		<main class="relative flex min-h-0 flex-1 justify-center p-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] sm:p-4">
			<div class="relative h-full w-full max-w-[30rem] overflow-hidden rounded-2xl border border-white/10 shadow-2xl shadow-black/50">
				<FlappyGame
					bind:this={game}
					bind:phase
					bind:score={flightScore}
					canPlay={status === 'lobby' || live}
					deadline={live ? endsAt : null}
					hint={live ? 'Tap to fly — this flight counts!' : 'Practice flight — warm up while you wait'}
					{onstart}
					{onend}
				>
					{#snippet overlay()}
						<div class="flex size-full items-center justify-center bg-black/35 p-5 backdrop-blur-[3px]" in:fade={{ duration: 200, delay: 250 }}>
							<div
								class="w-full max-w-xs rounded-3xl border border-white/15 bg-stage/90 p-6 text-center shadow-2xl"
								in:scale={{ start: 0.85, duration: 380, delay: 300, easing: backOut }}
							>
								{#if lastResult?.reason === 'time'}
									<p class="eyebrow text-sun">Time’s up</p>
								{:else}
									<p class="eyebrow text-cream/60">{lastResult?.ranked ? 'Flight over' : 'Practice flight'}</p>
								{/if}
								<p class="mt-2 font-display text-7xl leading-none font-bold text-cream tabular">{lastResult?.score ?? flightScore}</p>
								<p class="mt-1 text-sm text-cream/55">{(lastResult?.score ?? flightScore) === 1 ? 'pipe' : 'pipes'}</p>

								<div class="mt-4 min-h-10 text-sm" aria-live="polite">
									{#if !lastResult?.ranked}
										<p class="text-cream/70">{status === 'lobby' ? 'Practice doesn’t count. Scores start when the host goes live.' : 'This flight didn’t count.'}</p>
									{:else if saving}
										<p class="inline-flex items-center gap-2 text-cream/70"><Spinner class="size-4" /> Saving your score…</p>
									{:else if saveError}
										<p class="text-attention">{saveError}</p>
									{:else}
										<p class="font-semibold text-green-300">✓ Saved as your entry</p>
										{#if lastResult.capped}<p class="mt-1 text-xs text-cream/50">Adjusted to what was possible in the time flown.</p>{/if}
									{/if}
								</div>

								{#if status === 'lobby' || live}
									<Button variant="sun" size="xl" class="mt-4 w-full" onclick={flyAgain}><Plane class="size-4" /> Fly again</Button>
									{#if live && lastResult?.ranked && !saveError}
										<p class="mt-2 text-xs text-cream/50">Your next flight replaces this score.</p>
									{/if}
								{:else}
									<p class="mt-4 inline-flex items-center gap-2 text-sm text-cream/70"><Trophy class="size-4 text-sun" /> Final results are on the way…</p>
								{/if}
							</div>
						</div>
					{/snippet}
				</FlappyGame>

				<!-- Current entry -->
				{#if status === 'playing' && phase === 'ready'}
					<div class="pointer-events-none absolute top-3 left-3 z-20 rounded-full bg-black/40 px-3 py-1 text-xs font-semibold backdrop-blur" transition:fade>
						Your entry: <span class="text-sun tabular">{entry}</span>
					</div>
				{/if}

				{#if status === 'playing' && !live && phase === 'ready'}
					<div class="absolute inset-0 z-30 grid place-items-center bg-black/45 p-6 backdrop-blur-[3px]" in:fade>
						<div class="rounded-3xl border border-white/15 bg-stage/90 p-6 text-center">
							<p class="font-display text-4xl font-bold text-sun uppercase">Time’s up!</p>
							<p class="mt-2 text-cream/70">Your entry: <span class="font-semibold text-cream">{entry}</span></p>
							<p class="mt-4 inline-flex items-center gap-2 text-sm text-cream/60"><Spinner class="size-4" /> Waiting for the final leaderboard…</p>
						</div>
					</div>
				{/if}

				{#if liveNotice}
					<div class="pointer-events-none absolute inset-x-0 top-[22%] z-40 text-center" in:scale={{ start: 0.5, duration: 450, easing: backOut }} out:fade>
						<p class="flappy-head font-display text-5xl font-bold text-sun uppercase">It’s live!</p>
						<p class="mt-2 font-semibold text-white drop-shadow">Your flights count now</p>
					</div>
				{/if}
			</div>
		</main>
	{/if}
</div>

<style>
	.flappy-head {
		-webkit-text-stroke: 2px rgba(40, 22, 6, 0.8);
		paint-order: stroke fill;
		text-shadow: 0 4px 0 rgba(40, 22, 6, 0.5);
	}
</style>
