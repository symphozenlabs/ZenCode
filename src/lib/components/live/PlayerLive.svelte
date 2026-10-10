<script lang="ts">
	import { Tween } from 'svelte/motion';
	import { cubicOut } from 'svelte/easing';
	import { Check, X, Timer, Trophy, Monitor, CircleCheckBig } from '@lucide/svelte';
	import type { PlayerRoom } from '$lib/live/player.svelte';
	import { DUR, pop, reduced, rise, softFade } from '$lib/live/motion';
	import CountdownRing from './CountdownRing.svelte';
	import TapOptions from './inputs/TapOptions.svelte';
	import TextInput from './inputs/TextInput.svelte';
	import NumberInput from './inputs/NumberInput.svelte';
	import OrderInput from './inputs/OrderInput.svelte';
	import Confetti from './Confetti.svelte';
	import { SLIDE_META } from '$lib/live/slides';
	import { SLIDE_ACCENT, SLIDE_ICONS } from './slide-icons';

	let { room }: { room: PlayerRoom } = $props();

	const s = $derived(room.slide!);
	const slide = $derived(s.slide);
	const answer = $derived(room.myAnswer);
	const confirmed = $derived(!!s.answered || !!room.pending?.confirmed);
	// The big screen's kind chip and accent, so phone and projector feel like one thing.
	const accent = $derived(slide ? SLIDE_ACCENT[slide.kind] : 'var(--color-sun)');
	const KindIcon = $derived(slide ? SLIDE_ICONS[slide.kind] : null);

	type Screen = 'leaderboard' | 'ready' | 'answer' | 'submitted' | 'timesup' | 'result' | 'thanks' | 'bigscreen';
	const screen = $derived.by((): Screen => {
		if (s.view === 'leaderboard') return 'leaderboard';
		if (!slide || slide.input === 'none') return 'bigscreen';
		if (s.reveal) return slide.scored ? 'result' : slide.input === 'tap' ? 'answer' : 'thanks';
		if (s.phase === 'ready') return 'ready';
		if (answer) return slide.scored ? 'submitted' : 'thanks';
		if (s.phase === 'closed') return 'timesup';
		return 'answer';
	});
	// Re-run entrance animations when the moment changes, not on every tick.
	const moment = $derived(`${slide?.id}:${screen}`);

	const points = new Tween(0, { duration: 900, easing: cubicOut });
	$effect(() => {
		const target = s.reveal?.points ?? 0;
		if (screen !== 'result') {
			points.set(0, { duration: 0 });
			return;
		}
		points.set(target, { duration: reduced() ? 0 : 900, delay: 250 });
	});

	const ordinal = (n: number) => {
		const v = n % 100;
		return n + (['th', 'st', 'nd', 'rd'][(v - 20) % 10] || ['th', 'st', 'nd', 'rd'][v] || 'th');
	};
</script>

<div class="flex flex-1 flex-col" style:--accent={accent}>
	<!-- Kind + progress + timer -->
	{#if slide && s.view === 'slide'}
		<div class="flex min-h-12 items-center justify-between gap-3">
			<div class="flex min-w-0 items-center gap-2">
				<span
					class="inline-flex min-w-0 items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold tracking-[0.12em] uppercase ring-1"
					style:color="color-mix(in oklab, var(--accent) 45%, var(--color-forest-950))"
					style:background="color-mix(in srgb, var(--accent) 18%, var(--color-card))"
					style:--tw-ring-color="color-mix(in srgb, var(--accent) 45%, transparent)"
				>
					{#if KindIcon}<KindIcon class="size-3.5 shrink-0" />{/if}
					<span class="truncate">{SLIDE_META[slide.kind].label}</span>
				</span>
				<span class="shrink-0 text-[13px] font-medium text-muted-foreground tabular" aria-label="Question {s.index + 1} of {s.total}">{s.index + 1}/{s.total}</span>
			</div>
			{#if s.phase === 'open' && s.endsAt != null && !answer}
				<div class="shrink-0" in:pop={{ duration: DUR.layout }}>
					<CountdownRing endsAt={s.endsAt} clockOffset={room.clockOffset} totalMs={slide.timeLimit * 1000} tone="light" class="size-12" />
				</div>
			{/if}
		</div>
		<div class="mt-2 mb-5 h-1 overflow-hidden rounded-full bg-forest-950/8" aria-hidden="true">
			<div
				class="h-full rounded-full transition-[width] duration-700 ease-out-quart"
				style:width="{((s.index + 1) / s.total) * 100}%"
				style:background="linear-gradient(90deg, color-mix(in srgb, var(--accent) 55%, var(--color-green-300)), var(--accent))"
			></div>
		</div>
	{/if}

	<div class="grid flex-1 [grid-template-areas:'stack'] *:[grid-area:stack]">
		{#key moment}
			<div class="flex flex-col" in:rise={{ y: 16, duration: DUR.layout, delay: 60 }} out:softFade={{ duration: DUR.fast }}>
				{#if screen === 'leaderboard'}
					<div class="my-auto text-center">
						<div class="mx-auto grid size-14 place-items-center rounded-full bg-sun-light text-forest-900" in:pop={{ duration: DUR.stage }}><Trophy class="size-6" /></div>
						{#if s.standing}
							<p class="mt-5 eyebrow text-forest-700">Your place</p>
							<p class="mt-1 font-display text-5xl font-semibold text-forest-950 tabular">{ordinal(s.standing.rank)}</p>
							<p class="mt-2 text-[15px] text-muted-foreground tabular">
								{s.standing.score.toLocaleString('en-IN')} points · {s.standing.players} players
							</p>
						{:else}
							<p class="mt-5 text-xl font-semibold text-forest-950">Leaderboard on the big screen</p>
						{/if}
					</div>
				{:else if screen === 'ready'}
					<div class="my-auto text-center">
						<p class="eyebrow text-forest-700">Get ready</p>
						<h1 class="mt-3 font-display text-2xl leading-tight font-semibold text-balance text-forest-950">{slide?.question}</h1>
						<div class="mt-8 flex justify-center gap-2" aria-hidden="true">
							{#each [0, 1, 2] as i (i)}
								<span class="size-2.5 animate-pulse-dot rounded-full bg-brand" style:animation-delay="{i * 200}ms"></span>
							{/each}
						</div>
						<p class="mt-3 text-sm text-muted-foreground">Answers open when the timer starts</p>
					</div>
				{:else if screen === 'answer' && slide}
					<h1 class="mb-6 font-display text-2xl leading-snug font-semibold text-balance wrap-break-word text-forest-950">{slide.question}</h1>
					{#if slide.input === 'tap'}
						<TapOptions
							{slide}
							{answer}
							correctIds={s.reveal?.correctIds.length ? s.reveal.correctIds : null}
							disabled={s.phase !== 'open'}
							onsubmit={(v) => room.submit(v)}
						/>
					{:else if slide.input === 'text'}
						<TextInput {slide} disabled={s.phase !== 'open'} onsubmit={(v) => room.submit(v)} />
					{:else if slide.input === 'number'}
						<NumberInput {slide} disabled={s.phase !== 'open'} onsubmit={(v) => room.submit(v)} />
					{:else if slide.input === 'order'}
						<OrderInput {slide} disabled={s.phase !== 'open'} onsubmit={(v) => room.submit(v)} />
					{/if}
				{:else if screen === 'submitted'}
					<div class="my-auto text-center">
						<div class="mx-auto grid size-20 place-items-center rounded-full bg-green-100 text-correct" in:pop={{ duration: DUR.stage, from: 0.2 }}>
							<Check class="size-10" strokeWidth={2.5} />
						</div>
						<p class="mt-6 text-2xl font-semibold text-forest-950">{confirmed ? 'Answer submitted' : 'Sending…'}</p>
						<p class="mt-2 text-[15px] text-muted-foreground">Waiting for everyone else</p>
					</div>
				{:else if screen === 'thanks'}
					<div class="my-auto text-center">
						<div class="mx-auto grid size-20 place-items-center rounded-full bg-green-100 text-correct" in:pop={{ duration: DUR.stage, from: 0.2 }}>
							<CircleCheckBig class="size-9" />
						</div>
						<p class="mt-6 text-2xl font-semibold text-forest-950">{confirmed ? 'Thanks for voting' : 'Sending…'}</p>
						<p class="mt-2 text-[15px] text-muted-foreground">Results are on the big screen</p>
					</div>
				{:else if screen === 'timesup'}
					<div class="my-auto text-center">
						<div class="mx-auto grid size-20 place-items-center rounded-full bg-sun-light/60 text-forest-900" in:pop={{ duration: DUR.stage }}>
							<Timer class="size-9" />
						</div>
						<p class="mt-6 text-2xl font-semibold text-forest-950">Time’s up</p>
						<p class="mt-2 text-[15px] text-muted-foreground">You didn’t answer this one. Next one’s yours.</p>
					</div>
				{:else if screen === 'result' && s.reveal}
					{@const ok = s.reveal.correct}
					{#if ok}<Confetti count={60} />{/if}
					<div class="my-auto text-center">
						<div
							class="mx-auto grid size-24 place-items-center rounded-full {ok ? 'bg-green-100 text-correct' : 'bg-wrong/10 text-wrong'}"
							in:pop={{ duration: DUR.stage, from: 0.2 }}
						>
							{#if ok}<Check class="size-12" strokeWidth={2.5} />{:else}<X class="size-12" strokeWidth={2.5} />{/if}
						</div>
						<p class="mt-6 font-display text-3xl font-semibold text-forest-950">{ok ? 'Correct!' : answer ? 'Not quite' : 'No answer'}</p>
						<p class="mt-2 font-display text-4xl font-semibold tabular {ok ? 'text-correct' : 'text-muted-foreground'}">
							+{Math.round(points.current).toLocaleString('en-IN')}
						</p>
						{#if s.standing}
							<p class="mx-auto mt-6 inline-flex items-center gap-2 rounded-md bg-card px-3 py-2 text-sm text-foreground ring-1 ring-border tabular">
								<Trophy class="size-4 text-sun" aria-hidden="true" />
								{ordinal(s.standing.rank)} of {s.standing.players} · {s.standing.score.toLocaleString('en-IN')} pts
							</p>
						{/if}
					</div>
				{:else}
					<div class="my-auto text-center">
						<div class="mx-auto grid size-20 place-items-center rounded-full bg-secondary text-secondary-foreground"><Monitor class="size-9" /></div>
						<p class="mt-6 text-2xl font-semibold text-forest-950">Look up</p>
						<p class="mt-2 text-[15px] text-muted-foreground">This one is on the big screen.</p>
					</div>
				{/if}
			</div>
		{/key}
	</div>

	<p class="mt-3 min-h-5 text-center text-sm text-destructive" aria-live="assertive">{room.answerError}</p>
</div>
