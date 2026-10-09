<script lang="ts">
	import { page } from '$app/state';
	import { doc, onSnapshot } from 'firebase/firestore';
	import { fade, fly, scale } from 'svelte/transition';
	import { Lightbulb, SendHorizontal, CloudOff, RotateCcw, Check, X, Hourglass } from '@lucide/svelte';
	import { db } from '$lib/firebase/client';
	import { FREE_HINTS, MAX_GUESSES, PAID_HINT_COST, hintLabel, type HintBlock } from '$lib/games/tech-word-rush/engine';
	import { SESSIONS, type LiveSession, type PlayerDoc, type PlayerView, type PlayAction } from '$lib/games/tech-word-rush/types';
	import { forgetIdentity, join, loadIdentity, play, type Identity } from '$lib/games/tech-word-rush/api';
	import GameStage from '$lib/components/games/GameStage.svelte';
	import LetterBoxes from '$lib/components/games/LetterBoxes.svelte';
	import GuessList from '$lib/components/games/GuessList.svelte';
	import Countdown from '$lib/components/games/Countdown.svelte';
	import Leaderboard from '$lib/components/games/Leaderboard.svelte';
	import XpCounter from '$lib/components/games/XpCounter.svelte';
	import Logo from '$lib/components/site/Logo.svelte';
	import Button from '$lib/components/ui/Button.svelte';
	import Spinner from '$lib/components/ui/Spinner.svelte';

	const code = $derived((page.params.code ?? '').toUpperCase());

	// ── Session (public doc) ─────────────────────────────────────────────
	let session = $state<LiveSession | null>(null);
	let loadState = $state<'loading' | 'ready' | 'missing' | 'error'>('loading');
	let attempt = $state(0);

	$effect(() => {
		attempt;
		const c = code;
		loadState = 'loading';
		if (!/^ZC[A-Z2-9]{4}$/.test(c)) {
			loadState = 'missing';
			return;
		}
		return onSnapshot(
			doc(db(), SESSIONS, c),
			(snap) => {
				session = snap.exists() ? (snap.data() as LiveSession) : null;
				loadState = snap.exists() ? 'ready' : 'missing';
			},
			() => (loadState = 'error')
		);
	});

	// ── Identity (device token, no account) ──────────────────────────────
	let identity = $state<Identity | null>(null);
	let resuming = $state(true);
	let me = $state<PlayerDoc | null>(null);
	let view = $state<PlayerView | null>(null);
	let xp = $state(0);

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
				applyView(v);
			})
			.catch((err) => {
				if (err.status === 401) forgetIdentity(c);
				else identity = saved; // network blip: keep playing, listeners will catch up
			})
			.finally(() => (resuming = false));
	});

	$effect(() => {
		if (!identity) return;
		return onSnapshot(doc(db(), SESSIONS, code, 'players', identity.playerId), (snap) => {
			me = snap.exists() ? (snap.data() as PlayerDoc) : null;
			if (me) xp = me.xp;
		});
	});

	// ── Join ─────────────────────────────────────────────────────────────
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

	// ── Playing ──────────────────────────────────────────────────────────
	const status = $derived(session?.status ?? 'lobby');
	const index = $derived(session?.questionIndex ?? -1);
	const current = $derived(session?.current ?? null);

	/** This player's state on the current word (fresh until they act). */
	const q = $derived(
		view?.q && view.q.index === index
			? view.q
			: { index, status: 'playing' as const, hintsUsed: 0, guesses: [], reward: 100, earned: 0, revealed: {} as Record<number, string> }
	);
	/** Only set once the host reveals it — guesses get no feedback before then. */
	const answer = $derived(session?.answer ?? null);
	const hit = $derived(answer ? q.guesses.find((g) => g.text === answer) : undefined);
	const result = $derived<'correct' | 'failed' | 'skipped' | 'missed'>(
		hit ? 'correct' : q.status === 'skipped' ? 'skipped' : q.guesses.length ? 'failed' : 'missed'
	);
	const guessesLeft = $derived(MAX_GUESSES - q.guesses.length);

	let pending = $state<PlayAction | null>(null);
	let feedback = $state<{ kind: 'sent' | 'error'; text: string } | null>(null);
	let delta = $state<{ id: number; text: string; tone: 'gain' | 'cost' } | null>(null);
	let guess = $state('');
	let timeUp = $state(false);
	let confirmSkip = $state(false);
	let answerForm = $state<HTMLFormElement>();

	function shake() {
		if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
		answerForm?.animate(
			[0, -8, 8, -6, 6, 0].map((x) => ({ transform: `translateX(${x}px)` })),
			{ duration: 380, easing: 'ease-in-out' }
		);
	}

	// Reset per-word UI when the host moves on.
	$effect(() => {
		index;
		timeUp = false;
		guess = '';
		feedback = null;
		confirmSkip = false;
	});

	function applyView(v: PlayerView) {
		view = v;
		xp = v.xp;
	}

	function flash(text: string, tone: 'gain' | 'cost') {
		const id = Date.now();
		delta = { id, text, tone };
		setTimeout(() => delta?.id === id && (delta = null), 1600);
	}

	async function act(action: PlayAction, extra: { expect?: number; answer?: string } = {}) {
		if (!identity || pending) return;
		pending = action;
		feedback = null;
		const before = xp;
		try {
			const v = await play(code, identity, action, extra);
			applyView(v);
			if (v.rejected) {
				feedback = { kind: 'error', text: v.rejected };
				shake();
			}
			if (v.result === 'guess') {
				guess = '';
				const left = MAX_GUESSES - (v.q?.guesses.length ?? 0);
				feedback = { kind: 'sent', text: left ? `Guess locked in. ${left} left.` : 'All guesses locked in.' };
			} else if (v.result === 'hint' && v.xp < before) {
				flash(`−${before - v.xp}`, 'cost');
			}
		} catch (err) {
			feedback = { kind: 'error', text: (err as Error).message || 'Unable to send. Please try again.' };
		} finally {
			pending = null;
		}
	}

	const accepting = $derived(status === 'question' && !timeUp && q.status === 'playing' && guessesLeft > 0);
	const hiddenCount = $derived(current ? current.length - 2 - Object.keys(q.revealed).length : 0);
	const hintBlock = $derived<HintBlock | null>(
		!accepting ? (q.status !== 'playing' ? 'done' : 'not-active') : hiddenCount <= 0 ? 'no-letters' : q.hintsUsed >= FREE_HINTS && xp < PAID_HINT_COST ? 'insufficient-xp' : null
	);

	const letters = $derived.by(() => {
		if (!current) return [];
		if (answer) return [...answer];
		return Array.from({ length: current.length }, (_, i) =>
			i === 0 ? current.first : i === current.length - 1 ? current.last : (q.revealed[i] ?? null)
		);
	});
	const hinted = $derived(Object.keys(q.revealed).map(Number));

	function submitAnswer(e: SubmitEvent) {
		e.preventDefault();
		if (!guess.trim()) {
			feedback = { kind: 'error', text: 'Type an answer first.' };
			return;
		}
		act('answer', { answer: guess, expect: q.guesses.length });
	}

	function skip() {
		if (!confirmSkip) {
			confirmSkip = true;
			setTimeout(() => (confirmSkip = false), 3000);
			return;
		}
		confirmSkip = false;
		act('skip');
	}

	const myRank = $derived(identity ? (session?.leaderboard.find((e) => e.id === identity!.playerId) ?? null) : null);
	const pad = (n: number) => String(n).padStart(2, '0');
</script>

<svelte:head><title>Tech Word Rush · {code} — ZenCode</title></svelte:head>

<GameStage>
	<header class="sticky top-0 z-20 flex items-center gap-3 border-b border-white/10 bg-stage/85 px-4 py-3 backdrop-blur">
		<div class="min-w-0">
			<p class="font-display text-sm leading-tight font-bold tracking-[0.14em] uppercase">Tech Word Rush</p>
			<p class="font-mono text-[11px] tracking-[0.2em] text-cream/50">{code}</p>
		</div>
		{#if identity && session && status !== 'lobby'}
			<div class="relative ml-auto flex items-baseline gap-1 rounded-md border border-green-300/30 bg-forest-900/70 px-3 py-1.5" aria-live="polite">
				<XpCounter value={xp} class="font-display text-lg font-bold text-cream" />
				<span class="text-xs font-semibold text-cream/60">XP</span>
				{#if delta}
					{#key delta.id}
						<span
							class="absolute -bottom-7 right-2 font-display text-base font-bold {delta.tone === 'gain' ? 'text-green-300' : 'text-attention'}"
							in:fly={{ y: -8, duration: 260 }}
							out:fade={{ duration: 300 }}>{delta.text}</span
						>
					{/key}
				{/if}
			</div>
		{/if}
	</header>

	<main class="mx-auto flex w-full max-w-md flex-1 flex-col px-4 pt-5 pb-8">
		{#if loadState === 'loading' || resuming}
			<div class="m-auto flex items-center gap-3 text-cream/70" role="status"><Spinner /> Loading game…</div>
		{:else if loadState === 'missing'}
			<div class="m-auto text-center" role="alert">
				<p class="text-xl font-semibold">Game not found.</p>
				<p class="mt-1 text-cream/60">Check the code on the big screen and try again.</p>
				<Button variant="stage" class="mt-6" href="/join">Enter a code</Button>
			</div>
		{:else if loadState === 'error' || !session}
			<div class="m-auto text-center" role="alert">
				<CloudOff class="mx-auto size-9 text-cream/50" />
				<p class="mt-3 text-xl font-semibold">Unable to join the game.</p>
				<p class="mt-1 text-cream/60">The session may have ended, or your connection dropped.</p>
				<Button variant="stage" class="mt-6" onclick={() => attempt++}><RotateCcw class="size-4" /> Try again</Button>
			</div>
		{:else if !identity}
			<!-- JOIN -->
			{#if status === 'finished'}
				<div class="m-auto text-center">
					<p class="eyebrow text-green-300">Session {code}</p>
					<p class="mt-3 font-display text-3xl font-bold uppercase">This game has ended</p>
					<p class="mt-2 text-cream/60">Watch the big screen for the next one.</p>
				</div>
			{:else}
				<div class="my-auto" in:fly={{ y: 16, duration: 300 }}>
					<Logo class="mb-8" />
					<h1 class="font-display text-4xl leading-none font-bold tracking-tight uppercase">Tech Word Rush</h1>
					<p class="mt-2 text-sun">Guess the tech. Earn the XP.</p>
					<p class="eyebrow mt-8 text-cream/50">Session</p>
					<p class="font-mono text-2xl font-bold tracking-[0.2em]">{code}</p>
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
						<Button type="submit" variant="sun" size="xl" class="w-full" loading={joining}>{joining ? 'Joining…' : 'Join game'}</Button>
					</form>
					<p class="mt-4 text-center text-xs text-cream/40">No sign-up needed. Your name is only used for this game.</p>
				</div>
			{/if}
		{:else}
			{#key `${status}-${index}`}
				<div class="flex flex-1 flex-col" in:fly={{ y: 18, duration: 320 }}>
					{#if status === 'lobby'}
						<!-- LOBBY -->
						<div class="m-auto text-center">
							<p class="font-display text-5xl font-bold tracking-tight uppercase" in:scale={{ start: 0.85, duration: 400 }}>You're in.</p>
							<p class="mt-3 text-lg text-cream/80">Welcome, <span class="font-semibold text-sun">{identity.name}</span>.</p>
							<p class="mt-10 text-cream/60">Waiting for the host to start…</p>
							<div class="mt-4 flex justify-center gap-2" aria-hidden="true">
								{#each [0, 1, 2] as i (i)}
									<span class="size-2.5 animate-pulse-dot rounded-full bg-green-300" style:animation-delay="{i * 0.2}s"></span>
								{/each}
							</div>
							<p class="mt-10 font-display text-3xl font-bold text-green-300" aria-live="polite">
								<XpCounter value={session.playerCount} duration={400} />
								<span class="block text-xs font-semibold tracking-[0.2em] text-cream/50 uppercase">{session.playerCount === 1 ? 'player joined' : 'players joined'}</span>
							</p>
						</div>
					{:else if status === 'question' && current}
						<!-- QUESTION -->
						<div class="flex items-center justify-between text-xs">
							<span class="font-mono tracking-[0.18em] text-cream/60 uppercase">Word {pad(index + 1)} / {pad(session.totalQuestions)}</span>
							<span class="rounded-md bg-forest-900/70 px-2 py-0.5 font-medium text-green-300">{current.category}</span>
						</div>
						<div class="mt-3">
							<Countdown variant="bar" endsAt={session.timerEndsAt} total={session.duration} onexpire={() => (timeUp = true)} />
						</div>

						<p class="eyebrow mt-6 text-cream/50">Technical description</p>
						<p class="mt-2 text-lg leading-snug text-cream">{current.description}</p>

							<div class="mt-6">
								<LetterBoxes {letters} {hinted} max="3.25rem" label="Word" />
							</div>

							{#if q.status === 'skipped'}
								<div class="mt-8 text-center" aria-live="polite">
									<p class="font-display text-2xl font-bold text-cream/80 uppercase" in:fly={{ y: 8, duration: 260 }}>Word skipped</p>
									<p class="mt-2 text-sm text-cream/50">Waiting for the host to reveal the answer…</p>
								</div>
							{:else}
								<p class="mt-4 text-center text-sm text-cream/60">
									A correct guess now pays <span class="font-semibold text-sun tabular">{q.reward} XP</span>
								</p>

								{#if guessesLeft > 0 && !timeUp}
									<form bind:this={answerForm} class="mt-5 space-y-3" onsubmit={submitAnswer} novalidate>
										<label for="guess" class="eyebrow flex justify-between text-cream/60">
											<span>Your guess</span><span class="tabular">{guessesLeft} of {MAX_GUESSES} left</span>
										</label>
										<div class="flex gap-2">
											<input
												id="guess"
												bind:value={guess}
												maxlength="30"
												autocomplete="off"
												autocapitalize="characters"
												spellcheck="false"
												enterkeyhint="send"
												disabled={!accepting}
												class="h-14 min-w-0 flex-1 rounded-lg border-2 bg-stage-raised px-4 font-mono text-xl font-bold tracking-[0.12em] text-cream uppercase outline-none transition-colors duration-150 placeholder:font-sans placeholder:text-base placeholder:font-normal placeholder:tracking-normal placeholder:text-cream/30 placeholder:normal-case focus:border-green-300
													{feedback?.kind === 'error' ? 'border-attention' : 'border-stage-line'}"
												placeholder="Type the word"
												aria-describedby="answer-feedback"
											/>
											<Button type="submit" variant="sun" size="xl" class="px-5!" loading={pending === 'answer'} disabled={!accepting || !!pending} aria-label="Submit guess">
												{#if pending !== 'answer'}<SendHorizontal class="size-5" />{/if}
											</Button>
										</div>
									</form>
									<div id="answer-feedback" aria-live="assertive" class="min-h-8 pt-2 text-center">
										{#if feedback?.kind === 'sent'}
											<p class="text-sm text-cream/70" in:fly={{ y: -6, duration: 200 }}>{feedback.text}</p>
										{:else if feedback}
											<p class="text-sm text-attention" in:fade={{ duration: 150 }}>{feedback.text}</p>
										{/if}
									</div>
								{:else}
									<p class="mt-6 flex items-center justify-center gap-2 text-center font-semibold {timeUp ? 'text-attention' : 'text-cream/80'}" role="status">
										<Hourglass class="size-4" />
										{timeUp ? 'Time’s up' : 'All guesses locked in'} — waiting for the reveal.
									</p>
								{/if}

								{#if q.guesses.length}
									<div class="mt-4"><GuessList guesses={q.guesses} max={MAX_GUESSES} /></div>
									<p class="mt-2 text-center text-xs text-cream/40">You’ll find out which one is right when the host reveals the answer.</p>
								{/if}

								{#if guessesLeft > 0 && !timeUp}
									<Button
										variant="stage"
										size="xl"
										class="mt-6 w-full {hintBlock ? '' : 'border-sun/40! text-sun! hover:bg-sun/10!'}"
										disabled={!!hintBlock || !!pending}
										loading={pending === 'hint'}
										onclick={() => act('hint', { expect: q.hintsUsed })}
									>
										{#if pending !== 'hint'}<Lightbulb class="size-5" />{/if}
										{pending === 'hint' ? 'Revealing…' : hintLabel(q, hintBlock)}
									</Button>
									<p class="mt-2 text-center text-xs text-cream/40">
										{q.hintsUsed < FREE_HINTS ? 'First two hints lower this word’s reward.' : `Extra hints cost ${PAID_HINT_COST} XP from your total.`}
									</p>
									{#if !q.guesses.length}
										<button
											type="button"
											class="mx-auto mt-6 block rounded-md px-3 py-2 text-sm text-cream/50 underline-offset-4 transition-colors hover:text-cream hover:underline disabled:opacity-40"
											onclick={skip}
											disabled={!!pending || !accepting}
										>
											{confirmSkip ? 'Tap again to skip (0 XP)' : 'Skip word'}
										</button>
									{/if}
								{/if}
							{/if}
					{:else if (status === 'result' || status === 'leaderboard') && current}
						<!-- RESULT / LEADERBOARD -->
						{#if status === 'result'}
							<p class="font-mono text-xs tracking-[0.18em] text-cream/60 uppercase">Word {pad(index + 1)} / {pad(session.totalQuestions)} · Answer</p>
							<div class="mt-6">
								<LetterBoxes letters={answer ? [...answer] : letters} tone={hit ? 'success' : 'fail'} stagger max="3.25rem" label="Answer" />
							</div>
							{#if q.guesses.length}
								<div class="mt-6"><GuessList guesses={q.guesses} {answer} max={MAX_GUESSES} /></div>
							{/if}
							{@render outcome()}
						{:else}
							<p class="eyebrow text-center text-green-300">After word {index + 1}</p>
							<h2 class="mt-1 text-center font-display text-3xl font-bold uppercase">Leaderboard</h2>
							{#if myRank}
								<p class="mt-4 text-center text-cream/70">You're <span class="font-display text-2xl font-bold text-sun">#{myRank.rank}</span> of {session.leaderboard.length}</p>
							{/if}
							<div class="mt-6"><Leaderboard entries={session.leaderboard} limit={5} highlightId={identity.playerId} /></div>
							{#if myRank && myRank.rank > 5}
								<div class="mt-2"><Leaderboard entries={[myRank]} highlightId={identity.playerId} /></div>
							{/if}
						{/if}
						<p class="mt-auto pt-8 text-center text-sm text-cream/50">Next word coming up — eyes on the big screen.</p>
					{:else if status === 'finished'}
						<!-- GAME COMPLETE -->
						<div class="my-auto text-center">
							<p class="eyebrow text-green-300">Game complete</p>
							<p class="mt-1 font-display text-2xl font-bold tracking-tight uppercase">Tech Word Rush</p>
							<p class="eyebrow mt-8 text-cream/50">Your score</p>
							<p class="font-display text-6xl font-bold text-sun"><XpCounter value={me?.xp ?? xp} from={0} duration={1400} /> <span class="text-2xl text-cream/60">XP</span></p>
							{#if session.ranking}
								<p class="mt-4 flex items-center justify-center gap-2 text-sm text-cream/60"><Spinner class="size-4" /> Updating leaderboard…</p>
							{:else if myRank}
								<p class="mt-4 text-cream/70">Your rank <span class="font-display text-3xl font-bold text-cream">#{myRank.rank}</span> <span class="text-sm">of {session.leaderboard.length}</span></p>
							{/if}
							{#if me}
								<dl class="mt-8 grid grid-cols-2 gap-2 text-left">
									{#each [['Correct', `${me.correct} / ${session.totalQuestions}`], ['Wrong', me.failed], ['Skipped', me.skipped], ['Hints used', me.hintsUsed]] as [label, value] (label)}
										<div class="rounded-lg border border-stage-line bg-stage-raised/80 px-4 py-3">
											<dt class="eyebrow text-cream/50">{label}</dt>
											<dd class="mt-1 font-display text-2xl font-bold tabular">{value}</dd>
										</div>
									{/each}
								</dl>
							{/if}
							<Button variant="stage" size="lg" class="mt-8" href="/">Back to ZenCode</Button>
						</div>
					{/if}
				</div>
			{/key}
		{/if}
	</main>
</GameStage>

{#snippet outcome()}
	<div class="mt-8 text-center" aria-live="polite">
		{#if result === 'correct'}
			<p class="font-display text-4xl font-bold text-green-300 uppercase" in:scale={{ start: 0.7, duration: 380, delay: 1200 }}>
				<Check class="mr-1 inline size-8 align-[-4px]" />Correct!
			</p>
			<p class="mt-2 font-display text-2xl font-bold text-sun" in:fade={{ delay: 1400 }}>+{hit?.reward ?? 0} XP</p>
		{:else if result === 'failed'}
			<p class="font-display text-2xl font-bold text-attention uppercase" in:fly={{ y: 8, duration: 260, delay: 1200 }}>
				<X class="mr-1 inline size-6 align-[-3px]" />No match this time
			</p>
			<p class="mt-2 text-lg font-semibold text-cream/70">+0 XP</p>
		{:else if result === 'skipped'}
			<p class="font-display text-2xl font-bold text-cream/80 uppercase">Word skipped</p>
			<p class="mt-2 text-lg font-semibold text-cream/60">+0 XP</p>
		{:else}
			<p class="font-display text-2xl font-bold text-cream/80 uppercase">No guess</p>
			<p class="mt-2 text-lg font-semibold text-cream/60">+0 XP</p>
		{/if}
		<div class="mx-auto mt-6 w-fit rounded-lg border border-stage-line bg-stage-raised/80 px-6 py-3">
			<p class="eyebrow text-cream/50">Total</p>
			<p class="font-display text-3xl font-bold"><XpCounter value={xp} /> <span class="text-base text-cream/60">XP</span></p>
		</div>
	</div>
{/snippet}
