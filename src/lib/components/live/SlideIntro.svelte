<script lang="ts">
	import type { Slide } from '$lib/live/types';
	import { SLIDE_META } from '$lib/live/slides';
	import { burst, rise } from '$lib/live/motion';
	import { SLIDE_ACCENT, SLIDE_ICONS } from './slide-icons';

	/**
	 * Title card shown for a beat before a new slide: big ghost number, the
	 * kind's icon in a glowing ring, and what's at stake. The parent swaps it
	 * for the slide (its out-transition is the parent's warpOut).
	 */
	let { slide, index, total }: { slide: Slide; index: number; total: number } = $props();

	const meta = $derived(SLIDE_META[slide.kind]);
	const Icon = $derived(SLIDE_ICONS[slide.kind]);
	const accent = $derived(SLIDE_ACCENT[slide.kind]);
	const num = $derived(String(index + 1).padStart(2, '0'));
</script>

<div class="relative grid h-full place-items-center overflow-hidden" style:--accent={accent}>
	<!-- Ghost number behind everything -->
	<p
		class="pointer-events-none absolute font-display text-[clamp(10rem,32vw,30rem)] leading-none font-bold tracking-tighter text-transparent tabular select-none"
		style="-webkit-text-stroke: 2px color-mix(in srgb, var(--accent) 28%, transparent)"
		in:rise={{ y: 60, duration: 1100 }}
		aria-hidden="true"
	>
		{num}
	</p>

	<div class="relative flex flex-col items-center text-center">
		<div class="relative" in:burst={{ duration: 900, delay: 120, rotate: -40 }}>
			<span class="absolute inset-0 animate-ping rounded-full [animation-duration:1.8s]" style:background="color-mix(in srgb, var(--accent) 22%, transparent)"></span>
			<span
				class="relative grid size-[clamp(4rem,9vh,6.5rem)] place-items-center rounded-full ring-2"
				style:background="color-mix(in srgb, var(--accent) 16%, var(--color-stage))"
				style:--tw-ring-color="var(--accent)"
				style:box-shadow="0 0 60px -6px var(--accent)"
			>
				<span class="size-[45%]" style:color="var(--accent)"><Icon class="size-full" /></span>
			</span>
		</div>

		<p class="mt-[3vh] font-mono text-stage-sm tracking-[0.3em] uppercase" style:color="var(--accent)" in:rise={{ y: 14, duration: 700, delay: 260 }}>
			{meta.scored ? 'Quiz' : 'Question'} {index + 1} / {total}
		</p>
		<p class="mt-[1.2vh] font-display text-stage-xl font-semibold tracking-tight text-cream" in:rise={{ y: 30, duration: 900, delay: 340 }}>
			{meta.label}
		</p>
		<p class="mt-[1.6vh] text-stage-md text-cream/60" in:rise={{ y: 14, duration: 700, delay: 480 }}>
			{meta.description}
		</p>

		{#if meta.scored}
			<div class="mt-[3vh] flex gap-3 font-mono text-stage-sm text-cream/80 tabular" in:rise={{ y: 12, duration: 700, delay: 600 }}>
				<span class="rounded-full px-4 py-1.5 ring-1 ring-stage-line">{slide.maxPoints.toLocaleString('en-IN')} pts</span>
				<span class="rounded-full px-4 py-1.5 ring-1 ring-stage-line">{slide.timeLimit}s</span>
			</div>
		{/if}
	</div>
</div>
