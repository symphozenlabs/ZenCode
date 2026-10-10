<script lang="ts">
	import type { NumberInputSpec } from '$lib/live/slides';
	import type { SlideResults } from '$lib/live/types';
	import { rise } from '$lib/live/motion';
	import ScaleGauge from './ScaleGauge.svelte';

	/**
	 * Scales: one dial per statement, side by side. Segments swell with the
	 * votes for each point and the needles swing to the averages in turn.
	 */
	let { specs, results, show }: { specs: NumberInputSpec[]; results: SlideResults | null; show: boolean } = $props();

	const series = $derived(results?.input === 'number' ? results.series : []);
	const cols = $derived(Math.min(specs.length, specs.length === 4 ? 2 : 3));
	const rows = $derived(Math.ceil(specs.length / Math.max(1, cols)));
</script>

<div
	class="mx-auto grid h-full w-full gap-[1.5vw]"
	style:grid-template-columns="repeat({cols}, minmax(0, 1fr))"
	style:grid-template-rows="repeat({rows}, minmax(0, 1fr))"
	style:max-width={cols === 1 ? 'min(100%, 60vh)' : cols === 2 ? 'min(100%, 120vh)' : undefined}
>
	{#each specs as spec, i (spec.id)}
		<div class="min-h-0" in:rise={{ y: 40, delay: 120 + i * 140, duration: 900 }}>
			<ScaleGauge {spec} series={series.find((x) => x.id === spec.id)} color="var(--color-chart-{((i + 2) % 6) + 1})" {show} delay={i * 260} />
		</div>
	{/each}
</div>
