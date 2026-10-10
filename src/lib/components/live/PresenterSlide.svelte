<script lang="ts">
	import { untrack } from 'svelte';
	import { Tween } from 'svelte/motion';
	import { cubicOut } from 'svelte/easing';
	import type { HostRoom } from '$lib/live/host.svelte';
	import { correctIds, publicSlide, SLIDE_META } from '$lib/live/slides';
	import { DUR, pop, reduced, rise, warpIn, warpOut } from '$lib/live/motion';
	import { SLIDE_ACCENT, SLIDE_ICONS } from './slide-icons';
	import CountdownRing from './CountdownRing.svelte';
	import Confetti from './Confetti.svelte';
	import SlideIntro from './SlideIntro.svelte';
	import { splitReveal } from '$lib/live/gsap';
	import ResultBars from './results/ResultBars.svelte';
	import ResultColumns from './results/ResultColumns.svelte';
	import ResultSplit from './results/ResultSplit.svelte';
	import ResultLights from './results/ResultLights.svelte';
	import ResultTruth from './results/ResultTruth.svelte';
	import ResultCloud from './results/ResultCloud.svelte';
	import ResultWall from './results/ResultWall.svelte';
	import ResultTyped from './results/ResultTyped.svelte';
	import ResultNumberLine from './results/ResultNumberLine.svelte';
	import ResultScales from './results/ResultScales.svelte';
	import ResultRace from './results/ResultRace.svelte';
	import QaSpotlight from './results/QaSpotlight.svelte';

	/**
	 * One slide on the big screen: a title card for a beat, then the question
	 * and the visual that belongs to its kind. `introduced` remembers which
	 * slides already had their title card, so toggling the leaderboard or a
	 * reconnect doesn't replay it.
	 */
	let { room, introduced }: { room: HostRoom; introduced: Set<string> } = $props();

	const slide = $derived(room.slide!);
	const run = $derived(room.run!);
	const live = $derived(room.live!);
	const meta = $derived(SLIDE_META[slide.kind]);
	const pub = $derived(publicSlide(slide));
	const Icon = $derived(SLIDE_ICONS[slide.kind]);
	const accent = $derived(SLIDE_ACCENT[slide.kind]);
	const timed = $derived(slide.timeLimit > 0 && meta.input !== 'none');
	const reveal = $derived(run.revealed ? correctIds(slide) : null);

	// ---- Title card -------------------------------------------------------------
	let intro = $state(
		untrack(() => {
			const first = !introduced.has(slide.id) && !reduced();
			introduced.add(slide.id);
			return first;
		})
	);
	$effect(() => {
		if (!intro) return;
		const t = setTimeout(() => (intro = false), meta.scored ? 2800 : 2400); // includes the curtain wipe
		return () => clearTimeout(t);
	});

	// ---- Timer starts by itself -----------------------------------------------------
	// Once the title card is gone and the question has landed, open responses —
	// moving to a timed slide is enough, no extra "Start timer" press.
	$effect(() => {
		if (intro || !timed || run.phase !== 'ready') return;
		const t = setTimeout(() => room.act({ t: 'start_timer' }), reduced() ? 200 : 1100);
		return () => clearTimeout(t);
	});

	// ---- Answer counter ---------------------------------------------------------
	const answered = new Tween(0, { duration: DUR.layout, easing: cubicOut });
	$effect(() => {
		answered.set(room.answered, { duration: reduced() ? 0 : DUR.layout });
	});
	const share = $derived(room.eligible ? Math.min(1, room.answered / room.eligible) : 0);

	// ---- Celebrations -----------------------------------------------------------
	let warn = $state(false);
	let burstKey = $state(0);
	let wasRevealed = untrack(() => run.revealed);
	$effect(() => {
		const now = run.revealed;
		if (now && !wasRevealed && (meta.scored || slide.kind === 'truth_or_lie')) burstKey++;
		wasRevealed = now;
	});

	const numberAnswer = $derived.by(() => {
		if (!run.revealed) return null;
		if (slide.kind === 'pick_number') return slide.config.correct;
		if (slide.kind === 'guess_number') return slide.config.answer;
		return null;
	});

	const status = $derived(
		run.phase === 'ready'
			? 'Get ready'
			: run.phase === 'open'
				? meta.scored
					? 'Answer now'
					: 'Voting open'
				: run.revealed
					? 'Answer revealed'
					: 'Responses closed'
	);
</script>

<div class="grid h-full [grid-template-areas:'stack'] *:[grid-area:stack] *:min-h-0" style:--accent={accent}>
	{#if intro}
		<div class="h-full" out:warpOut={{ duration: 520, scale: 1.12, blur: 16 }}>
			<SlideIntro {slide} index={live.index} total={room.session!.slides.length} />
		</div>
	{:else}
		<div class="flex h-full flex-col" in:warpIn={{ delay: 120, duration: 1000 }}>
			<!-- Header -->
			<div class="flex items-start justify-between gap-[3vw]">
				<div class="min-w-0">
					<div class="flex flex-wrap items-center gap-x-3 gap-y-1.5" in:rise={{ y: 8, duration: DUR.stage, delay: 200 }}>
						<span
							class="inline-flex items-center gap-2 rounded-full px-3 py-1 text-stage-xs font-semibold tracking-[0.14em] uppercase ring-1"
							style:color="var(--accent)"
							style:background="color-mix(in srgb, var(--accent) 12%, transparent)"
							style:--tw-ring-color="color-mix(in srgb, var(--accent) 40%, transparent)"
						>
							<Icon class="size-[1.15em]" />
							{meta.label}
						</span>
						<span class="font-mono text-stage-xs tracking-[0.16em] text-cream/50 uppercase tabular">{live.index + 1} / {room.session!.slides.length}</span>
						{#key status}
							<span class="font-mono text-stage-xs tracking-[0.16em] text-cream/70 uppercase" in:rise={{ y: 6, duration: DUR.layout }}>· {status}</span>
						{/key}
					</div>
					<h1
						class="mt-[1.6vh] max-w-[38ch] font-display text-stage-lg font-semibold text-balance text-cream [perspective:800px]"
						aria-label={slide.question || 'Audience Q&A'}
						use:splitReveal={{ text: slide.question || 'Audience Q&A', delay: 250 }}
					></h1>
				</div>
				{#if timed}
					<div in:pop={{ duration: DUR.stage, delay: 400, from: 0.5 }}>
						<CountdownRing
							endsAt={run.phase === 'open' ? run.endsAt : null}
							clockOffset={room.clockOffset}
							totalMs={slide.timeLimit * 1000}
							class="size-[clamp(4rem,11vh,7rem)]"
							bind:warn
						/>
					</div>
				{/if}
			</div>

			<!-- The kind's own visual -->
			<div class="mt-[4vh] min-h-0 flex-1">
				{#if slide.kind === 'select_answer'}
					<ResultBars options={pub.options} results={room.results} show={run.showResults} correctIds={reveal} />
				{:else if slide.kind === 'multiple_choice'}
					<ResultColumns options={pub.options} results={room.results} show={run.showResults} />
				{:else if slide.kind === 'this_or_that'}
					<ResultSplit options={pub.options} results={room.results} show={run.showResults} />
				{:else if slide.kind === 'traffic_lights'}
					<ResultLights options={pub.options} results={room.results} show={run.showResults} />
				{:else if slide.kind === 'truth_or_lie'}
					<ResultTruth options={pub.options} results={room.results} show={run.showResults} correctIds={reveal} closed={run.phase === 'closed'} />
				{:else if slide.kind === 'word_cloud'}
					<ResultCloud results={room.results} show={run.showResults} />
				{:else if slide.kind === 'open_ended'}
					<ResultWall results={room.results} show={run.showResults} />
				{:else if slide.kind === 'type_answer'}
					<ResultTyped accepted={slide.config.accepted} results={room.results} show={run.showResults} revealed={run.revealed} />
				{:else if slide.kind === 'pick_number' || slide.kind === 'guess_number'}
					<ResultNumberLine spec={pub.numbers[0]} results={room.results} show={run.showResults} answer={numberAnswer} />
				{:else if slide.kind === 'scales'}
					<ResultScales specs={pub.numbers} results={room.results} show={run.showResults} />
				{:else if slide.kind === 'ranking' || slide.kind === 'lineup'}
					<ResultRace
						options={pub.options}
						key={slide.kind === 'lineup' ? slide.config.items.map((i) => i.id) : null}
						results={room.results}
						show={run.showResults}
						revealed={run.revealed}
					/>
				{:else}
					<QaSpotlight />
				{/if}
			</div>

			<!-- Who has answered -->
			{#if meta.input !== 'none'}
				<div class="stage-panel mt-[2vh] flex items-center gap-[1.5vw] rounded-full px-[1.5vw] py-[1vh]" aria-live="off" in:rise={{ y: 10, delay: 500 }}>
					<p class="text-stage-sm text-cream/80 tabular">
						<span class="font-display font-semibold text-cream">{Math.round(answered.current)}</span> of {room.eligible} answered
					</p>
					<div class="relative h-2 flex-1 overflow-hidden rounded-full bg-stage-line">
						<div
							class="h-full w-full origin-left rounded-full"
							style:transform="scaleX({share})"
							style:transition="transform 700ms var(--ease-spring)"
							style:background="linear-gradient(90deg, color-mix(in srgb, var(--accent) 50%, transparent), var(--accent))"
						></div>
					</div>
					{#if share === 1 && room.eligible > 0}
						<span class="text-stage-sm font-semibold" style:color="var(--accent)" in:pop={{ duration: DUR.stage }}>Everyone’s in!</span>
					{/if}
				</div>
			{/if}
		</div>
	{/if}
</div>

<!-- Last five seconds: the stage edges pulse -->
{#if warn && run.phase === 'open'}
	<div
		class="pointer-events-none fixed inset-0 z-20"
		style="box-shadow: inset 0 0 160px 10px color-mix(in srgb, var(--color-attention) 55%, transparent); animation: edge-pulse 1s ease-in-out infinite"
		aria-hidden="true"
	></div>
{/if}

{#key burstKey}
	{#if burstKey}<Confetti />{/if}
{/key}
