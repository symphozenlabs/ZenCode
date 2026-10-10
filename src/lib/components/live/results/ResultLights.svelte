<script lang="ts">
	import type { Option, SlideResults } from '$lib/live/types';
	import { burst, rise } from '$lib/live/motion';

	/** Traffic lights: three lamps that glow brighter the more people pick them. */
	let { options, results, show }: { options: Option[]; results: SlideResults | null; show: boolean } = $props();

	const COLORS: Record<string, string> = { green: 'var(--color-green-300)', yellow: 'var(--color-sun)', red: 'var(--color-wrong-stage)' };
	const counts = $derived<Record<string, number>>(results?.input === 'tap' ? results.counts : {});
	const total = $derived(results?.input === 'tap' ? results.total : 0);
	const max = $derived(Math.max(0, ...options.map((o) => counts[o.id] ?? 0)));
</script>

<div class="stage-panel flex h-full flex-col justify-center gap-[5vh] rounded-2xl py-[3vh]">
	<ul class="flex items-end justify-center gap-[6vw]" aria-label="Results">
		{#each options as o, i (o.id)}
			{@const count = counts[o.id] ?? 0}
			{@const share = show && total ? count / total : 0}
			{@const lead = show && max > 0 && count === max}
			{@const color = COLORS[o.id] ?? 'var(--color-cream)'}
			<li class="flex flex-col items-center" in:burst={{ delay: 120 + i * 160, duration: 1000 }}>
				<div class="relative grid size-[clamp(7rem,24vh,15rem)] place-items-center rounded-full bg-stage-raised p-[6%] ring-1 ring-stage-line">
					<div
						class="size-full rounded-full transition-[opacity,box-shadow] duration-1000 ease-out-quart {lead ? 'breathe' : ''}"
						style:background="radial-gradient(circle at 35% 30%, color-mix(in srgb, white 45%, {color}), {color} 55%, color-mix(in srgb, black 30%, {color}))"
						style:opacity={0.16 + share * 0.84}
						style:box-shadow="0 0 {20 + share * 120}px {share * 30}px color-mix(in srgb, {color} {Math.round(share * 70)}%, transparent)"
					></div>
					<span class="absolute font-display text-stage-lg font-bold text-forest-950 tabular transition-opacity duration-500" style:opacity={show && total ? 1 : 0}>
						{Math.round(share * 100)}%
					</span>
				</div>
				<p class="mt-[2.5vh] font-display text-stage-md font-semibold text-cream">{o.text}</p>
				<p class="text-stage-sm text-cream/55 tabular transition-opacity duration-500" style:opacity={show ? 1 : 0}>{count} {count === 1 ? 'person' : 'people'}</p>
			</li>
		{/each}
	</ul>

	<!-- Room mood strip -->
	<div class="mx-auto flex h-3 w-[min(70%,60rem)] overflow-hidden rounded-full bg-stage-line" in:rise={{ y: 10, delay: 600 }}>
		{#each options as o (o.id)}
			<div
				class="h-full transition-[width] duration-1000 ease-out-quart"
				style:width="{show && total ? ((counts[o.id] ?? 0) / total) * 100 : 0}%"
				style:background={COLORS[o.id]}
			></div>
		{/each}
	</div>
</div>
