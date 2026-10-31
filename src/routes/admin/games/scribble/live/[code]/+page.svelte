<script lang="ts">
	import { page } from '$app/state';
	import { collection, doc, onSnapshot } from 'firebase/firestore';
	import { flip } from 'svelte/animate';
	import { fade, fly, scale } from 'svelte/transition';
	import { backOut } from 'svelte/easing';
	import { Users, X, Maximize, Minimize, Play, Flag, CloudOff, ArrowLeft, RotateCcw, SkipForward, Brush, Sparkles, Flame, Check, Images, WifiOff } from '@lucide/svelte';
	import { db } from '$lib/firebase/client';
	import { adminAuth } from '$lib/stores/admin-auth.svelte';
	import { presenterHref } from '$lib/games/registry';
	import { serverNow } from '$lib/games/tech-word-rush/api';
	import { SESSIONS } from '$lib/games/tech-word-rush/types';
	import { control } from '$lib/games/scribble/api';
	import { CHOOSE_MS, GAME_TYPE, asRankEntries, type DrawControl, type DrawPlayer, type DrawSession, type TurnDoc } from '$lib/games/scribble/types';
	import { MULTIPLIER, dueAt } from '$lib/games/scribble/engine';
	import { PACKS } from '$lib/games/scribble/words';
	import { listenGuesses, listenStrokes, loadStrokes, loadTurns, type Chunk, type Guess } from '$lib/games/scribble/live';
	import ScribbleCanvas from '$lib/components/games/scribble/ScribbleCanvas.svelte';
	import CanvasFrame from '$lib/components/games/scribble/CanvasFrame.svelte';
	import WordMask from '$lib/components/games/scribble/WordMask.svelte';
	import LivingDrawing from '$lib/components/games/scribble/LivingDrawing.svelte';
	import Countdown from '$lib/components/games/Countdown.svelte';
	import Logo from '$lib/components/site/Logo.svelte';
	import Button from '$lib/components/ui/Button.svelte';
	import Modal from '$lib/components/ui/Modal.svelte';
	import Spinner from '$lib/components/ui/Spinner.svelte';
	import QrCode from '$lib/components/games/QrCode.svelte';
	import Leaderboard from '$lib/components/games/Leaderboard.svelte';
	import XpCounter from '$lib/components/games/XpCounter.svelte';
	import GameStage from '$lib/components/games/GameStage.svelte';
	import Confetti from '$lib/components/live/Confetti.svelte';

	const code = $derived((page.params.code ?? '').toUpperCase());
	const joinUrl = $derived(`${page.url.origin}/join/draw/${code}`);

	let session = $state<DrawSession | null>(null);
	let loadState = $state<'loading' | 'ready' | 'missing' | 'error'>('loading');
	/** A tournament room goes back to its tournament dashboard, a plain game to the Games page. */	const backHref = $derived(session?.tournament ? presenterHref('tournament', session.tournament.code) : '/admin/games');
	let players = $state<(DrawPlayer & { id: string })[]>([]);

	$effect(() => {
		const c = code;
		loadState = 'loading';
		const unsubSession = onSnapshot(
			doc(db(), SESSIONS, c),
			(snap) => {
				const s = snap.data() as DrawSession | undefined;
				session = s?.gameType === GAME_TYPE ? s : null;
				loadState = session ? 'ready' : 'missing';
			},
			() => (loadState = 'error')
		);
		const unsubPlayers = onSnapshot(collection(db(), SESSIONS, c, 'players'), (snap) => {
			players = snap.docs.map((d) => ({ id: d.id, ...(d.data() as DrawPlayer) }));
		});
		return () => {
			unsubSession();
			unsubPlayers();
		};
	});

	const status = $derived(session?.status ?? 'lobby');
	const turn = $derived(session?.turn ?? 0);

	// ── This turn: the drawing and the guess feed ────────────────────────
	const liveTurn = $derived(status === 'drawing' || status === 'reveal' ? turn : null);
	let chunks = $state<Chunk[]>([]);
	let feed = $state<Guess[]>([]);
	$effect(() => {
		const t = liveTurn;
		chunks = [];
		feed = [];
		if (t === null) return;
		const c = code;
		const offStrokes = listenStrokes(c, t, (list) => (chunks = list));
		const offGuesses = listenGuesses(c, t, { max: 40 }, (list) => (feed = list));
		return () => {
			offStrokes();
			offGuesses();
		};
	});
	const correctCount = $derived(new Set(feed.filter((g) => g.ok).map((g) => g.pid)).size);

	// ── Control ──────────────────────────────────────────────────────────
	let busy = $state<DrawControl | null>(null);
	let actionError = $state('');

	async function run(action: DrawControl) {
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

	$effect(() => {
		if (loadState === 'ready') adminAuth.user?.getIdToken().then((t) => control(t, code, 'sync')).catch(() => {});
	});

	let now = $state(serverNow());
	$effect(() => {
		const id = setInterval(() => (now = serverNow()), 250);
		return () => clearInterval(id);
	});

	// This screen keeps the game moving: hints, end of turn, next artist.
	// Retried every few seconds if a request fails.
	let ticking = false;
	let lastTick = 0;
	$effect(() => {
		const due = session ? dueAt(session) : null;
		if (due === null || now < due || ticking || busy || Date.now() - lastTick < 2500) return;
		ticking = true;
		lastTick = Date.now();
		adminAuth.user
			?.getIdToken()
			.then((t) => control(t, code, 'advance'))
			.catch(() => {})
			.finally(() => (ticking = false));
	});

	// Players whose phone has gone quiet are removed; this screen asks the
	// server to check every 20 seconds (each new turn checks too).
	$effect(() => {
		if (status === 'finished' || loadState !== 'ready') return;
		const sweep = () => adminAuth.user?.getIdToken().then((t) => control(t, code, 'sweep')).catch(() => {});
		const timer = setInterval(sweep, 20_000);
		return () => clearInterval(timer);
	});

	// Announce who left.
	let leftNotice = $state<{ text: string; at: number } | null>(null);
	let seenKick: number | null = null;
	$effect(() => {
		const k = session?.kicked;
		if (!k) return;
		if (seenKick !== null && k.at !== seenKick) {
			const shown = k.names.slice(0, 3).join(', ');
			const more = k.count - Math.min(3, k.names.length);
			leftNotice = { text: `${shown}${more > 0 ? ` and ${more} more` : ''} went offline and left the game`, at: k.at };
			const at = k.at;
			setTimeout(() => leftNotice?.at === at && (leftNotice = null), 5000);
		}
		seenKick = k.at;
	});

	// ── Final gallery ────────────────────────────────────────────────────
	let gallery = $state<{ turn: TurnDoc; chunks: Chunk[] }[] | null>(null);
	$effect(() => {
		if (status !== 'finished' || session?.scoring) {
			gallery = null;
			return;
		}
		const c = code;
		const from = session?.firstTurn ?? 0;
		let cancelled = false;
		loadTurns(c, from)
			.then((turns) => Promise.all(turns.map(async (t) => ({ turn: t, chunks: await loadStrokes(c, t.turn) }))))
			.then((list) => !cancelled && (gallery = list))
			.catch(() => !cancelled && (gallery = []));
		return () => (cancelled = true);
	});

	// ── Chrome ───────────────────────────────────────────────────────────
	let confirmEnd = $state(false);
	let confirmRestart = $state(false);
	let fullscreen = $state(false);
	function toggleFullscreen() {
		if (document.fullscreenElement) document.exitFullscreen();
		else document.documentElement.requestFullscreen?.().catch(() => {});
	}

	const lobbyPlayers = $derived([...players].sort((a, b) => b.joinedAt - a.joinedAt));
	const board = $derived(session ? asRankEntries(session.leaderboard) : []);
	const reveal = $derived(session?.reveal ?? null);
	const podium = $derived(session?.leaderboard.slice(0, 3) ?? []);
	const podiumOrder = $derived([podium[1], podium[0], podium[2]].filter(Boolean));
	const medal = (rank: number) => (rank === 1 ? '🥇' : rank === 2 ? '🥈' : '🥉');
	const turnLabel = $derived(session ? `${Math.min(session.totalTurns, session.drawCount + (status === 'choosing' ? 1 : 0))} / ${session.totalTurns}` : '');
	const tagClass = (d: string) =>
		d === 'easy' ? 'border-green-300/50 bg-green-300/10 text-green-300' : d === 'medium' ? 'border-sun/50 bg-sun/10 text-sun' : 'border-attention/50 bg-attention/10 text-attention';
	const reasonText: Record<string, string> = {
		time: 'Time’s up!',
		all: 'Everyone got it!',
		idle: 'Nothing was drawn',
		host: 'Turn skipped',
		away: 'The artist is away',
		offline: 'The artist went offline'
	};
</script>

<svelte:head><title>{code} · Scribble Showdown — ZenCode</title></svelte:head>
<svelte:document onfullscreenchange={() => (fullscreen = !!document.fullscreenElement)} />

<GameStage>
	<!-- Top bar -->
	<header class="flex items-center gap-4 border-b border-white/10 bg-stage/50 px-5 py-3 backdrop-blur md:px-8">
		<Logo />
		<span class="hidden h-5 w-px bg-white/15 sm:block"></span>
		<p class="hidden font-display text-sm font-bold tracking-[0.18em] uppercase sm:block">Scribble Showdown</p>
		<div class="ml-auto flex items-center gap-2 md:gap-4">
			{#if session && status !== 'lobby' && status !== 'finished'}
				<span class="hidden text-sm text-cream/70 tabular md:inline">Turn {turnLabel}</span>
			{/if}
			<span class="rounded-md border border-white/15 px-2.5 py-1 font-mono text-sm font-semibold tracking-[0.2em] text-sun">{code}</span>
			<span class="inline-flex items-center gap-1.5 text-sm text-cream/80 tabular" aria-live="polite"><Users class="size-4" />{players.length}</span>
			<button type="button" class="grid size-9 place-items-center rounded-md text-cream/70 hover:bg-white/10 hover:text-cream" aria-label={fullscreen ? 'Exit full screen' : 'Full screen'} onclick={toggleFullscreen}>
				{#if fullscreen}<Minimize class="size-4" />{:else}<Maximize class="size-4" />{/if}
			</button>
			<a href={backHref} class="grid size-9 place-items-center rounded-md text-cream/70 hover:bg-white/10 hover:text-cream" aria-label="Close presenter"><X class="size-5" /></a>
		</div>
	</header>

	<main class="flex flex-1 flex-col px-4 py-5 md:px-8 md:py-6">
		{#if loadState === 'loading'}
			<div class="m-auto flex items-center gap-3 text-cream/70"><Spinner /> Loading game…</div>
		{:else if loadState === 'missing' || loadState === 'error'}
			<div class="m-auto max-w-md rounded-2xl bg-stage/80 p-8 text-center" role="alert">
				<CloudOff class="mx-auto size-10 text-cream/50" />
				<p class="mt-4 text-xl font-semibold">{loadState === 'missing' ? 'This game session does not exist.' : 'Unable to load the game.'}</p>
				<p class="mt-1 text-cream/60">{loadState === 'missing' ? 'It may have been removed.' : 'Check your connection, then reload.'}</p>
				<Button variant="stage" class="mt-6" href={backHref}><ArrowLeft class="size-4" /> Back to games</Button>
			</div>
		{:else if session}
			<div class="grid flex-1">
				{#key `${status}/${turn}`}
					<div class="flex min-h-0 flex-col [grid-area:1/1]" in:fly={{ y: 24, duration: 420, delay: 120 }} out:fade={{ duration: 120 }}>
						{#if status === 'lobby'}
							<!-- LOBBY -->
							<div class="m-auto grid w-full max-w-6xl items-center gap-10 lg:grid-cols-[1.2fr_1fr]">
								<div class="text-center lg:text-left">
									<p class="eyebrow text-green-300">Live game · Draw &amp; guess</p>
									<h1 class="scribble-head mt-3 font-display text-6xl leading-[0.88] font-bold tracking-tight uppercase md:text-8xl">Scribble<br />Showdown</h1>
									<ol class="mx-auto mt-6 grid max-w-xl gap-3 text-left text-lg text-cream/85 lg:mx-0">
										<li class="flex gap-3"><span class="step">1</span> One player draws a secret word on their phone.</li>
										<li class="flex gap-3"><span class="step">2</span> Everyone else races to guess it — faster pays more.</li>
										<li class="flex gap-3"><span class="step">3</span> Streaks, speed bonuses and harder words score big.</li>
									</ol>
									<p class="mt-5 flex flex-wrap justify-center gap-2 text-sm lg:justify-start">
										<span class="chip">{session.totalTurns} turns</span>
										<span class="chip">{session.drawSeconds}s to draw</span>
										{#each session.packs as p (p)}<span class="chip">{PACKS.find((x) => x.id === p)?.name ?? p}</span>{/each}
										{#if session.customCount}<span class="chip">+{session.customCount} custom words</span>{/if}
									</p>
									<div class="mt-7">
										<p class="eyebrow text-cream/60">Game code</p>
										<p class="mt-1 font-mono text-6xl font-bold tracking-[0.18em] md:text-7xl">{code}</p>
										<p class="mt-2 font-mono text-sm break-all text-cream/50">{joinUrl}</p>
									</div>
								</div>
								<div class="mx-auto w-full max-w-[min(24rem,48vh)]">
									<div class="rounded-3xl border border-sun/40 bg-white p-4 shadow-[0_0_90px_-20px_var(--color-sun)]">
										<QrCode value={joinUrl} label="Scan to join game {code}" />
									</div>
									<p class="mt-4 text-center font-display text-2xl font-bold tracking-[0.2em] uppercase">Scan to play</p>
									<p class="mt-3 flex items-baseline justify-center gap-3" aria-live="polite">
										<XpCounter value={players.length} duration={400} class="font-display text-5xl font-bold text-green-300" />
										<span class="tracking-[0.18em] text-cream/70 uppercase">{players.length === 1 ? 'player' : 'players'}</span>
									</p>
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
						{:else if status === 'choosing'}
							<!-- CHOOSING -->
							<div class="m-auto grid w-full max-w-6xl items-center gap-10 {board.length ? 'lg:grid-cols-[1fr_26rem]' : ''}">
								<div class="text-center">
									<p class="eyebrow text-green-300">Turn {turnLabel} · Next artist</p>
									<h2 class="scribble-head mt-3 font-display text-6xl font-bold wrap-break-word md:text-8xl" in:scale={{ start: 0.6, duration: 600, easing: backOut }}>{session.drawerName}</h2>
									<p class="mt-3 text-2xl text-cream/75">is choosing a word…</p>
									<div class="mt-10 flex justify-center gap-4" aria-hidden="true">
										{#each ['easy', 'medium', 'hard'] as d, i (d)}
											<div class="card-back grid h-36 w-28 place-items-center rounded-2xl border-2 md:h-44 md:w-32 {tagClass(d)}" style:--i={i}>
												<div class="text-center">
													<Brush class="mx-auto size-8" />
													<p class="mt-2 text-sm font-bold uppercase">{d}</p>
													<p class="text-xs opacity-80">×{MULTIPLIER[d as 'easy']}</p>
												</div>
											</div>
										{/each}
									</div>
									<div class="mx-auto mt-10 size-24">
										<Countdown endsAt={session.phaseEndsAt} total={CHOOSE_MS / 1000} />
									</div>
								</div>
								{#if board.length}
									<section class="rounded-3xl border border-white/10 bg-stage/75 p-5 backdrop-blur-md">
										<h3 class="font-display text-2xl font-bold tracking-tight uppercase">Leaderboard</h3>
										<div class="mt-4"><Leaderboard entries={board} limit={8} unit="pts" /></div>
									</section>
								{/if}
							</div>
						{:else if status === 'drawing'}
							<!-- DRAWING -->
							<!-- On big screens the drawing takes all the height there is (less the bars above and below). -->
							<div class="mx-auto grid min-h-0 w-full max-w-[110rem] flex-1 gap-5 lg:h-[calc(100dvh-11rem)] lg:grid-cols-[minmax(0,1fr)_24rem]">
								<section class="flex min-h-[60vh] flex-col gap-3 lg:min-h-0">
									<div class="flex items-center gap-4">
										<div class="min-w-0 shrink-0">
											<p class="eyebrow text-cream/55">Artist</p>
											<p class="truncate font-display text-2xl font-bold">{session.drawerName}</p>
											{#if session.difficulty}
												<span class="mt-1 inline-block rounded-full border px-2.5 py-0.5 text-xs font-bold uppercase {tagClass(session.difficulty)}">{session.difficulty} ×{MULTIPLIER[session.difficulty]}</span>
											{/if}
										</div>
										<div class="min-w-0 flex-1">
											{#if session.mask}<WordMask mask={session.mask} size="xl" />{/if}
										</div>
										<div class="size-20 shrink-0 md:size-24"><Countdown endsAt={session.phaseEndsAt} total={session.drawSeconds} /></div>
									</div>
									<CanvasFrame class="flex-1">
										<ScribbleCanvas {chunks} label="{session.drawerName}’s drawing" />
									</CanvasFrame>
									{#if !session.inked}
										<p class="text-center text-cream/60" transition:fade><Brush class="mr-1 inline size-4" /> Waiting for {session.drawerName} to start drawing…</p>
									{/if}
								</section>

								<aside class="flex min-h-0 flex-col gap-4">
									<div class="rounded-3xl border border-white/10 bg-stage/75 p-5 backdrop-blur-md">
										<div class="flex items-baseline justify-between">
											<p class="font-display text-xl font-bold uppercase">Guessed</p>
											<p class="font-display text-3xl font-bold text-green-300 tabular">{correctCount}<span class="text-lg text-cream/50"> / {session.eligible}</span></p>
										</div>
										<div class="mt-3 h-2 overflow-hidden rounded-full bg-white/10">
											<div class="h-full rounded-full bg-green-300 transition-[width] duration-500" style:width="{Math.min(100, (correctCount / Math.max(1, session.eligible)) * 100)}%"></div>
										</div>
									</div>
									<section class="flex min-h-64 flex-1 flex-col overflow-hidden rounded-3xl border border-white/10 bg-stage/75 p-5 backdrop-blur-md" aria-labelledby="feed-h">
										<h3 id="feed-h" class="flex items-center justify-between font-display text-xl font-bold uppercase">
											Guesses <span class="inline-flex items-center gap-1.5 text-xs font-semibold text-green-300 normal-case"><span class="size-2 animate-pulse rounded-full bg-green-300"></span>Live</span>
										</h3>
										{#if !feed.length}
											<p class="mt-6 text-center text-cream/55">Guesses appear here…</p>
										{:else}
											<ol class="feed-list mt-3 flex min-h-0 flex-1 flex-col gap-1.5 overflow-hidden" aria-live="polite">
												{#each feed.slice(0, 18) as g (g.id)}
													<li animate:flip={{ duration: 300 }} in:fly={{ y: -12, duration: 260 }} class="flex items-center gap-2 rounded-xl px-3 py-2 {g.ok ? 'bg-green-300/15 text-green-300' : g.close ? 'bg-sun/10 text-sun' : 'bg-white/4'}">
														{#if g.ok}
															<Check class="size-4 shrink-0" /><span class="min-w-0 flex-1 truncate font-semibold">{g.name} guessed it!</span>
															<span class="font-display font-bold">+{g.pts}</span>
															{#if (g.streak ?? 0) >= 2}<span class="inline-flex items-center text-xs text-attention"><Flame class="size-3.5" />{g.streak}</span>{/if}
														{:else if g.close}
															<Sparkles class="size-4 shrink-0" /><span class="min-w-0 flex-1 truncate font-semibold">{g.name} is so close!</span>
														{:else}
															<span class="max-w-[40%] shrink-0 truncate text-sm font-semibold text-cream/60">{g.name}</span>
															<span class="min-w-0 flex-1 truncate text-cream/90">{g.text}</span>
														{/if}
													</li>
												{/each}
											</ol>
										{/if}
									</section>
									<div class="hidden items-center gap-4 rounded-3xl border border-white/10 bg-stage/75 p-4 backdrop-blur-md lg:flex">
										<div class="w-20 shrink-0 rounded-lg bg-white p-1"><QrCode value={joinUrl} label="Scan to join game {code}" /></div>
										<div>
											<p class="font-display font-bold uppercase">Join any time</p>
											<p class="font-mono text-2xl font-bold tracking-[0.15em] text-sun">{code}</p>
										</div>
									</div>
								</aside>
							</div>
						{:else if status === 'reveal'}
							<!-- REVEAL -->
							<div class="m-auto grid w-full max-w-7xl items-start gap-8 lg:grid-cols-[minmax(0,1fr)_28rem]">
								<div class="text-center">
									{#if reveal}
										<p class="eyebrow text-green-300">{reasonText[reveal.reason]}</p>
										{#if reveal.word}
											<p class="mt-2 text-xl text-cream/70">The word was</p>
											<div class="mt-2" in:scale={{ start: 0.6, duration: 600, easing: backOut }}><WordMask mask={reveal.word} size="xl" solved /></div>
											<LivingDrawing {chunks} word={reveal.word} ready={!session.scoring} class="mx-auto mt-6 w-full max-w-xl" />
											{#if session.scoring}
												<p class="mt-5 flex items-center justify-center gap-2 text-cream/70"><Spinner class="size-4" /> Adding up points…</p>
											{:else}
												<p class="mt-5 text-xl" in:fade>
													<span class="font-semibold">{reveal.drawerName}</span> earns
													<span class="font-display text-3xl font-bold text-sun">+<XpCounter value={reveal.drawerPoints} from={0} /></span>
													<span class="text-cream/60">· {reveal.guessed}/{reveal.eligible} guessed</span>
												</p>
												{#if reveal.masterpiece}<p class="mt-2 font-display text-2xl font-bold text-green-300" in:scale={{ start: 0.5, duration: 500, delay: 300, easing: backOut }}>🎨 Masterpiece! Everyone got it</p>{/if}
											{/if}
										{:else}
											<p class="mt-6 font-display text-5xl font-bold">{reveal.drawerName}</p>
											<p class="mt-2 text-xl text-cream/70">
												{reveal.reason === 'host' ? 'Turn skipped.' : reveal.reason === 'offline' ? 'went offline.' : 'didn’t pick a word in time.'} Next artist coming up…
											</p>
										{/if}
									{/if}
								</div>
								{#if !session.scoring && (board.length || reveal?.gains.length)}
									<div class="flex flex-col gap-5">
										{#if reveal?.gains.length}
											<section class="rounded-3xl border border-white/10 bg-stage/75 p-5 backdrop-blur-md">
												<h3 class="font-display text-xl font-bold uppercase">Fastest</h3>
												<ol class="mt-3 space-y-1.5">
													{#each reveal.gains.slice(0, 3) as g, i (g.id)}
														<li class="flex items-center gap-3 text-lg" in:fly={{ x: 20, duration: 400, delay: 200 + i * 150 }}>
															<span>{medal(i + 1)}</span><span class="min-w-0 flex-1 truncate font-semibold">{g.name}</span>
															<span class="font-display font-bold text-sun">+{g.points}</span>
														</li>
													{/each}
												</ol>
											</section>
										{/if}
										{#if board.length}
											<section class="rounded-3xl border border-white/10 bg-stage/75 p-5 backdrop-blur-md">
												<h3 class="font-display text-xl font-bold uppercase">Leaderboard</h3>
												<div class="mt-3"><Leaderboard entries={board} limit={8} unit="pts" /></div>
											</section>
										{/if}
									</div>
								{/if}
							</div>
						{:else}
							<!-- FINAL -->
							{#if !session.scoring && podium.length}<Confetti count={140} />{/if}
							<div class="relative mx-auto w-full max-w-6xl pb-6">
								<p class="eyebrow text-center text-green-300">Scribble Showdown</p>
								<h2 class="scribble-head mt-2 text-center font-display text-5xl font-bold tracking-tight uppercase md:text-7xl">Final leaderboard</h2>
								{#if session.scoring}
									<div class="mt-16 flex items-center justify-center gap-3 text-cream/80"><Spinner /> Counting final scores…</div>
								{:else if !podium.length}
									<p class="mt-16 text-center text-cream/60">No scores this game.</p>
								{:else}
									<div class="mx-auto mt-12 grid max-w-4xl grid-cols-3 items-end gap-3 md:gap-6">
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
														? 'h-40 border-sun/50 bg-linear-to-b from-sun/30 to-transparent shadow-[0_0_80px_-20px_var(--color-sun)] md:h-56'
														: e.rank === 2
															? 'h-28 border-green-300/40 bg-linear-to-b from-green-300/20 to-transparent md:h-40'
															: 'h-20 border-green-300/25 bg-linear-to-b from-green-300/10 to-transparent md:h-28'}"
												>
													<p class="pt-3 font-mono text-2xl font-bold text-cream/60">#{e.rank}</p>
												</div>
											</div>
										{/each}
									</div>
									{#if session.leaderboard.length > 3}
										<div class="mx-auto mt-8 max-w-2xl" in:fade={{ delay: 1400, duration: 400 }}>
											<Leaderboard entries={board.slice(3)} limit={7} unit="pts" />
										</div>
									{/if}
								{/if}

								{#if gallery?.length}
									<section class="mt-14" in:fade={{ delay: 1800, duration: 500 }} aria-labelledby="gallery-h">
										<h3 id="gallery-h" class="flex items-center justify-center gap-2 font-display text-3xl font-bold uppercase"><Images class="size-7 text-sun" /> The gallery</h3>
										<ul class="mt-6 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
											{#each gallery as g, i (g.turn.turn)}
												<li class="rounded-2xl border border-white/10 bg-stage/70 p-3 backdrop-blur" in:fly={{ y: 24, duration: 500, delay: 1900 + i * 120 }}>
													<CanvasFrame fluid><ScribbleCanvas chunks={g.chunks} label="{g.turn.word}, drawn by {g.turn.drawerName}" /></CanvasFrame>
													<div class="mt-2 flex items-baseline justify-between gap-2 px-1">
														<p class="truncate font-display text-lg font-bold uppercase">{g.turn.word}</p>
														<p class="shrink-0 text-sm text-cream/60">by {g.turn.drawerName} · {g.turn.guessed ?? 0} got it</p>
													</div>
												</li>
											{/each}
										</ul>
									</section>
								{/if}
							</div>
						{/if}
					</div>
				{/key}
			</div>
		{/if}
	</main>

	{#if leftNotice}
		<div class="pointer-events-none fixed inset-x-0 top-20 z-30 flex justify-center px-4" role="status" in:fly={{ y: -16, duration: 300 }} out:fade>
			<p class="inline-flex items-center gap-2 rounded-full border border-attention/40 bg-stage/90 px-4 py-2 text-sm font-semibold shadow-lg backdrop-blur">
				<WifiOff class="size-4 text-attention" />{leftNotice.text}
			</p>
		</div>
	{/if}

	<!-- Controls -->
	{#if session && loadState === 'ready'}
		<footer class="sticky bottom-0 z-20 border-t border-white/10 bg-stage/85 px-5 py-3 backdrop-blur md:px-8">
			<div class="mx-auto flex max-w-7xl flex-wrap items-center gap-2">
				{#if actionError}<p class="mr-auto text-sm text-attention" role="alert">{actionError}</p>{/if}
				<div class="ml-auto flex flex-wrap items-center gap-2">
					{#if status === 'lobby'}
						<Button variant="stage" size="lg" onclick={() => (confirmEnd = true)}><Flag class="size-4" /> Close lobby</Button>
						<Button variant="sun" size="lg" onclick={() => run('start')} loading={busy === 'start'} disabled={players.length < 2}>
							<Play class="size-4" />{players.length < 2 ? 'Waiting for 2+ players…' : `Start · ${players.length} players`}
						</Button>
					{:else if status === 'finished'}
						<Button variant="stage" size="lg" href={backHref}><ArrowLeft class="size-4" /> Back to games</Button>
						<Button variant="sun" size="lg" onclick={() => (confirmRestart = true)} loading={busy === 'restart'}><RotateCcw class="size-4" /> Play again</Button>
					{:else}
						<Button variant="stage" size="lg" onclick={() => run('skip')} loading={busy === 'skip'} disabled={status === 'reveal' && session.scoring}>
							<SkipForward class="size-4" />{status === 'reveal' ? 'Next turn' : 'Skip turn'}
						</Button>
						<Button variant="stage" size="lg" onclick={() => (confirmRestart = true)} loading={busy === 'restart'}><RotateCcw class="size-4" /> Restart</Button>
						<Button variant="stage" size="lg" onclick={() => (confirmEnd = true)} loading={busy === 'finish'}><Flag class="size-4" /> End game</Button>
					{/if}
				</div>
			</div>
		</footer>
	{/if}
</GameStage>

<Modal
	open={confirmEnd}
	title={status === 'lobby' ? 'Close this lobby?' : 'End the game now?'}
	description={status === 'lobby' ? 'Players can no longer join.' : 'The current turn is scored and the final leaderboard is shown.'}
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

<Modal
	open={confirmRestart}
	title={status === 'finished' ? 'Play again?' : 'Restart the game?'}
	description="Back to the lobby with the same code. Players stay joined, every score goes back to zero."
	onclose={() => (confirmRestart = false)}
>
	<p class="text-sm text-muted-foreground">{status === 'finished' ? 'This leaderboard is cleared.' : 'The turn in progress won’t count.'}</p>
	{#snippet footer()}
		<Button variant="ghost" onclick={() => (confirmRestart = false)}>Cancel</Button>
		<Button
			variant="destructive"
			loading={busy === 'restart'}
			onclick={async () => {
				confirmRestart = false;
				await run('restart');
			}}><RotateCcw class="size-4" /> Restart</Button
		>
	{/snippet}
</Modal>

<style>
	.scribble-head {
		-webkit-text-stroke: 2px rgba(0, 0, 0, 0.35);
		paint-order: stroke fill;
		text-shadow: 0 5px 0 rgba(0, 0, 0, 0.35);
	}
	.step {
		display: grid;
		place-items: center;
		flex-shrink: 0;
		width: 2rem;
		height: 2rem;
		border-radius: 9999px;
		background: var(--color-sun);
		color: var(--color-forest-950);
		font-family: var(--font-display);
		font-weight: 700;
	}
	.chip {
		border-radius: 9999px;
		border: 1px solid rgb(255 255 255 / 0.15);
		background: rgb(255 255 255 / 0.05);
		padding: 0.25rem 0.75rem;
		font-weight: 600;
	}
	.card-back {
		animation: wobble 1.6s ease-in-out infinite;
		animation-delay: calc(var(--i) * 0.2s);
	}
	@keyframes wobble {
		0%,
		100% {
			transform: translateY(0) rotate(-3deg);
		}
		50% {
			transform: translateY(-10px) rotate(3deg);
		}
	}
	/* Older guesses fade out at the bottom of the feed. */
	.feed-list {
		mask-image: linear-gradient(to bottom, black 70%, transparent);
	}
	@media (prefers-reduced-motion: reduce) {
		.card-back {
			animation: none;
		}
	}
</style>
