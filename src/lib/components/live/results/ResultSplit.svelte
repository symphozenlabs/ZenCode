<script lang="ts">
	import { Tween } from 'svelte/motion';
	import { cubicOut } from 'svelte/easing';
	import type { Option, SlideResults } from '$lib/live/types';
	import { burst, reduced, rise } from '$lib/live/motion';

	/** This or that: a tug of war. The seam slides toward the winning side. */
	let { options, results, show }: { options: Option[]; results: SlideResults | null; show: boolean } = $props();

	const counts = $derived<Record<string, number>>(results?.input === 'tap' ? results.counts : {});
	const sides = $derived(
		options.slice(0, 2).map((o, i) => ({ o, count: counts[o.id] ?? 0, color: i === 0 ? 'var(--color-chart-1)' : 'var(--color-chart-4)' }))
	);
	const sum = $derived(sides.reduce((a, s) => a + s.count, 0));
	const share = $derived(show && sum ? sides[0].count / sum : 0.5);

	const left = new Tween(0.5, { duration: 1200, easing: cubicOut });
	$effect(() => {
		left.set(share, { duration: reduced() ? 0 : 1200 });
	});
	// Keep each side readable even at 100/0
	const w = $derived(0.16 + left.current * 0.68);
</script>

<div class="flex h-full items-center">
	<div class="relative flex h-[min(100%,52vh)] w-full overflow-hidden rounded-2xl ring-1 ring-stage-line">
		{#each sides as s, i (s.o.id)}
			{@const frac = i === 0 ? left.current : 1 - left.current}
			{@const winning = show && sum > 0 && s.count > sum - s.count}
			<div
				class="relative flex min-w-0 flex-col justify-center overflow-hidden px-[3vw] {i === 1 ? 'items-end text-right' : ''}"
				style:width="{(i === 0 ? w : 1 - w) * 100}%"
				style:background="linear-gradient({i === 0 ? '135deg' : '225deg'}, color-mix(in srgb, {s.color} 42%, var(--color-stage)), color-mix(in srgb, {s.color} 10%, var(--color-stage)))"
				in:rise={{ y: 0, duration: 900, delay: 100 + i * 120 }}
			>
				<p class="line-clamp-3 font-display text-stage-lg font-semibold text-cream">{s.o.text}</p>
				<p
					class="mt-[1.5vh] font-display text-stage-xl font-bold tabular transition-[opacity,color] duration-500 {winning ? 'text-cream' : 'text-cream/55'}"
					style:opacity={show && sum ? 1 : 0}
				>
					{Math.round(frac * 100)}%
				</p>
				<p class="text-stage-sm text-cream/60 tabular transition-opacity duration-500" style:opacity={show ? 1 : 0}>
					{s.count} {s.count === 1 ? 'vote' : 'votes'}
				</p>
			</div>
		{/each}
		<!-- VS badge on the seam -->
		<div class="pointer-events-none absolute inset-y-0 z-10 flex items-center" style:left="{w * 100}%">
			<div class="h-full w-1 -translate-x-1/2 bg-stage/80"></div>
			<span class="absolute -translate-x-1/2">
				<span
					class="grid size-[clamp(3.5rem,9vh,6rem)] place-items-center rounded-full bg-stage font-display text-stage-md font-bold text-sun shadow-[0_0_40px_-6px_var(--color-sun)] ring-2 ring-sun"
					in:burst={{ delay: 500, duration: 1000, rotate: 90 }}>VS</span
				>
			</span>
		</div>
	</div>
</div>
