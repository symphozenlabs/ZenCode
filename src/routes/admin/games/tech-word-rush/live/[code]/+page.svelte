<script lang="ts">
	import { page } from '$app/state';
	import { collection, doc, onSnapshot } from 'firebase/firestore';
	import { fade, fly, scale } from 'svelte/transition';
	import { Users, X, Maximize, Minimize, Play, Eye, ListOrdered, SkipForward, Flag, Trophy, CloudOff, ArrowLeft } from '@lucide/svelte';
	import { db } from '$lib/firebase/client';
	import { adminAuth } from '$lib/stores/admin-auth.svelte';
	import { control } from '$lib/games/tech-word-rush/api';
	import { MAX_GUESSES, maskWord } from '$lib/games/tech-word-rush/engine';
	import { SESSIONS, type ControlAction, type LiveSession, type PlayerDoc } from '$lib/games/tech-word-rush/types';
	import Logo from '$lib/components/site/Logo.svelte';
	import Button from '$lib/components/ui/Button.svelte';
	import Modal from '$lib/components/ui/Modal.svelte';
	import Spinner from '$lib/components/ui/Spinner.svelte';
	import Spotlight from '$lib/components/motion/Spotlight.svelte';
	import ParticleField from '$lib/components/motion/ParticleField.svelte';
	import GameStage from '$lib/components/games/GameStage.svelte';
	import LetterBoxes from '$lib/components/games/LetterBoxes.svelte';
	import QrCode from '$lib/components/games/QrCode.svelte';
	import Countdown from '$lib/components/games/Countdown.svelte';
	import Leaderboard from '$lib/components/games/Leaderboard.svelte';
	import XpCounter from '$lib/components/games/XpCounter.svelte';

	const code = $derived((page.params.code ?? '').toUpperCase());
	const joinUrl = $derived(`${page.url.origin}/join/${code}`);

	let session = $state<LiveSession | null>(null);
	let loadState = $state<'loading' | 'ready' | 'missing' | 'error'>('loading');
	let players = $state<(PlayerDoc & { id: string })[]>([]);

	$effect(() => {
		const c = code;
		loadState = 'loading';
		const unsubSession = onSnapshot(
			doc(db(), SESSIONS, c),
			(snap) => {
				session = snap.exists() ? (snap.data() as LiveSession) : null;
				loadState = snap.exists() ? 'ready' : 'missing';
			},
			() => (loadState = 'error')
		);
		const unsubPlayers = onSnapshot(collection(db(), SESSIONS, c, 'players'), (snap) => {
			players = snap.docs.map((d) => ({ id: d.id, ...(d.data() as PlayerDoc) })).sort((a, b) => b.joinedAt - a.joinedAt);
		});
		return () => {
			unsubSession();
			unsubPlayers();
		};
	});

	// ── Control ──────────────────────────────────────────────────────────
	let busy = $state<ControlAction | null>(null);
	let actionError = $state('');

	async function run(action: ControlAction) {
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

	// ── Derived game state ───────────────────────────────────────────────
	const status = $derived(session?.status ?? 'lobby');
	const index = $derived(session?.questionIndex ?? -1);
	const isLast = $derived(!!session && index + 1 >= session.totalQuestions);
	const pad = (n: number) => String(n).padStart(2, '0');

	const onCurrent = $derived(players.filter((p) => p.q?.index === index));
	const live = $derived({
		total: players.length,
		correct: onCurrent.filter((p) => p.q?.status === 'correct').length,
		failed: onCurrent.filter((p) => p.q?.status === 'failed').length,
		skipped: onCurrent.filter((p) => p.q?.status === 'skipped').length
	});
	// During a word only activity is shown — a live "correct" count would tell
	// players whether their guess was right before the reveal.
	const guessed = $derived(onCurrent.filter((p) => (p.q?.guesses ?? 0) > 0).length);
	const lockedIn = $derived(onCurrent.filter((p) => (p.q?.guesses ?? 0) >= MAX_GUESSES).length);
	const answered = $derived(guessed + live.skipped);

	const blankWord = $derived(
		session?.current ? [session.current.first, ...Array(session.current.length - 2).fill(null), session.current.last] : []
	);
	const fullWord = $derived(session?.answer ? maskWord(session.answer, [...session.answer].map((_, i) => i)) : []);

	// Timer expiry ends the question (server ignores duplicates).
	function onExpire() {
		if (session?.status === 'question') run('end');
	}

	// ── End game confirm + fullscreen ───────────────────────────────────
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

<svelte:head><title>{code} · Tech Word Rush — ZenCode</title></svelte:head>
<svelte:document onfullscreenchange={() => (fullscreen = !!document.fullscreenElement)} />

<GameStage>
	<!-- Top bar -->
	<header class="flex items-center gap-4 border-b border-white/10 px-5 py-3 md:px-8">
		<Logo />
		<span class="hidden h-5 w-px bg-white/15 sm:block"></span>
		<p class="hidden font-display text-sm font-bold tracking-[0.18em] text-cream uppercase sm:block">Tech Word Rush</p>
		<div class="ml-auto flex items-center gap-2 md:gap-4">
			{#if session && index >= 0 && status !== 'finished'}
				<span class="font-mono text-sm text-cream/70 tabular">Q {pad(index + 1)} / {pad(session.totalQuestions)}</span>
			{/if}
			<span class="rounded-md border border-white/15 px-2.5 py-1 font-mono text-sm font-semibold tracking-[0.2em] text-sun">{code}</span>
			<span class="inline-flex items-center gap-1.5 text-sm text-cream/80 tabular" aria-live="polite">
				<Users class="size-4" />{players.length}
			</span>
			<button type="button" class="grid size-9 place-items-center rounded-md text-cream/70 hover:bg-white/10 hover:text-cream" aria-label={fullscreen ? 'Exit full screen' : 'Full screen'} onclick={toggleFullscreen}>
				{#if fullscreen}<Minimize class="size-4" />{:else}<Maximize class="size-4" />{/if}
			</button>
			<a href="/admin/games" class="grid size-9 place-items-center rounded-md text-cream/70 hover:bg-white/10 hover:text-cream" aria-label="Close presenter">
				<X class="size-5" />
			</a>
		</div>
	</header>

	<main class="flex flex-1 flex-col px-5 py-6 md:px-10 md:py-8">
		{#if loadState === 'loading'}
			<div class="m-auto flex items-center gap-3 text-cream/70"><Spinner /> Loading game…</div>
		{:else if loadState === 'missing' || loadState === 'error'}
			<div class="m-auto max-w-md text-center" role="alert">
				<CloudOff class="mx-auto size-10 text-cream/50" />
				<p class="mt-4 text-xl font-semibold">{loadState === 'missing' ? 'This game session does not exist.' : 'Unable to load the game.'}</p>
				<p class="mt-1 text-cream/60">{loadState === 'missing' ? 'It may have been removed.' : 'Check your connection, then reload.'}</p>
				<Button variant="stage" class="mt-6" href="/admin/games"><ArrowLeft class="size-4" /> Back to games</Button>
			</div>
		{:else if session}
			<div class="grid flex-1">
				{#key `${status}-${index}`}
					<div class="flex flex-col [grid-area:1/1]" in:fly={{ y: 24, duration: 380, delay: 120 }} out:fade={{ duration: 120 }}>
						{#if status === 'lobby'}
							<!-- LOBBY -->
							<div class="m-auto grid w-full max-w-6xl items-center gap-10 lg:grid-cols-[1.1fr_1fr]">
								<div class="text-center lg:text-left">
									<p class="eyebrow text-green-300">Live game</p>
									<h1 class="mt-3 font-display text-5xl leading-none font-bold tracking-tight uppercase md:text-7xl">Tech Word<br />Rush</h1>
									<p class="mt-4 text-lg text-sun md:text-xl">Guess the tech. Earn the XP.</p>
									<div class="mt-10">
										<p class="eyebrow text-cream/60">Game code</p>
										<p class="mt-1 font-mono text-6xl font-bold tracking-[0.18em] text-cream md:text-7xl">{code}</p>
										<p class="mt-2 font-mono text-sm break-all text-cream/50">{joinUrl}</p>
									</div>
									<p class="mt-10 flex items-baseline justify-center gap-3 lg:justify-start" aria-live="polite">
										<XpCounter value={players.length} duration={400} class="font-display text-6xl font-bold text-green-300" />
										<span class="text-lg tracking-[0.18em] text-cream/70 uppercase">{players.length === 1 ? 'Player joined' : 'Players joined'}</span>
									</p>
								</div>
								<div class="mx-auto w-full max-w-[min(26rem,52vh)]">
									<div class="rounded-2xl border border-green-300/30 bg-white p-4 shadow-[0_0_80px_-20px_var(--color-green-300)]">
										<QrCode value={joinUrl} label="Scan to join game {code}" />
									</div>
									<p class="mt-4 text-center font-display text-2xl font-bold tracking-[0.2em] uppercase">Scan to join</p>
								</div>
							</div>
							{#if players.length}
								<ul class="mx-auto mt-8 flex max-w-5xl flex-wrap justify-center gap-2" aria-label="Players">
									{#each players.slice(0, 48) as p (p.id)}
										<li in:scale={{ start: 0.6, duration: 260 }} class="rounded-md border border-stage-line bg-stage-raised px-3 py-1.5 text-sm font-medium text-cream/90">{p.name}</li>
									{/each}
									{#if players.length > 48}<li class="px-3 py-1.5 text-sm text-cream/50">+{players.length - 48} more</li>{/if}
								</ul>
							{/if}
						{:else if status === 'question' && session.current}
							<!-- QUESTION -->
							<div class="mx-auto flex w-full max-w-6xl flex-1 flex-col">
								<div class="flex items-start justify-between gap-6">
									<div>
										<p class="font-mono text-lg tracking-[0.2em] text-cream/60 uppercase">Question {pad(index + 1)} / {pad(session.totalQuestions)}</p>
										<p class="mt-2 inline-flex rounded-md border border-green-300/30 bg-forest-900/60 px-2.5 py-1 text-sm font-medium text-green-300">{session.current.category}</p>
									</div>
									<div class="size-24 shrink-0 md:size-32">
										<Countdown endsAt={session.timerEndsAt} total={session.duration} onexpire={onExpire} />
									</div>
								</div>
								<div class="my-auto py-8">
									<p class="eyebrow text-cream/50">Technical description</p>
									<p class="mt-3 max-w-5xl text-2xl leading-snug font-medium text-cream md:text-4xl md:leading-tight">{session.current.description}</p>
									<div class="mt-10">
										<LetterBoxes letters={blankWord} max="6rem" label="Word pattern" />
									</div>
								</div>
								<div class="grid grid-cols-2 gap-3 md:grid-cols-4">
									{#each [['Participants', live.total, 'text-cream'], ['Guessed', guessed, 'text-green-300'], ['All 3 used', lockedIn, 'text-sun'], ['Skipped', live.skipped, 'text-cream/70']] as [label, value, cls] (label)}
										<div class="rounded-lg border border-stage-line bg-stage-raised/80 px-4 py-3">
											<p class="eyebrow text-cream/50">{label}</p>
											<p class="mt-1 font-display text-4xl font-bold tabular {cls}" aria-live="polite">{value}</p>
										</div>
									{/each}
								</div>
								<div class="mt-3 h-2 overflow-hidden rounded-full bg-stage-line" aria-hidden="true">
									<div class="h-full rounded-full bg-green-300 transition-[width] duration-500" style:width="{live.total ? (answered / live.total) * 100 : 0}%"></div>
								</div>
							</div>
						{:else if status === 'result' && session.current}
							<!-- RESULT -->
							{@const stats = live}
							<div class="m-auto w-full max-w-5xl text-center">
								<p class="font-mono text-lg tracking-[0.2em] text-cream/60 uppercase">Question {pad(index + 1)} · Answer</p>
								<div class="mt-8"><LetterBoxes letters={fullWord} tone="success" max="6.5rem" stagger label="Answer" /></div>
								<p class="mx-auto mt-8 max-w-3xl text-lg text-cream/70 md:text-xl">{session.current.description}</p>
								<div class="mx-auto mt-10 grid max-w-3xl grid-cols-2 gap-3 md:grid-cols-4">
									{#each [['Correct', stats.correct, 'bg-green-300'], ['Wrong', stats.failed, 'bg-attention'], ['Skipped', stats.skipped, 'bg-cream/40'], ['No answer', Math.max(0, stats.total - stats.correct - stats.failed - stats.skipped), 'bg-stage-line']] as [label, value, bar] (label)}
										<div class="rounded-lg border border-stage-line bg-stage-raised/80 p-4 text-left">
											<p class="eyebrow text-cream/50">{label}</p>
											<p class="mt-1 font-display text-4xl font-bold tabular">{value}</p>
											<div class="mt-3 h-1.5 overflow-hidden rounded-full bg-white/5">
												<div class="h-full rounded-full {bar} transition-[width] duration-700" style:width="{stats.total ? (Number(value) / stats.total) * 100 : 0}%"></div>
											</div>
										</div>
									{/each}
								</div>
							</div>
						{:else if status === 'leaderboard'}
							<!-- LEADERBOARD -->
							<div class="mx-auto w-full max-w-3xl">
								<p class="eyebrow text-center text-green-300">After question {index + 1} of {session.totalQuestions}</p>
								<h2 class="mt-2 text-center font-display text-4xl font-bold tracking-tight uppercase md:text-5xl">Leaderboard</h2>
								<div class="mt-8">
									{#if session.leaderboard.length}
										<Leaderboard entries={session.leaderboard} size="lg" />
									{:else}
										<p class="text-center text-cream/60">No scores yet.</p>
									{/if}
								</div>
							</div>
						{:else if status === 'finished'}
							<!-- FINAL -->
							<Spotlight />
							<ParticleField count={36} links={false} class="opacity-60" />
							<div class="relative mx-auto w-full max-w-4xl">
								<p class="eyebrow text-center text-green-300">Tech Word Rush</p>
								<h2 class="mt-2 text-center font-display text-4xl font-bold tracking-tight uppercase md:text-6xl">Final leaderboard</h2>
								{#if session.ranking}
									<div class="mt-16 flex items-center justify-center gap-3 text-cream/70"><Spinner /> Updating leaderboard…</div>
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
												<span class="text-4xl md:text-5xl" aria-hidden="true">{medal(e.rank)}</span>
												<p class="mt-2 w-full truncate font-display text-lg font-bold uppercase md:text-2xl {first ? 'text-sun' : 'text-cream'}">{e.name}</p>
												<p class="font-display text-base font-semibold text-cream/80 md:text-xl"><XpCounter value={e.xp} from={0} duration={1400} /> XP</p>
												<div
													class="mt-3 w-full rounded-t-lg border border-b-0 {first
														? 'h-40 border-sun/50 bg-gradient-to-b from-sun/25 to-transparent shadow-[0_0_80px_-20px_var(--color-sun)] md:h-52'
														: e.rank === 2
															? 'h-28 border-green-300/40 bg-gradient-to-b from-green-300/15 to-transparent md:h-36'
															: 'h-20 border-green-300/25 bg-gradient-to-b from-green-300/10 to-transparent md:h-28'}"
												>
													<p class="pt-3 font-mono text-2xl font-bold text-cream/60">#{e.rank}</p>
												</div>
											</div>
										{/each}
									</div>
									{#if session.leaderboard.length > 3}
										<div class="mx-auto mt-8 max-w-2xl" in:fade={{ delay: 1400, duration: 400 }}>
											<Leaderboard entries={session.leaderboard.slice(3)} limit={7} />
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
		<footer class="sticky bottom-0 border-t border-white/10 bg-stage/90 px-5 py-3 backdrop-blur md:px-8">
			<div class="mx-auto flex max-w-6xl flex-wrap items-center gap-2">
				{#if actionError}<p class="mr-auto text-sm text-attention" role="alert">{actionError}</p>{/if}
				<div class="ml-auto flex flex-wrap items-center gap-2">
					{#if status === 'lobby'}
						<Button variant="stage" size="lg" onclick={() => (confirmEnd = true)}><Flag class="size-4" /> Close lobby</Button>
						<Button variant="sun" size="lg" onclick={() => run('start')} loading={busy === 'start'} disabled={!players.length}>
							<Play class="size-4" />{players.length ? 'Start game' : 'Waiting for players…'}
						</Button>
					{:else if status === 'question'}
						<Button variant="stage" size="lg" onclick={() => (confirmEnd = true)}><Flag class="size-4" /> End game</Button>
						<Button variant="sun" size="lg" onclick={() => run('end')} loading={busy === 'end'}><Eye class="size-4" /> Reveal answer</Button>
					{:else if status === 'result' || status === 'leaderboard'}
						<Button variant="stage" size="lg" onclick={() => (confirmEnd = true)}><Flag class="size-4" /> End game</Button>
						{#if status === 'result'}
							<Button variant="stage" size="lg" onclick={() => run('leaderboard')} loading={busy === 'leaderboard'}><ListOrdered class="size-4" /> Show leaderboard</Button>
						{/if}
						{#if isLast}
							<Button variant="sun" size="lg" onclick={() => run('finish')} loading={busy === 'finish'}><Trophy class="size-4" /> Final results</Button>
						{:else}
							<Button variant="sun" size="lg" onclick={() => run('next')} loading={busy === 'next'}><SkipForward class="size-4" /> Next word</Button>
						{/if}
					{:else}
						<Button variant="sun" size="lg" href="/admin/games"><ArrowLeft class="size-4" /> Back to games</Button>
					{/if}
				</div>
			</div>
		</footer>
	{/if}
</GameStage>

<Modal
	open={confirmEnd}
	title={status === 'lobby' ? 'Close this lobby?' : 'End the game now?'}
	description={status === 'lobby' ? 'Players can no longer join.' : 'Scores are final and the winner is announced.'}
	onclose={() => (confirmEnd = false)}
>
	<p class="text-sm text-muted-foreground">This cannot be undone.</p>
	{#snippet footer()}
		<Button variant="ghost" onclick={() => (confirmEnd = false)}>Cancel</Button>
		<Button
			variant="destructive"
			loading={busy === 'finish'}
			onclick={async () => {
				await run('finish');
				confirmEnd = false;
			}}>{status === 'lobby' ? 'Close lobby' : 'End game'}</Button
		>
	{/snippet}
</Modal>
