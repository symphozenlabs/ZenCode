<script lang="ts">
	import { Check, X } from '@lucide/svelte';
	import type { Option, SlideResults } from '$lib/live/types';
	import { rise } from '$lib/live/motion';

	/**
	 * Quiz answer tiles (select answer). A 2-column grid like a game show
	 * board; each tile fills from the left with its share once results show.
	 * On reveal the right tile glints and the rest fall back.
	 */
	interface Props {
		options: Option[];
		results: SlideResults | null;
		show: boolean;
		correctIds: string[] | null;
	}
	let { options, results, show, correctIds }: Props = $props();

	const counts = $derived<Record<string, number>>(results?.input === 'tap' ? results.counts : {});
	const total = $derived(results?.input === 'tap' ? results.total : 0);
	const max = $derived(Math.max(1, ...options.map((o) => counts[o.id] ?? 0)));
	const letter = (i: number) => String.fromCharCode(65 + i);
	const twoCols = $derived(options.length > 2);
</script>

<ul class="grid h-full content-center gap-x-[1.4vw] gap-y-[1.6vh] {twoCols ? 'grid-cols-2' : 'grid-cols-1'}" aria-label="Results">
	{#each options as o, i (o.id)}
		{@const count = counts[o.id] ?? 0}
		{@const pct = total ? Math.round((count / total) * 100) : 0}
		{@const isCorrect = correctIds?.includes(o.id) ?? false}
		{@const dim = !!correctIds && !isCorrect}
		{@const color = `var(--color-chart-${(i % 6) + 1})`}
		<li
			class="relative grid min-h-[clamp(3.5rem,11vh,7rem)] grid-cols-[auto_1fr_auto] items-center gap-[1.2vw] overflow-hidden rounded-xl bg-stage-raised/85 px-[1.2vw] ring-1 transition-[opacity,transform,filter,box-shadow] duration-700 ease-out-quart
				{isCorrect ? 'shimmer scale-[1.02] ring-2 ring-correct-stage' : 'ring-stage-line'}
				{twoCols && options.length % 2 && i === options.length - 1 ? 'col-span-2' : ''}"
			style:opacity={dim ? 0.6 : 1}
			style:filter={dim ? 'saturate(0.45)' : 'none'}
			style:box-shadow={isCorrect ? '0 0 50px -10px var(--color-correct-stage)' : 'none'}
			in:rise={{ y: 26, duration: 760, delay: 100 + i * 90 }}
		>
			<!-- Fill (behind content) -->
			<div
				aria-hidden="true"
				class="absolute inset-y-0 left-0 w-full origin-left"
				style:transform="scaleX({show ? count / max : 0})"
				style:transition="transform 1100ms var(--ease-spring)"
				style:background="linear-gradient(90deg, color-mix(in srgb, {color} 14%, transparent), color-mix(in srgb, {color} 38%, transparent))"
			></div>
			<div aria-hidden="true" class="absolute inset-y-0 left-0 w-1.5" style:background={color}></div>

			<span
				class="relative grid size-[clamp(2.25rem,5.5vh,3.5rem)] place-items-center rounded-lg font-display text-stage-md font-bold text-forest-950"
				style:background={color}
				aria-hidden="true">{letter(i)}</span
			>
			<span class="relative min-w-0 text-stage-md font-medium wrap-break-word text-cream">{o.text}</span>
			<span class="relative flex items-center gap-[0.8vw] text-right">
				{#if isCorrect}
					<span class="grid size-[clamp(2rem,4.5vh,3rem)] place-items-center rounded-full bg-correct-stage text-forest-950" in:rise={{ y: 8, duration: 500 }}>
						<Check class="size-[60%]" strokeWidth={3} />
					</span>
				{:else if dim}
					<X class="size-[clamp(1.25rem,3vh,2rem)] text-cream/40" />
				{/if}
				<span class="flex flex-col items-end leading-none transition-opacity duration-500" style:opacity={show ? 1 : 0}>
					<span class="font-display text-stage-md font-semibold text-cream tabular">{count}</span>
					<span class="mt-1 text-stage-xs text-cream/55 tabular">{pct}%</span>
				</span>
			</span>
		</li>
	{/each}
</ul>
