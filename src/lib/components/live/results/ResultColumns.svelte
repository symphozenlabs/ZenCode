<script lang="ts">
	import { Crown } from '@lucide/svelte';
	import type { Option, SlideResults } from '$lib/live/types';
	import { grow, rise } from '$lib/live/motion';

	/** Multiple choice: columns rising from the stage floor as votes arrive. */
	let { options, results, show }: { options: Option[]; results: SlideResults | null; show: boolean } = $props();

	const counts = $derived<Record<string, number>>(results?.input === 'tap' ? results.counts : {});
	const total = $derived(results?.input === 'tap' ? results.total : 0);
	const max = $derived(Math.max(1, ...options.map((o) => counts[o.id] ?? 0)));
	/** Highest count when one option clearly leads, else -1. */
	const leader = $derived.by(() => {
		const sorted = options.map((o) => counts[o.id] ?? 0).sort((a, b) => b - a);
		return sorted[0] > 0 && sorted[0] !== sorted[1] ? sorted[0] : -1;
	});
</script>

<div class="stage-panel flex h-full flex-col rounded-2xl pb-[2vh]">
	<ul class="relative flex min-h-0 flex-1 items-end justify-center gap-[2.5vw] border-b-2 border-stage-line px-[2vw] pt-[9vh]" aria-label="Results">
		{#each options as o, i (o.id)}
			{@const count = counts[o.id] ?? 0}
			{@const pct = total ? Math.round((count / total) * 100) : 0}
			{@const h = show ? Math.max(0.02, count / max) : 0.02}
			{@const color = `var(--color-chart-${(i % 6) + 1})`}
			{@const lead = show && count === leader}
			<li class="relative flex h-full w-[min(12vw,9rem)] flex-col items-center justify-end" in:grow={{ delay: 120 + i * 110, duration: 1000 }}>
				<!-- Label rides on top of the column -->
				<div
					class="absolute left-1/2 flex -translate-x-1/2 flex-col items-center pb-2 transition-[bottom,opacity]"
					style:bottom="{h * 100}%"
					style:transition-duration="1100ms"
					style:transition-timing-function="var(--ease-spring)"
					style:opacity={show ? 1 : 0}
				>
					{#if lead}<Crown class="mb-1 size-[clamp(1.25rem,3vh,2rem)] text-sun" />{/if}
					<span class="font-display text-stage-lg font-semibold text-cream tabular">{pct}%</span>
					<span class="text-stage-xs text-cream/55 tabular">{count} {count === 1 ? 'vote' : 'votes'}</span>
				</div>
				<div
					class="h-full w-full origin-bottom rounded-t-xl"
					style:transform="scaleY({h})"
					style:transition="transform 1100ms var(--ease-spring), box-shadow 600ms"
					style:background="linear-gradient(180deg, {color}, color-mix(in srgb, {color} 30%, transparent))"
					style:box-shadow={lead ? `0 0 60px -6px ${color}` : 'none'}
				></div>
			</li>
		{/each}
	</ul>
	<ul class="mt-[2vh] flex justify-center gap-[2.5vw] px-[2vw]">
		{#each options as o, i (o.id)}
			<li class="flex w-[min(12vw,9rem)] flex-col items-center text-center" in:rise={{ y: 14, delay: 300 + i * 110 }}>
				<span class="mb-1.5 h-1 w-8 rounded-full" style:background="var(--color-chart-{(i % 6) + 1})"></span>
				<span class="line-clamp-2 text-stage-sm font-medium text-cream">{o.text}</span>
			</li>
		{/each}
	</ul>
</div>
