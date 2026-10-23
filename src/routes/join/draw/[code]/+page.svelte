<script lang="ts">
	import { page } from '$app/state';
	import { untrack } from 'svelte';
	import { doc, onSnapshot } from 'firebase/firestore';
	import { fade, fly, scale } from 'svelte/transition';
	import { backOut } from 'svelte/easing';
	import { CloudOff, RotateCcw, Timer, Trophy, Flame, Send, Check, Brush, Sparkles, Hourglass, Palette } from '@lucide/svelte';
	import { db } from '$lib/firebase/client';
	import { SESSIONS } from '$lib/games/tech-word-rush/types';
	import { serverNow } from '$lib/games/tech-word-rush/api';
	import { CODE_RE, GAME_TYPE, asRankEntries, type DrawPlayer, type DrawSession, type DrawView, type Op } from '$lib/games/scribble/types';
	import { forgetIdentity, join, loadIdentity, play, sendStrokes, type Identity } from '$lib/games/scribble/api';
	import { MULTIPLIER, dueAt, streakMultiplier } from '$lib/games/scribble/engine';
	import { listenGuesses, listenStrokes, type Chunk, type Guess } from '$lib/games/scribble/live';
	import ScribbleCanvas, { type Tool } from '$lib/components/games/scribble/ScribbleCanvas.svelte';
	import CanvasFrame from '$lib/components/games/scribble/CanvasFrame.svelte';
	import DrawTools from '$lib/components/games/scribble/DrawTools.svelte';
	import WordMask from '$lib/components/games/scribble/WordMask.svelte';
	import Leaderboard from '$lib/components/games/Leaderboard.svelte';
	import XpCounter from '$lib/components/games/XpCounter.svelte';
	import Confetti from '$lib/components/live/Confetti.svelte';
	import Logo from '$lib/components/site/Logo.svelte';
	import Button from '$lib/components/ui/Button.svelte';
	import Spinner from '$lib/components/ui/Spinner.svelte';

	const code = $derived((page.params.code ?? '').toUpperCase());

	// ── Session (public doc) ─────────────────────────────────────────────
	let session = $state<DrawSession | null>(null);
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
				const s = snap.data() as DrawSession | undefined;
				session = s?.gameType === GAME_TYPE ? s : null;
				loadState = session ? 'ready' : 'missing';
			},
			() => (loadState = 'error')
		);
	});

	let now = $state(serverNow());
	$effect(() => {
		const id = setInterval(() => (now = serverNow()), 250);
		return () => clearInterval(id);
	});

	const status = $derived(session?.status ?? 'lobby');
	const turn = $derived(session?.turn ?? 0);
	const endsAt = $derived(session?.phaseEndsAt ?? null);
	const timeLeft = $derived(endsAt ? Math.max(0, endsAt - now) : 0);
	const phaseTotal = $derived(status === 'drawing' ? (session?.drawSeconds ?? 60) * 1000 : endsAt && session?.phaseStartedAt ? endsAt - session.phaseStartedAt : 1);
	const fraction = $derived(Math.min(1, timeLeft / Math.max(1, phaseTotal)));
	const seconds = $derived(Math.ceil(timeLeft / 1000));

	// ── Identity (device token, no account) ──────────────────────────────
	let identity = $state<Identity | null>(null);
	let resuming = $state(true);
	let view = $state<DrawView | null>(null);

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

	// My own player doc: score and streak, live.
	let me = $state<DrawPlayer | null>(null);
	$effect(() => {
		const id = identity?.playerId;
		if (!id) return;
		return onSnapshot(doc(db(), SESSIONS, code, 'players', id), (snap) => (me = (snap.data() as DrawPlayer | undefined) ?? null));
	});

	const myId = $derived(identity?.playerId ?? null);
	const amDrawer = $derived(!!myId && session?.drawerId === myId && (status === 'choosing' || status === 'drawing'));
	const fresh = $derived(view?.turn === turn ? view : null);
	const guessedIt = $derived(!!fresh?.guessed);
	const mine = $derived(myId ? (session?.leaderboard.find((e) => e.id === myId) ?? null) : null);

	// The artist needs the private part of the turn (the three words, then the word).
	let viewLoading = $state(false);
	$effect(() => {
		const key = amDrawer ? `${turn}/${status}` : null;
		if (!key || !identity) return;
		untrack(() => {
			if (fresh && (status === 'choosing' ? fresh.options : fresh.word)) return;
			viewLoading = true;
			play(code, identity!, 'state')
				.then((v) => (view = v))
				.catch(() => {})
				.finally(() => (viewLoading = false));
		});
	});

	// ── This turn's drawing and guesses ──────────────────────────────────
	const liveTurn = $derived(status === 'drawing' || status === 'reveal' ? turn : null);
	let chunks = $state<Chunk[]>([]);
	let correct = $state<Guess[]>([]);
	$effect(() => {
		const t = liveTurn;
		chunks = [];
		correct = [];
		if (t === null) return;
		const c = code;
		const offStrokes = listenStrokes(c, t, (list) => (chunks = list));
		const offGuesses = listenGuesses(c, t, { correctOnly: true }, (list) => (correct = list));
		return () => {
			offStrokes();
			offGuesses();
		};
	});

	// ── Guessing ─────────────────────────────────────────────────────────
	type MyGuess = { id: number; text: string; state: 'pending' | 'wrong' | 'close' | 'correct' | 'rejected' };
	let myGuesses = $state<MyGuess[]>([]);
	let guessText = $state('');
	let notice = $state('');
	let celebrate = $state<{ points: number; key: number } | null>(null);
	let nextGuessId = 0;

	$effect(() => {
		turn;
		myGuesses = [];
		notice = '';
		guessText = '';
	});

	async function submitGuess(e: SubmitEvent) {
		e.preventDefault();
		const text = guessText.trim();
		if (!text || !identity || guessedIt) return;
		guessText = '';
		notice = '';
		const id = nextGuessId++;
		myGuesses = [{ id, text, state: 'pending' as const }, ...myGuesses].slice(0, 15);
		const mark = (state: MyGuess['state']) => (myGuesses = myGuesses.map((g) => (g.id === id ? { ...g, state } : g)));
		try {
			const v = await play(code, identity, 'guess', { text });
			view = v;
			if (v.rejected) {
				mark('rejected');
				notice = v.rejected;
			} else if (v.result === 'correct') {
				mark('correct');
				celebrate = { points: v.points ?? 0, key: Date.now() };
				navigator.vibrate?.([30, 40, 60]);
				setTimeout(() => (celebrate = null), 2600);
			} else {
				mark(v.result === 'close' ? 'close' : 'wrong');
				if (v.result === 'close') navigator.vibrate?.(20);
			}
		} catch (err) {
			mark('rejected');
			notice = (err as Error).message || 'That guess didn’t go through.';
		}
	}

	// ── Picking a word, drawing ──────────────────────────────────────────
	let picking = $state<number | null>(null);
	let pickError = $state('');

	async function pick(index: number) {
		if (!identity || picking !== null) return;
		picking = index;
		pickError = '';
		try {
			view = await play(code, identity, 'choose', { turn, index });
		} catch (err) {
			pickError = (err as Error).message || 'Couldn’t pick that word.';
		} finally {
			picking = null;
		}
	}

	let color = $state(0);
	let brush = $state(1);
	let tool = $state<Tool>('brush');
	let canUndo = $state(false);
	let pad = $state<ReturnType<typeof ScribbleCanvas>>();
	let practice = $state<ReturnType<typeof ScribbleCanvas>>();
	let practiceUndo = $state(false);

	/** Bound to one turn, so strokes still being sent as the turn ends can't land in the next one. */
	const sendFor = (t: number) => (seq: number, ops: Op[]) => sendStrokes(code, identity!, t, seq, ops).then((r) => !r.closed);

	// ── Keeping the game moving ──────────────────────────────────────────
	// The big screen normally moves the game on; phones nudge the server if
	// it hasn't — the artist first, everyone else a little later, spread out.
	const jitter = Math.random() * 6000;
	let lastNudge = 0;
	$effect(() => {
		if (!identity || !session) return;
		const due = dueAt(session);
		if (due === null) return;
		const wait = amDrawer ? 1500 : 7000 + jitter;
		if (now > due + wait && Date.now() - lastNudge > 5000) {
			lastNudge = Date.now();
			play(code, identity, 'advance')
				.then((v) => (view = v))
				.catch(() => {});
		}
	});

	// ── Reveal ───────────────────────────────────────────────────────────
	const reveal = $derived(session?.reveal ?? null);
	const myPlace = $derived(myId && reveal ? reveal.gains.findIndex((g) => g.id === myId) : -1);
	const myGain = $derived(reveal && myPlace >= 0 ? reveal.gains[myPlace] : null);
	const iDrew = $derived(!!myId && reveal?.drawerId === myId);
	const medal = (rank: number) => (rank === 1 ? '🥇' : rank === 2 ? '🥈' : rank === 3 ? '🥉' : '');
	const reasonText: Record<string, string> = {
		time: 'Time’s up!',
		all: 'Everyone got it!',
		idle: 'The artist didn’t draw anything.',
		host: 'The host skipped this turn.',
		away: 'The artist seems to be away.'
	};
	const board = $derived(session ? asRankEntries(session.leaderboard) : []);
	const tag = (d: string) => (d === 'easy' ? 'Easy' : d === 'medium' ? 'Medium' : 'Hard');
	const tagClass = (d: string) =>
		d === 'easy' ? 'border-green-300/50 bg-green-300/10 text-green-300' : d === 'medium' ? 'border-sun/50 bg-sun/10 text-sun' : 'border-attention/50 bg-attention/10 text-attention';
</script>

<svelte:head><title>Scribble Showdown · {code} — ZenCode</title></svelte:head>

<div class="fixed inset-0 flex flex-col overflow-hidden bg-stage text-cream">
	<div class="doodle-bg pointer-events-none absolute inset-0 opacity-[0.07]" aria-hidden="true"></div>

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
		{#if mine && mine.rank <= 3 && !session.scoring}<Confetti />{/if}
		<main class="relative mx-auto flex w-full max-w-md flex-1 flex-col overflow-y-auto px-4 pt-[max(1.25rem,env(safe-area-inset-top))] pb-8">
			<Logo />
			<p class="eyebrow mt-8 text-green-300">Scribble Showdown · {code}</p>
			<h1 class="mt-2 font-display text-4xl font-bold tracking-tight uppercase">Final leaderboard</h1>
			{#if session.scoring}
				<div class="mt-16 flex items-center justify-center gap-3 text-cream/70" role="status"><Spinner /> Counting final scores…</div>
			{:else}
				{#if mine}
					<div
						class="mt-6 rounded-2xl border border-sun/40 bg-linear-to-br from-sun/20 to-transparent p-5 shadow-[0_0_60px_-24px_var(--color-sun)]"
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
						{#if me}<p class="mt-2 text-sm text-cream/60">Guessed {me.guessed} · drew {me.drew}</p>{/if}
					</div>
				{/if}
				<div class="mt-6">
					{#if board.length}
						<Leaderboard entries={board} limit={20} highlightId={myId} unit="pts" />
					{:else}
						<p class="text-center text-cream/60">Nobody scored this time.</p>
					{/if}
				</div>
				<Button variant="stage" class="mt-8" href="/join">Join another game</Button>
			{/if}
		</main>
	{:else if !identity}
		<!-- JOIN -->
		<main class="relative mx-auto flex w-full max-w-md flex-1 flex-col justify-end overflow-y-auto px-5 pt-[max(1rem,env(safe-area-inset-top))] pb-[max(1.5rem,env(safe-area-inset-bottom))]">
			<div class="flex flex-1 items-center justify-center py-6">
				<svg viewBox="0 0 220 150" class="w-full max-w-72" aria-hidden="true">
					<rect x="8" y="10" width="204" height="130" rx="14" fill="#fff" />
					<path class="scribble-path" d="M40 110 C 55 60, 80 40, 105 70 S 150 120, 175 50" fill="none" stroke="#2563eb" stroke-width="7" stroke-linecap="round" />
					<circle class="scribble-dot" cx="64" cy="48" r="13" fill="#facc15" />
					<path class="scribble-path delay" d="M120 112 l18 -30 l18 30 z" fill="none" stroke="#ef4444" stroke-width="6" stroke-linejoin="round" />
					<g class="pencil">
						<animateMotion dur="2.6s" repeatCount="indefinite" keyPoints="0;1;1" keyTimes="0;0.45;1" calcMode="linear" path="M40 110 C 55 60, 80 40, 105 70 S 150 120, 175 50" />
						<rect x="-6" y="-46" width="12" height="40" rx="2" fill="#f0c45c" />
						<path d="M-6 -6 L0 6 L6 -6Z" fill="#fcd5b5" />
						<rect x="-6" y="-52" width="12" height="7" rx="2" fill="#ec4899" />
					</g>
				</svg>
			</div>
			<div in:fly={{ y: 24, duration: 450 }}>
				<p class="eyebrow text-green-300">Live game · {code}</p>
				<h1 class="scribble-head mt-2 font-display text-5xl leading-[0.9] font-bold tracking-tight uppercase">Scribble<br />Showdown</h1>
				<ul class="mt-4 space-y-1.5 text-[15px] text-cream/80">
					<li class="flex gap-2"><Brush class="mt-0.5 size-4 shrink-0 text-sun" /> Take turns drawing a secret word.</li>
					<li class="flex gap-2"><Sparkles class="mt-0.5 size-4 shrink-0 text-sun" /> Guess what others draw — faster pays more.</li>
					<li class="flex gap-2"><Flame class="mt-0.5 size-4 shrink-0 text-sun" /> Guess in a row to build a streak bonus.</li>
				</ul>
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
					<Button type="submit" variant="sun" size="xl" class="w-full" loading={joining}>{joining ? 'Joining…' : 'Join & draw'}</Button>
				</form>
				<p class="mt-3 text-center text-xs text-cream/45">No sign-up needed. Your name is only used for this game.</p>
			</div>
		</main>
	{:else}
		<!-- IN THE GAME -->
		<header class="relative z-20 flex items-center gap-3 px-4 pt-[max(0.6rem,env(safe-area-inset-top))] pb-2">
			<div class="min-w-0">
				<p class="truncate font-display text-sm leading-tight font-bold tracking-[0.14em] uppercase">Scribble Showdown</p>
				<p class="truncate text-[11px] text-cream/55">{identity.name} · <span class="font-mono tracking-[0.15em]">{code}</span></p>
			</div>
			<div class="ml-auto flex items-center gap-1.5">
				{#if (me?.streak ?? 0) >= 2}
					<span class="inline-flex items-center gap-1 rounded-full border border-attention/40 bg-attention/15 px-2.5 py-1 text-xs font-bold text-attention" title="Streak bonus ×{streakMultiplier(me?.streak ?? 0).toFixed(1)}">
						<Flame class="size-3.5" />{me?.streak}
					</span>
				{/if}
				<span class="inline-flex items-center gap-1 rounded-full border border-white/15 bg-white/5 px-3 py-1 text-sm font-bold">
					<Trophy class="size-3.5 text-sun" /><XpCounter value={me?.score ?? 0} duration={900} />
				</span>
				{#if (status === 'choosing' || status === 'drawing') && endsAt}
					<span
						class="inline-flex items-center gap-1 rounded-full border px-2.5 py-1 font-mono text-sm font-bold tabular {status === 'drawing' && seconds <= 10
							? 'animate-pulse border-attention/60 bg-attention/15 text-attention'
							: 'border-white/15 bg-white/5'}"
						role="timer"
						aria-label="{seconds} seconds left"><Timer class="size-3.5" />{seconds}</span
					>
				{/if}
			</div>
		</header>
		{#if status === 'drawing' || status === 'choosing'}
			<div class="relative z-20 mx-4 h-1 shrink-0 overflow-hidden rounded-full bg-white/10" aria-hidden="true">
				<div class="h-full rounded-full transition-[width] duration-300 ease-linear {status === 'drawing' && seconds <= 10 ? 'bg-attention' : 'bg-sun'}" style:width="{fraction * 100}%"></div>
			</div>
		{/if}

		{#key `${status}/${turn}`}
			<div class="relative flex min-h-0 flex-1 flex-col" in:fade={{ duration: 220 }}>
				{#if status === 'lobby'}
					<!-- LOBBY: a doodle pad to warm up on -->
					<main class="play-grid min-h-0 flex-1 gap-3 px-3 pt-2 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
						<section class="canvas-cell flex min-h-0 flex-col gap-2">
							<div class="text-center">
								<p class="font-display text-2xl font-bold">You’re in, {identity.name}!</p>
								<p class="text-sm text-cream/60">Warm up while the host starts — this doodle stays on your phone.</p>
							</div>
							<CanvasFrame class="drawing-frame">
								<ScribbleCanvas bind:this={practice} editable {color} {brush} {tool} onchange={(empty) => (practiceUndo = !empty)} label="Practice doodle" />
							</CanvasFrame>
						</section>
						<aside class="side-cell flex min-h-0 flex-col gap-3">
							<DrawTools bind:color bind:brush bind:tool canUndo={practiceUndo} onundo={() => practice?.undo()} onclear={() => practice?.clear()} />
							<p class="flex items-center justify-center gap-2 text-sm text-cream/60"><Hourglass class="size-4" /> Waiting for the host to start…</p>
						</aside>
					</main>
				{:else if status === 'choosing'}
					<main class="mx-auto flex w-full max-w-lg flex-1 flex-col justify-center overflow-y-auto px-5 pb-8">
						{#if amDrawer}
							<div class="text-center" in:scale={{ start: 0.85, duration: 450, easing: backOut }}>
								<Palette class="mx-auto size-10 text-sun" />
								<h1 class="scribble-head mt-3 font-display text-4xl font-bold uppercase">Your turn to draw!</h1>
								<p class="mt-2 text-cream/70">Pick a word. Harder words pay everyone more — you too.</p>
							</div>
							<div class="mt-6 grid gap-3">
								{#if fresh?.options}
									{#each fresh.options as opt, i (opt.word)}
										<button
											type="button"
											onclick={() => pick(i)}
											disabled={picking !== null}
											class="group flex items-center gap-4 rounded-2xl border-2 border-white/15 bg-white/5 px-5 py-4 text-left transition-[transform,border-color,background-color] duration-150 hover:-translate-y-0.5 hover:border-sun hover:bg-sun/10 active:scale-[0.98] disabled:opacity-60"
											in:fly={{ y: 20, duration: 350, delay: 150 + i * 90 }}
										>
											<span class="min-w-0 flex-1 font-display text-2xl font-bold tracking-wide uppercase">{opt.word}</span>
											<span class="rounded-full border px-2.5 py-0.5 text-xs font-bold {tagClass(opt.difficulty)}">{tag(opt.difficulty)} ×{MULTIPLIER[opt.difficulty]}</span>
											{#if picking === i}<Spinner class="size-4" />{/if}
										</button>
									{/each}
								{:else}
									<div class="flex items-center justify-center gap-3 py-8 text-cream/70"><Spinner /> Getting your words…</div>
								{/if}
							</div>
							{#if pickError}<p class="mt-3 text-center text-sm text-attention" role="alert">{pickError}</p>{/if}
							<p class="mt-4 text-center text-sm text-cream/50">Pick within {seconds}s or your turn passes on.</p>
						{:else}
							<div class="text-center">
								<div class="pencil-bob mx-auto grid size-20 place-items-center rounded-full bg-sun/15 text-sun"><Brush class="size-9" /></div>
								<p class="mt-5 eyebrow text-green-300">Next artist</p>
								<h1 class="mt-1 font-display text-4xl font-bold wrap-break-word">{session.drawerName}</h1>
								<p class="mt-2 text-cream/70">is choosing a word…</p>
							</div>
							{#if mine}
								<p class="mt-8 text-center text-sm text-cream/60">You’re <span class="font-semibold text-cream">#{mine.rank}</span> with <span class="font-semibold text-sun">{mine.score}</span> pts</p>
							{/if}
							{#if board.length}
								<div class="mx-auto mt-4 w-full max-w-sm"><Leaderboard entries={board} limit={5} highlightId={myId} unit="pts" /></div>
							{/if}
						{/if}
					</main>
				{:else if status === 'drawing'}
					<main class="play-grid min-h-0 flex-1 gap-3 px-3 pt-2 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
						<section class="canvas-cell flex min-h-0 flex-col gap-2">
							{#if amDrawer}
								<div class="text-center">
									<p class="eyebrow text-cream/55">Draw this · no letters or numbers!</p>
									{#if fresh?.word}
										<p class="font-display text-3xl font-bold tracking-wide text-sun uppercase">{fresh.word}</p>
									{:else}
										<p class="flex items-center justify-center gap-2 py-1 text-cream/60"><Spinner class="size-4" /> {viewLoading ? 'Loading your word…' : '—'}</p>
									{/if}
								</div>
							{:else}
								<div class="flex flex-col items-center gap-1">
									<p class="text-xs text-cream/55"><span class="font-semibold text-cream">{session.drawerName}</span> is drawing
										{#if session.difficulty}<span class="ml-1 rounded-full border px-2 py-px text-[10px] font-bold {tagClass(session.difficulty)}">{tag(session.difficulty)} ×{MULTIPLIER[session.difficulty]}</span>{/if}
									</p>
									{#if guessedIt && fresh?.word}
										<WordMask mask={fresh.word} size="md" solved />
									{:else if session.mask}
										<WordMask mask={session.mask} size="md" />
									{/if}
								</div>
							{/if}
							<CanvasFrame class="drawing-frame">
								{#if amDrawer}
									<ScribbleCanvas bind:this={pad} {chunks} editable {color} {brush} {tool} send={sendFor(turn)} onchange={(empty) => (canUndo = !empty)} label="Your drawing" />
								{:else}
									<ScribbleCanvas {chunks} label="{session.drawerName}’s drawing" />
								{/if}
							</CanvasFrame>
						</section>

						<aside class="side-cell flex min-h-0 flex-col gap-3">
							{#if amDrawer}
								<DrawTools bind:color bind:brush bind:tool {canUndo} onundo={() => pad?.undo()} onclear={() => pad?.clear()} />
							{:else}
								<form class="guess-form flex gap-2" onsubmit={submitGuess}>
									<input
										bind:value={guessText}
										maxlength="40"
										autocomplete="off"
										autocapitalize="off"
										autocorrect="off"
										spellcheck="false"
										enterkeyhint="send"
										disabled={guessedIt}
										placeholder={guessedIt ? 'You got it! Watch the others…' : 'Type your guess…'}
										aria-label="Your guess"
										class="h-12 min-w-0 flex-1 rounded-xl border-2 border-white/15 bg-stage-raised px-4 text-base font-semibold text-cream outline-none transition-colors placeholder:font-normal placeholder:text-cream/40 focus:border-sun disabled:border-green-300/40 disabled:bg-green-300/10"
									/>
									<button
										type="submit"
										disabled={guessedIt || !guessText.trim()}
										class="grid size-12 shrink-0 place-items-center rounded-xl bg-sun text-forest-950 transition-[opacity,transform] active:scale-95 disabled:opacity-40"
										aria-label="Send guess"><Send class="size-5" /></button
									>
								</form>
								{#if notice}<p class="-mt-1 text-sm text-attention" role="alert" transition:fade>{notice}</p>{/if}
							{/if}

							<div class="feed min-h-0 flex-1 overflow-y-auto rounded-2xl border border-white/10 bg-white/3 p-3">
								<p class="eyebrow mb-2 flex items-center justify-between text-cream/55">
									<span>Got it</span>
									<span class="tabular">{correct.length} / {session.eligible}</span>
								</p>
								{#if correct.length}
									<ul class="flex flex-wrap gap-1.5">
										{#each [...correct].reverse() as g, i (g.id)}
											<li class="inline-flex items-center gap-1 rounded-full bg-green-300/15 px-2.5 py-1 text-sm font-semibold text-green-300" in:scale={{ start: 0.6, duration: 260 }}>
												{#if i < 3}<span aria-hidden="true">{medal(i + 1)}</span>{:else}<Check class="size-3.5" />{/if}{g.name}
											</li>
										{/each}
									</ul>
								{:else}
									<p class="text-sm text-cream/45">{amDrawer ? 'Nobody yet — keep drawing!' : 'Nobody yet — be the first!'}</p>
								{/if}

								{#if !amDrawer && myGuesses.length}
									<p class="eyebrow mt-4 mb-2 text-cream/55">Your guesses</p>
									<ul class="space-y-1">
										{#each myGuesses as g (g.id)}
											<li class="flex items-center gap-2 text-sm" in:fly={{ y: -6, duration: 180 }}>
												<span class="min-w-0 flex-1 truncate {g.state === 'wrong' || g.state === 'rejected' ? 'text-cream/45 line-through' : 'font-semibold'}">{g.text}</span>
												{#if g.state === 'pending'}<Spinner class="size-3.5" />
												{:else if g.state === 'close'}<span class="rounded-full bg-sun/20 px-2 py-px text-xs font-bold text-sun">So close!</span>
												{:else if g.state === 'correct'}<span class="text-xs font-bold text-green-300">Correct!</span>{/if}
											</li>
										{/each}
									</ul>
								{/if}
							</div>
						</aside>
					</main>
				{:else}
					<!-- REVEAL -->
					<main class="mx-auto flex w-full max-w-lg flex-1 flex-col overflow-y-auto px-5 pt-2 pb-8">
						{#if reveal}
							<p class="text-center eyebrow text-cream/55">{reasonText[reveal.reason]}</p>
							{#if reveal.word}
								<p class="mt-1 text-center text-sm text-cream/60">The word was</p>
								<div class="mt-1" in:scale={{ start: 0.7, duration: 500, easing: backOut }}><WordMask mask={reveal.word} size="lg" solved /></div>
								<div class="mx-auto mt-4 w-full max-w-xs">
									<CanvasFrame fluid><ScribbleCanvas {chunks} animate={false} label="The drawing" /></CanvasFrame>
								</div>
							{:else}
								<p class="mt-4 text-center font-display text-3xl font-bold">{reveal.drawerName}</p>
								<p class="text-center text-cream/60">missed their turn. Next artist coming up…</p>
							{/if}

							{#if reveal.word}
								<div class="mt-5 rounded-2xl border p-4 text-center {myGain || (iDrew && reveal.drawerPoints) ? 'border-sun/40 bg-sun/10' : 'border-white/10 bg-white/3'}">
									{#if session.scoring}
										<p class="flex items-center justify-center gap-2 text-cream/70"><Spinner class="size-4" /> Adding up points…</p>
									{:else if iDrew}
										<p class="text-sm text-cream/70">{reveal.guessed} of {reveal.eligible} guessed your drawing</p>
										<p class="mt-1 font-display text-4xl font-bold text-sun">+<XpCounter value={reveal.drawerPoints} from={0} /></p>
										{#if reveal.masterpiece}<p class="mt-1 font-bold text-green-300">🎨 Masterpiece! Everyone got it</p>{/if}
									{:else if myGain}
										<p class="text-sm text-cream/70">You got it{myGain.bonus ? ` — ${['first', 'second', 'third'][myPlace]}!` : '!'}</p>
										<p class="mt-1 font-display text-4xl font-bold text-sun">+<XpCounter value={myGain.points} from={0} /></p>
										{#if myGain.bonus}<p class="mt-1 text-sm text-green-300">incl. +{myGain.bonus} speed bonus {medal(myPlace + 1)}</p>{/if}
									{:else}
										<p class="text-cream/70">You didn’t get this one — next time!</p>
									{/if}
								</div>
							{/if}

							{#if board.length && !session.scoring}
								<div class="mt-5">
									<p class="eyebrow mb-2 text-cream/55">Leaderboard {mine ? `· you’re #${mine.rank}` : ''}</p>
									<Leaderboard entries={board} limit={5} highlightId={myId} unit="pts" />
								</div>
							{/if}
						{/if}
					</main>
				{/if}
			</div>
		{/key}

		{#if celebrate}
			{#key celebrate.key}
				<Confetti count={60} duration={2200} />
				<div class="pointer-events-none fixed inset-x-0 top-[28%] z-40 text-center" in:scale={{ start: 0.4, duration: 450, easing: backOut }} out:fade>
					<p class="scribble-head font-display text-6xl font-bold text-green-300 uppercase">Got it!</p>
					<p class="mt-1 font-display text-4xl font-bold text-sun drop-shadow">+{celebrate.points}</p>
				</div>
			{/key}
		{/if}
	{/if}
</div>

<style>
	/* Phones: one column. Landscape tablets and laptops: drawing left, panel right. */
	.play-grid {
		display: flex;
		flex-direction: column;
	}
	.play-grid :global(.drawing-frame) {
		width: 100%;
		aspect-ratio: 4 / 3;
		max-height: 50dvh;
		flex: none;
	}
	@media (min-width: 768px) and (orientation: landscape), (min-width: 1024px) {
		.play-grid {
			display: grid;
			grid-template-columns: minmax(0, 1fr) 21rem;
			max-width: 90rem;
			width: 100%;
			margin-inline: auto;
		}
		.play-grid :global(.drawing-frame) {
			flex: 1 1 0;
			aspect-ratio: auto;
			max-height: none;
		}
		.side-cell {
			padding-top: 0.25rem;
		}
	}
	/* Small landscape phones: no room for the word above the drawing. */
	@media (max-height: 480px) and (orientation: landscape) {
		.play-grid {
			display: grid;
			grid-template-columns: minmax(0, 1fr) 17rem;
		}
		.play-grid :global(.drawing-frame) {
			flex: 1 1 0;
			aspect-ratio: auto;
			max-height: none;
		}
	}
	.doodle-bg {
		background-image:
			radial-gradient(circle at 20% 30%, var(--color-sun) 0 2px, transparent 3px),
			radial-gradient(circle at 70% 60%, var(--color-green-300) 0 2px, transparent 3px);
		background-size: 46px 46px, 62px 62px;
	}
	.scribble-head {
		-webkit-text-stroke: 1.5px rgba(0, 0, 0, 0.35);
		paint-order: stroke fill;
		text-shadow: 0 4px 0 rgba(0, 0, 0, 0.35);
	}
	.scribble-path {
		stroke-dasharray: 260;
		stroke-dashoffset: 260;
		animation: draw 2.6s ease-in-out infinite;
	}
	.scribble-path.delay {
		animation-delay: 0.9s;
	}
	.scribble-dot {
		transform-origin: 64px 48px;
		animation: pop 2.6s ease-in-out infinite;
	}
	.pencil-bob {
		animation: bob 1.4s ease-in-out infinite;
	}
	@keyframes draw {
		45%,
		80% {
			stroke-dashoffset: 0;
		}
		100% {
			stroke-dashoffset: -260;
		}
	}
	@keyframes pop {
		0%,
		20% {
			transform: scale(0);
		}
		35%,
		85% {
			transform: scale(1);
		}
		100% {
			transform: scale(0);
		}
	}
	@keyframes bob {
		50% {
			transform: translateY(-6px) rotate(-8deg);
		}
	}
	@media (prefers-reduced-motion: reduce) {
		.scribble-path,
		.scribble-dot,
		.pencil-bob {
			animation: none;
			stroke-dashoffset: 0;
		}
	}
</style>
