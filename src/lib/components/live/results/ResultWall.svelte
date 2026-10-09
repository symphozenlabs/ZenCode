<script lang="ts">
	import { flip } from 'svelte/animate';
	import { backOut } from 'svelte/easing';
	import type { SlideResults, TextGroup } from '$lib/live/types';
	import { rise } from '$lib/live/motion';
	import { hashTilt, hashTint } from './text';

	/**
	 * Open ended: answers land as cards at the bottom of three columns and
	 * push older ones up and out under a fade — a live, rising wall.
	 */
	let { results, show }: { results: SlideResults | null; show: boolean } = $props();

	const COLS = 3;
	const PER_COL = 7;

	const byTime = $derived<TextGroup[]>(results?.input === 'text' ? [...results.groups].sort((a, b) => a.at - b.at) : []);
	const newest = $derived(byTime.at(-1)?.key);
	const columns = $derived(
		Array.from({ length: COLS }, (_, c) => byTime.filter((_, i) => i % COLS === c).slice(-PER_COL))
	);
</script>

{#if !byTime.length}
	<div class="grid h-full place-items-center">
		<p class="flex items-center gap-3 text-stage-md text-cream/50">
			<span class="flex gap-1.5" aria-hidden="true">
				{#each [0, 1, 2] as i (i)}<span class="size-2 animate-pulse-dot rounded-full bg-sun" style:animation-delay="{i * 200}ms"></span>{/each}
			</span>
			Answers will appear here
		</p>
	</div>
{:else}
	<div
		class="grid h-full grid-cols-3 gap-[1.4vw] transition-[filter] duration-700 [mask-image:linear-gradient(to_bottom,transparent,black_22%)]"
		style:filter={show ? 'none' : 'blur(16px)'}
	>
		{#each columns as col, c (c)}
			<ul class="flex min-h-0 flex-col justify-end gap-[1.4vh] overflow-hidden pb-1">
				{#each col as g (g.key)}
					{@const tint = `var(--color-chart-${hashTint(g.key)})`}
					<li
						class="relative rounded-xl bg-stage-raised/90 px-[1.2vw] py-[1.4vh] ring-1 transition-[box-shadow] duration-700"
						style:rotate="{hashTilt(g.key)}deg"
						style:--tw-ring-color={g.key === newest ? tint : 'var(--color-stage-line)'}
						style:box-shadow={g.key === newest ? `0 0 40px -12px ${tint}` : 'none'}
						in:rise={{ y: 70, duration: 900 }}
						animate:flip={{ duration: 700, easing: backOut }}
					>
						<span class="absolute inset-y-3 left-0 w-1 rounded-full" style:background={tint}></span>
						<p class="text-stage-md leading-snug wrap-break-word text-cream">{g.text}</p>
						{#if g.count > 1}
							<span class="mt-1 inline-block rounded-full px-2 py-0.5 font-mono text-stage-xs text-forest-950" style:background={tint}>×{g.count}</span>
						{/if}
					</li>
				{/each}
			</ul>
		{/each}
	</div>
{/if}
