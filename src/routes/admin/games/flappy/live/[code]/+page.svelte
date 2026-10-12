<script lang="ts">
	import { page } from '$app/state';
	import { collection, doc, onSnapshot } from 'firebase/firestore';
	import { flip } from 'svelte/animate';
	import { fade, fly, scale } from 'svelte/transition';
	import { backOut } from 'svelte/easing';
	import { Users, X, Maximize, Minimize, Play, Flag, CloudOff, ArrowLeft, Plane, Trophy, Timer } from '@lucide/svelte';
	import { db } from '$lib/firebase/client';
	import { adminAuth } from '$lib/stores/admin-auth.svelte';
	import { serverNow } from '$lib/games/tech-word-rush/api';
	import { SESSIONS } from '$lib/games/tech-word-rush/types';
	import { control } from '$lib/games/flappy/api';
	import { asRankEntries, durationLabel, formatClock, type FlapControl, type FlapPlayer, type FlapSession } from '$lib/games/flappy/types';
	import { isFlyGame, skinFor } from '$lib/games/flappy/skins';
	import Logo from '$lib/components/site/Logo.svelte';
	import Button from '$lib/components/ui/Button.svelte';
	import Modal from '$lib/components/ui/Modal.svelte';
	import Spinner from '$lib/components/ui/Spinner.svelte';
	import QrCode from '$lib/components/games/QrCode.svelte';
	import Leaderboard from '$lib/components/games/Leaderboard.svelte';
	import XpCounter from '$lib/components/games/XpCounter.svelte';
	import FlappyGame from '$lib/components/games/flappy/FlappyGame.svelte';
	import Confetti from '$lib/components/live/Confetti.svelte';

	const code = $derived((page.params.code ?? '').toUpperCase());
	const joinUrl = $derived(`${page.url.origin}/join/flap/${code}`);

	let session = $state<FlapSession | null>(null);
	let loadState = $state<'loading' | 'ready' | 'missing' | 'error'>('loading');
	let players = $state<(FlapPlayer & { id: string })[]>([]);

	$effect(() => {
		const c = code;
		loadState = 'loading';
		const unsubSession = onSnapshot(
			doc(db(), SESSIONS, c),
			(snap) => {
				const s = snap.data() as FlapSession | undefined;
				session = s && isFlyGame(s.gameType) ? s : null;
				loadState = session ? 'ready' : 'missing';
			},
			() => (loadState = 'error')
		);
		const unsubPlayers = onSnapshot(collection(db(), SESSIONS, c, 'players'), (snap) => {
			players = snap.docs.map((d) => ({ id: d.id, ...(d.data() as FlapPlayer) }));
		});
		return () => {
			unsubSession();
			unsubPlayers();
		};
	});

	// ── Control ──────────────────────────────────────────────────────────
	let busy = $state<FlapControl | null>(null);
	let actionError = $state('');

	async function run(action: FlapControl) {
		if (busy) return;
		busy = action;
		actionError = '';
		try {
			const token = await adminAuth.user?.getIdToken();
			if (!token) throw new Error('Your session expired. Sign in again.');
			await control(token, code, action);
		} catch (err) {
			actionError = (err as Error).message || 'Unable to update the game.';
		} finally {
			busy = null;
		}
	}

	// Align this screen's clock with the server once.
	$effect(() => {
		if (loadState === 'ready') adminAuth.user?.getIdToken().then((t) => control(t, code, 'sync')).catch(() => {});
	});

	let now = $state(serverNow());
	$effect(() => {
		const id = setInterval(() => (now = serverNow()), 200);
		return () => clearInterval(id);
	});

	const status = $derived(session?.status ?? 'lobby');
	const skin = $derived(skinFor(session?.gameType ?? (code.startsWith('ZS') ? 'symba' : 'flappy')));
	const [titleTop, titleBottom] = $derived(skin.name.split(' '));
	const endsAt = $derived(session?.timerEndsAt ?? null);
	const timeLeft = $derived(endsAt ? Math.max(0, endsAt - now) : 0);
	const fraction = $derived(session && endsAt ? Math.min(1, timeLeft / (session.duration * 1000)) : 1);
	const urgent = $derived(status === 'playing' && timeLeft <= 10_000);

	// Time-up closes flights; the server waits for any still landing, then ranks.
	// Retried every few seconds if the request fails.
	let autoFinishAt = 0;
	$effect(() => {
		if (status === 'playing' && endsAt && now >= endsAt && !busy && Date.now() - autoFinishAt > 5000) {
			autoFinishAt = Date.now();
			run('finish');
		}
	});

	// ── Live standings (latest flight per player) ────────────────────────
	const standings = $derived(
		[...players].sort((a, b) => b.score - a.score || (a.scoredAt ?? Infinity) - (b.scoredAt ?? Infinity) || a.joinedAt - b.joinedAt)
	);
	const flyingNow = $derived(players.filter((p) => p.flying).length);
	const flights = $derived(players.reduce((n, p) => n + p.rounds, 0));
	const topScore = $derived(standings[0]?.score ?? 0);
	const lobbyPlayers = $derived([...players].sort((a, b) => b.joinedAt - a.joinedAt));

	// ── Chrome ───────────────────────────────────────────────────────────
	let confirmEnd = $state(false);
	let fullscreen = $state(false);
	function toggleFullscreen() {
		if (document.fullscreenElement) document.exitFullscreen();
		else document.documentElement.requestFullscreen?.().catch(() => {});
	}

	const podium = $derived(session?.leaderboard.slice(0, 3) ?? []);
	const podiumOrder = $derived([podium[1], podium[0], podium[2]].filter(Boolean));
	const medal = (rank: number) => (rank === 1 ? '🥇' : rank === 2 ? '🥈' : '🥉');
</script>

<svelte:head><title>{code} · {skin.name} — ZenCode</title></svelte:head>
<svelte:document onfullscreenchange={() => (fullscreen = !!document.fullscreenElement)} />

<div class="relative isolate flex min-h-dvh flex-col overflow-hidden bg-stage font-sans text-cream">
	<!-- The bird flies itself behind everything -->
	<div class="absolute inset-0 -z-10">
		{#key skin.id}<FlappyGame skin={skin.id} mode="demo" />{/key}
	</div>
	<div
		class="pointer-events-none absolute inset-0 -z-10 transition-colors duration-700 {status === 'finished'
			? 'bg-stage/80'
			: status === 'playing'
				? 'bg-gradient-to-r from-stage/55 via-transparent to-stage/80'
				: 'bg-gradient-to-r from-stage/90 via-stage/55 to-stage/30'}"
	></div>

	<!-- Top bar -->
	<header class="flex items-center gap-4 border-b border-white/10 bg-stage/50 px-5 py-3 backdrop-blur md:px-8">
		<Logo />
		<span class="hidden h-5 w-px bg-white/15 sm:block"></span>
		<p class="hidden font-display text-sm font-bold tracking-[0.18em] uppercase sm:block">{skin.name}</p>
		<div class="ml-auto flex items-center gap-2 md:gap-4">
			<span class="rounded-md border border-white/15 px-2.5 py-1 font-mono text-sm font-semibold tracking-[0.2em] text-sun">{code}</span>
			<span class="inline-flex items-center gap-1.5 text-sm text-cream/80 tabular" aria-live="polite"><Users class="size-4" />{players.length}</span>
			<button type="button" class="grid size-9 place-items-center rounded-md text-cream/70 hover:bg-white/10 hover:text-cream" aria-label={fullscreen ? 'Exit full screen' : 'Full screen'} onclick={toggleFullscreen}>
				{#if fullscreen}<Minimize class="size-4" />{:else}<Maximize class="size-4" />{/if}
			</button>
			<a href="/admin/games" class="grid size-9 place-items-center rounded-md text-cream/70 hover:bg-white/10 hover:text-cream" aria-label="Close presenter"><X class="size-5" /></a>
		</div>
	</header>

	<main class="flex flex-1 flex-col px-5 py-6 md:px-10 md:py-8">
		{#if loadState === 'loading'}
			<div class="m-auto flex items-center gap-3 text-cream/70"><Spinner /> Loading game…</div>
		{:else if loadState === 'missing' || loadState === 'error'}
			<div class="m-auto max-w-md rounded-2xl bg-stage/80 p-8 text-center" role="alert">
				<CloudOff class="mx-auto size-10 text-cream/50" />
				<p class="mt-4 text-xl font-semibold">{loadState === 'missing' ? 'This game session does not exist.' : 'Unable to load the game.'}</p>
				<p class="mt-1 text-cream/60">{loadState === 'missing' ? 'It may have been removed.' : 'Check your connection, then reload.'}</p>
				<Button variant="stage" class="mt-6" href="/admin/games"><ArrowLeft class="size-4" /> Back to games</Button>
			</div>
		{:else if session}
			<div class="grid flex-1">
				{#key status}
					<div class="flex flex-col [grid-area:1/1]" in:fly={{ y: 24, duration: 420, delay: 120 }} out:fade={{ duration: 120 }}>
						{#if status === 'lobby'}
							<!-- LOBBY -->
							<div class="m-auto grid w-full max-w-6xl items-center gap-10 lg:grid-cols-[1.15fr_1fr]">
								<div class="text-center lg:text-left">
									<p class="eyebrow text-green-300">Ice breaker</p>
									<h1 class="flappy-head mt-3 font-display text-6xl leading-[0.88] font-bold tracking-tight uppercase md:text-8xl">{titleTop}<br />{titleBottom}</h1>
									<p class="mt-5 max-w-lg text-lg text-cream/85 md:text-xl lg:max-w-none">
										Fly as often as you like for <span class="font-semibold text-sun">{durationLabel(session.duration)}</span>. Every new flight replaces your last score —
										<span class="font-semibold text-sun">only your latest counts.</span>
									</p>
									<div class="mt-8">
										<p class="eyebrow text-cream/60">Game code</p>
										<p class="mt-1 font-mono text-6xl font-bold tracking-[0.18em] md:text-7xl">{code}</p>
										<p class="mt-2 font-mono text-sm break-all text-cream/50">{joinUrl}</p>
									</div>
									<p class="mt-8 flex items-baseline justify-center gap-3 lg:justify-start" aria-live="polite">
										<XpCounter value={players.length} duration={400} class="font-display text-6xl font-bold text-green-300" />
										<span class="text-lg tracking-[0.18em] text-cream/70 uppercase">{players.length === 1 ? 'Player warming up' : 'Players warming up'}</span>
									</p>
								</div>
								<div class="mx-auto w-full max-w-[min(25rem,50vh)]">
									<div class="rounded-3xl border border-sun/40 bg-white p-4 shadow-[0_0_90px_-20px_var(--color-sun)]">
										<QrCode value={joinUrl} label="Scan to join game {code}" />
									</div>
									<p class="mt-4 text-center font-display text-2xl font-bold tracking-[0.2em] uppercase">Scan to fly</p>
								</div>
							</div>
							{#if players.length}
								<ul class="mx-auto mt-8 flex max-w-5xl flex-wrap justify-center gap-2" aria-label="Players">
									{#each lobbyPlayers.slice(0, 48) as p (p.id)}
										<li in:scale={{ start: 0.6, duration: 260 }} class="rounded-full border border-white/15 bg-stage/70 px-3.5 py-1.5 text-sm font-medium backdrop-blur">{p.name}</li>
									{/each}
									{#if players.length > 48}<li class="px-3 py-1.5 text-sm text-cream/50">+{players.length - 48} more</li>{/if}
								</ul>
							{/if}
						{:else if status === 'playing'}
							<!-- PLAYING -->
							<div class="mx-auto grid w-full max-w-7xl flex-1 items-start gap-6 lg:grid-cols-[1fr_28rem]">
								<div class="flex flex-col gap-6">
									<div class="w-fit rounded-3xl border border-white/10 bg-stage/60 px-7 py-5 backdrop-blur-md">
										<p class="eyebrow flex items-center gap-2 text-cream/60"><Timer class="size-3.5" /> Time left</p>
										<p
											class="mt-1 font-display text-8xl leading-none font-bold tabular md:text-9xl {urgent ? 'animate-pulse text-attention' : 'text-cream'}"
											role="timer"
											aria-label="{Math.ceil(timeLeft / 1000)} seconds left"
										>
											{formatClock(timeLeft)}
										</p>
										<div class="mt-4 h-2 w-full min-w-64 overflow-hidden rounded-full bg-white/10">
											<div class="h-full rounded-full transition-[width] duration-200 ease-linear {urgent ? 'bg-attention' : 'bg-sun'}" style:width="{fraction * 100}%"></div>
										</div>
									</div>
									<div class="grid max-w-2xl grid-cols-2 gap-3 md:grid-cols-4">
										{#each [['Players', players.length, 'text-cream'], ['In the air', flyingNow, 'text-green-300'], ['Flights', flights, 'text-cream'], ['Top score', topScore, 'text-sun']] as [label, value, cls] (label)}
											<div class="rounded-2xl border border-white/10 bg-stage/60 px-4 py-3 backdrop-blur-md">
												<p class="eyebrow text-cream/55">{label}</p>
												<p class="mt-1 font-display text-4xl font-bold tabular {cls}" aria-live="polite"><XpCounter value={Number(value)} duration={400} /></p>
											</div>
										{/each}
									</div>
									<div class="mt-auto hidden max-w-xl rounded-2xl border border-white/10 bg-stage/60 p-5 backdrop-blur-md lg:block">
										<p class="font-display text-xl font-bold uppercase">Still time to join</p>
										<div class="mt-3 flex items-center gap-5">
											<div class="w-28 shrink-0 rounded-xl bg-white p-1.5"><QrCode value={joinUrl} label="Scan to join game {code}" /></div>
											<div>
												<p class="font-mono text-4xl font-bold tracking-[0.15em] text-sun">{code}</p>
												<p class="mt-1 text-sm text-cream/60">Only your latest flight counts — fly again to beat it, but you’ll lose the old score.</p>
											</div>
										</div>
									</div>
								</div>

								<section class="rounded-3xl border border-white/10 bg-stage/75 p-5 backdrop-blur-md" aria-labelledby="live-h">
									<div class="flex items-center justify-between">
										<h2 id="live-h" class="font-display text-2xl font-bold tracking-tight uppercase">Live leaderboard</h2>
										<span class="inline-flex items-center gap-1.5 text-xs font-semibold text-green-300"><span class="size-2 animate-pulse rounded-full bg-green-300"></span>Live</span>
									</div>
									{#if !standings.length}
										<p class="mt-8 text-center text-cream/60">Waiting for the first flight…</p>
									{:else}
										<ol class="mt-4 flex flex-col gap-2">
											{#each standings.slice(0, 10) as p, i (p.id)}
												<li
													animate:flip={{ duration: 500 }}
													class="flex h-14 items-center gap-3 rounded-xl border px-4 {i === 0 && p.score > 0 ? 'border-sun/50 bg-sun/10' : 'border-white/10 bg-white/[0.03]'}"
												>
													<span class="w-7 font-mono font-semibold tabular {i < 3 ? 'text-sun' : 'text-cream/50'}">{String(i + 1).padStart(2, '0')}</span>
													<span class="min-w-0 flex-1 truncate text-lg font-semibold uppercase">{p.name}</span>
													{#if p.flying}
														<span class="inline-flex items-center gap-1 rounded-full bg-green-300/15 px-2 py-0.5 text-xs font-semibold text-green-300" transition:scale={{ duration: 200 }}>
															<Plane class="size-3 animate-pulse" /> Flying
														</span>
													{/if}
													<span class="w-14 text-right font-display text-2xl font-bold tabular">{p.score}</span>
												</li>
											{/each}
										</ol>
										{#if standings.length > 10}<p class="mt-3 text-center text-sm text-cream/50">+{standings.length - 10} more players</p>{/if}
									{/if}
								</section>
							</div>
						{:else}
							<!-- FINAL -->
							{#if !session.ranking && podium.length}<Confetti count={140} />{/if}
							<div class="relative mx-auto w-full max-w-4xl">
								<p class="eyebrow text-center text-green-300">{skin.name}</p>
								<h2 class="flappy-head mt-2 text-center font-display text-5xl font-bold tracking-tight uppercase md:text-7xl">Final leaderboard</h2>
								{#if session.ranking}
									<div class="mt-16 flex flex-col items-center gap-4 text-cream/80">
										<p class="flappy-head font-display text-7xl font-bold text-sun uppercase" in:scale={{ start: 0.5, duration: 500, easing: backOut }}>Time!</p>
										<p class="flex items-center gap-3"><Spinner /> Landing the last flights and counting scores…</p>
									</div>
								{:else if !podium.length}
									<p class="mt-16 text-center text-cream/60">No players joined this game.</p>
								{:else}
									<div class="mt-12 grid grid-cols-3 items-end gap-3 md:gap-6">
										{#each podiumOrder as e (e.id)}
											{@const first = e.rank === 1}
											<div
												class="flex flex-col items-center text-center {podiumOrder.length < 3 && first ? 'col-start-2' : ''}"
												in:fly={{ y: 40, duration: 700, delay: first ? 900 : e.rank === 2 ? 500 : 200 }}
											>
												<span class="text-4xl md:text-6xl" aria-hidden="true">{medal(e.rank)}</span>
												<p class="mt-2 w-full truncate font-display text-lg font-bold uppercase md:text-3xl {first ? 'text-sun' : 'text-cream'}">{e.name}</p>
												<p class="font-display text-base font-semibold text-cream/80 md:text-2xl"><XpCounter value={e.score} from={0} duration={1400} /> pts</p>
												<div
													class="mt-3 w-full rounded-t-2xl border border-b-0 backdrop-blur-sm {first
														? 'h-40 border-sun/50 bg-gradient-to-b from-sun/30 to-transparent shadow-[0_0_80px_-20px_var(--color-sun)] md:h-56'
														: e.rank === 2
															? 'h-28 border-green-300/40 bg-gradient-to-b from-green-300/20 to-transparent md:h-40'
															: 'h-20 border-green-300/25 bg-gradient-to-b from-green-300/10 to-transparent md:h-28'}"
												>
													<p class="pt-3 font-mono text-2xl font-bold text-cream/60">#{e.rank}</p>
												</div>
											</div>
										{/each}
									</div>
									{#if session.leaderboard.length > 3}
										<div class="mx-auto mt-8 max-w-2xl" in:fade={{ delay: 1400, duration: 400 }}>
											<Leaderboard entries={asRankEntries(session.leaderboard.slice(3))} limit={7} unit="pts" />
										</div>
									{/if}
								{/if}
							</div>
						{/if}
					</div>
				{/key}
			</div>
		{/if}
	</main>

	<!-- Controls -->
	{#if session && loadState === 'ready'}
		<footer class="sticky bottom-0 border-t border-white/10 bg-stage/85 px-5 py-3 backdrop-blur md:px-8">
			<div class="mx-auto flex max-w-7xl flex-wrap items-center gap-2">
				{#if actionError}<p class="mr-auto text-sm text-attention" role="alert">{actionError}</p>{/if}
				<div class="ml-auto flex flex-wrap items-center gap-2">
					{#if status === 'lobby'}
						<Button variant="stage" size="lg" onclick={() => (confirmEnd = true)}><Flag class="size-4" /> Close lobby</Button>
						<Button variant="sun" size="lg" onclick={() => run('start')} loading={busy === 'start'} disabled={!players.length}>
							<Play class="size-4" />{players.length ? `Start · ${durationLabel(session.duration)}` : 'Waiting for players…'}
						</Button>
					{:else if status === 'playing'}
						<Button variant="stage" size="lg" onclick={() => (confirmEnd = true)} loading={busy === 'finish'}><Flag class="size-4" /> End early</Button>
					{:else}
						<Button variant="sun" size="lg" href="/admin/games"><ArrowLeft class="size-4" /> Back to games</Button>
					{/if}
				</div>
			</div>
		</footer>
	{/if}
</div>

<Modal
	open={confirmEnd}
	title={status === 'lobby' ? 'Close this lobby?' : 'End the game now?'}
	description={status === 'lobby' ? 'Players can no longer join.' : 'Flights close now and the final leaderboard is shown.'}
	onclose={() => (confirmEnd = false)}
>
	<p class="text-sm text-muted-foreground">This cannot be undone.</p>
	{#snippet footer()}
		<Button variant="ghost" onclick={() => (confirmEnd = false)}>Cancel</Button>
		<Button
			variant="destructive"
			loading={busy === 'finish'}
			onclick={async () => {
				confirmEnd = false;
				await run('finish');
			}}>{status === 'lobby' ? 'Close lobby' : 'End game'}</Button
		>
	{/snippet}
</Modal>

<style>
	.flappy-head {
		-webkit-text-stroke: 2px rgba(40, 22, 6, 0.8);
		paint-order: stroke fill;
		text-shadow: 0 5px 0 rgba(40, 22, 6, 0.5);
	}
</style>
