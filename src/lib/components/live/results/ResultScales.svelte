<script lang="ts">
	import type { NumberInputSpec } from '$lib/live/slides';
	import type { SlideResults } from '$lib/live/types';
	import { burst, rise } from '$lib/live/motion';
	import { fmtNum } from './text';

	/**
	 * Scales: one track per statement. Every point on the scale is a bubble
	 * that swells with the people who chose it; a marker glides to the average.
	 */
	let { specs, results, show }: { specs: NumberInputSpec[]; results: SlideResults | null; show: boolean } = $props();

	const series = $derived(results?.input === 'number' ? results.series : []);
	const first = $derived(specs[0]);
	const stops = $derived(first ? Array.from({ length: first.max - first.min + 1 }, (_, i) => first.min + i) : []);
	const pos = (v: number) => (first ? ((v - first.min) / Math.max(1, first.max - first.min)) * 100 : 0);
</script>

<div class="flex h-full flex-col justify-center">
	<!-- Scale ends -->
	<div class="grid grid-cols-[minmax(0,2fr)_minmax(0,3fr)_5rem] gap-[2vw] pb-[1.5vh]">
		<span></span>
		<div class="flex justify-between font-mono text-stage-xs tracking-[0.18em] text-cream/55 uppercase">
			<span>{first?.minLabel || first?.min}</span><span>{first?.maxLabel || first?.max}</span>
		</div>
		<span></span>
	</div>

	<ul class="flex flex-col gap-[3vh]">
		{#each specs as spec, i (spec.id)}
			{@const s = series.find((x) => x.id === spec.id)}
			{@const maxBin = Math.max(1, ...(s?.bins ?? [0]))}
			{@const color = `var(--color-chart-${((i + 2) % 6) + 1})`}
			<li class="grid grid-cols-[minmax(0,2fr)_minmax(0,3fr)_5rem] items-center gap-[2vw]" in:rise={{ y: 20, delay: 120 + i * 120, duration: 800 }}>
				<p class="text-stage-md font-medium text-cream">{spec.label}</p>
				<div class="relative h-[clamp(3rem,9vh,5.5rem)]">
					<div class="absolute inset-x-0 top-1/2 h-1 -translate-y-1/2 rounded-full bg-stage-line"></div>
					{#each stops as v, k (v)}
						{@const n = s?.bins[k] ?? 0}
						<span
							class="absolute top-1/2 grid -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full"
							style:left="{pos(v)}%"
							style:width="clamp(0.75rem, {show ? 1.2 + (n / maxBin) * 4.2 : 1.2}vw, 6rem)"
							style:aspect-ratio="1"
							style:background="color-mix(in srgb, {color} {show && n ? 35 + (n / maxBin) * 55 : 18}%, var(--color-stage))"
							style:transition="width 900ms var(--ease-spring), background-color 600ms"
						>
							<span class="text-stage-xs font-semibold text-forest-950 tabular transition-opacity duration-500" style:opacity={show && n / maxBin > 0.45 ? 1 : 0}>{n}</span>
						</span>
					{/each}
					{#if show && s?.mean != null}
						<span
							class="absolute -top-[1.2vh] z-10 -translate-x-1/2 transition-[left] duration-1000"
							style:left="{pos(s.mean)}%"
							style:transition-timing-function="var(--ease-spring)"
						>
							<span class="block size-3 rotate-45 bg-cream shadow-[0_0_16px_var(--color-cream)]" in:burst={{ delay: 400 }}></span>
						</span>
					{/if}
				</div>
				<p class="text-right font-display text-stage-lg font-semibold text-cream tabular transition-opacity duration-500" style:opacity={show && s?.mean != null ? 1 : 0.25}>
					{s?.mean != null && show ? fmtNum(s.mean) : '–'}
				</p>
			</li>
		{/each}
	</ul>
</div>
