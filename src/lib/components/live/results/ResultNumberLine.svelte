<script lang="ts">
	import { fly } from 'svelte/transition';
	import { bounceOut } from 'svelte/easing';
	import { Target, Users } from '@lucide/svelte';
	import type { NumberInputSpec } from '$lib/live/slides';
	import type { SlideResults } from '$lib/live/types';
	import { grow, reduced, rise } from '$lib/live/motion';
	import { fmtNum } from './text';

	/**
	 * Guess / pick a number: the spread of guesses as a histogram on a number
	 * line, with the crowd average gliding along it. On reveal a target pin
	 * drops onto the real answer with a ripple.
	 */
	interface Props {
		spec: NumberInputSpec;
		results: SlideResults | null;
		show: boolean;
		answer: number | null;
	}
	let { spec, results, show, answer }: Props = $props();

	const series = $derived(results?.input === 'number' ? results.series[0] : null);
	const bins = $derived(series?.bins ?? new Array(20).fill(0));
	const maxBin = $derived(Math.max(1, ...bins));
	const span = $derived(spec.max - spec.min || 1);
	const at = (v: number) => Math.min(100, Math.max(0, ((v - spec.min) / span) * 100));
	const ticks = $derived([0, 0.25, 0.5, 0.75, 1].map((f) => spec.min + f * span));
	const mean = $derived(series?.mean ?? null);
	const off = $derived(answer != null && mean != null ? Math.abs(mean - answer) : null);
</script>

<div class="flex h-full flex-col justify-center px-[2vw]">
	<div class="relative h-[min(100%,46vh)]">
		<!-- Histogram -->
		<div class="absolute inset-0 flex items-end gap-[0.4vw] transition-[filter] duration-700" style:filter={show ? 'none' : 'blur(14px)'}>
			{#each bins as n, i (i)}
				<div class="relative h-full flex-1" in:grow={{ delay: 80 + i * 30, duration: 800 }}>
					<div
						class="absolute inset-x-0 bottom-0 h-full origin-bottom rounded-t-md"
						style:transform="scaleY({show ? Math.max(0.015, n / maxBin) : 0.015})"
						style:transition="transform 1000ms var(--ease-spring)"
						style:background="linear-gradient(180deg, var(--color-chart-4), color-mix(in srgb, var(--color-chart-4) 25%, transparent))"
					></div>
				</div>
			{/each}
		</div>

		<!-- Crowd average -->
		{#if show && mean != null}
			<div
				class="absolute inset-y-0 z-10 w-0 transition-[left] duration-1000"
				style:left="{at(mean)}%"
				style:transition-timing-function="var(--ease-spring)"
				in:rise={{ y: -10, delay: 300 }}
			>
				<div class="absolute inset-y-0 -translate-x-1/2 border-l-2 border-dashed border-cream/60"></div>
				<span class="absolute -top-[5.5vh] inline-flex -translate-x-1/2 items-center gap-1.5 rounded-full bg-cream px-3 py-1 text-stage-sm font-semibold whitespace-nowrap text-forest-950 tabular shadow-lg">
					<Users class="size-[1em]" /> Crowd {fmtNum(mean)}
				</span>
			</div>
		{/if}

		<!-- The answer -->
		{#if answer != null}
			<div class="absolute inset-y-0 z-20 w-0" style:left="{at(answer)}%">
				<div class="absolute bottom-0 left-0">
					{#each [0, 1, 2] as r (r)}
						<span
							class="absolute top-0 left-0 size-[22vh] rounded-full border-2 border-correct-stage"
							style:animation="ripple 1.6s var(--ease-out-quart) {700 + r * 260}ms both"
							aria-hidden="true"
						></span>
					{/each}
				</div>
				<div class="absolute inset-y-0 -translate-x-1/2 border-l-4 border-correct-stage" in:fly={{ y: -400, duration: reduced() ? 0 : 900, easing: bounceOut }}></div>
				<span
					class="absolute -top-[12vh] inline-flex -translate-x-1/2 items-center gap-2 rounded-xl bg-correct-stage px-4 py-2 font-display text-stage-md font-bold whitespace-nowrap text-forest-950 tabular shadow-[0_0_40px_-6px_var(--color-correct-stage)]"
					in:fly={{ y: -400, duration: reduced() ? 0 : 900, easing: bounceOut }}
				>
					<Target class="size-[1.1em]" /> {fmtNum(answer)}
				</span>
			</div>
		{/if}
	</div>

	<!-- Axis -->
	<div class="relative mt-2 h-[6vh] border-t-2 border-stage-line">
		{#each ticks as t, i (i)}
			<span class="absolute top-2 -translate-x-1/2 text-stage-sm text-cream/55 tabular" style:left="{(i / 4) * 100}%">{fmtNum(t)}</span>
		{/each}
	</div>

	<p class="mt-[1vh] min-h-[1.5em] text-center text-stage-md text-cream/70">
		{#if off != null && show}
			<span in:rise={{ y: 10, delay: 900 }}>The crowd was off by <span class="font-display font-semibold text-sun tabular">{fmtNum(off)}</span></span>
		{:else if series}
			<span class="tabular">{series.count} {series.count === 1 ? 'guess' : 'guesses'}</span>
		{/if}
	</p>
</div>
