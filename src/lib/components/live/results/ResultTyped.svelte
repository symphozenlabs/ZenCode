<script lang="ts">
	import { flip } from 'svelte/animate';
	import { backOut } from 'svelte/easing';
	import { Check } from '@lucide/svelte';
	import type { SlideResults, TextGroup } from '$lib/live/types';
	import { normalizeAnswer } from '$lib/live/slides';
	import { burst, rise } from '$lib/live/motion';

	/**
	 * Type answer. While hidden, guesses drop in as sealed tiles (no spoilers
	 * for the room). On reveal the answer is stamped up top, right guesses
	 * light up and wrong ones fade and strike through.
	 */
	interface Props {
		accepted: string[];
		results: SlideResults | null;
		show: boolean;
		revealed: boolean;
	}
	let { accepted, results, show, revealed }: Props = $props();

	const all = $derived<TextGroup[]>(results?.input === 'text' ? results.groups : []);
	const groups = $derived(all.slice(0, 36));
	const keys = $derived(new Set(accepted.map(normalizeAnswer).filter(Boolean)));
	const total = $derived(results?.total ?? 0);
	const right = $derived(all.filter((g) => keys.has(g.key)).reduce((a, g) => a + g.count, 0));
	const maxCount = $derived(Math.max(1, ...groups.map((g) => g.count)));
	const answer = $derived(accepted.find((a) => a.trim()) ?? '');
</script>

<div class="flex h-full flex-col">
	<div class="grid min-h-[clamp(4rem,12vh,8rem)] place-items-center">
		{#if revealed}
			<div class="stamp flex items-center gap-[1vw] rounded-xl border-4 border-correct-stage bg-stage/70 px-[2vw] py-[1vh]">
				<Check class="size-[clamp(1.5rem,4vh,2.75rem)] text-correct-stage" strokeWidth={3} />
				<span class="font-display text-stage-lg font-bold text-cream">{answer}</span>
			</div>
		{:else}
			<p class="font-mono text-stage-sm tracking-[0.3em] text-cream/50 uppercase tabular">
				{total} {total === 1 ? 'guess' : 'guesses'} locked in
			</p>
		{/if}
	</div>

	<ul class="flex min-h-0 flex-1 flex-wrap content-center items-center justify-center gap-[1.2vw] overflow-hidden" aria-label="Answers">
		{#each groups as g (g.key)}
			{@const ok = keys.has(g.key)}
			{@const open = show || revealed}
			<li animate:flip={{ duration: 700, easing: backOut }} in:burst={{ duration: 800, rotate: -10 }}>
				<span
					class="inline-flex items-center gap-2 rounded-full px-[1.2vw] py-[0.8vh] font-display font-semibold ring-1 transition-[background-color,color,opacity,filter] duration-700
						{revealed && ok ? 'shimmer relative overflow-hidden bg-correct-stage text-forest-950 ring-correct-stage' : 'bg-stage-raised text-cream ring-stage-line'}"
					style:font-size="calc(var(--text-stage-sm) * {1 + (g.count / maxCount) * 0.9})"
					style:opacity={revealed && !ok ? 0.35 : 1}
					style:filter={open ? 'none' : 'blur(9px)'}
				>
					{#if revealed && ok}<Check class="size-[1em]" strokeWidth={3} />{/if}
					<span class={revealed && !ok ? 'line-through decoration-2' : ''}>{open ? g.text : '•'.repeat(Math.min(10, g.text.length))}</span>
					{#if g.count > 1 && open}<span class="font-mono text-[0.7em] opacity-70">×{g.count}</span>{/if}
				</span>
			</li>
		{/each}
	</ul>

	{#if revealed && total}
		<p class="mt-[2vh] text-center text-stage-md text-cream/70" in:rise={{ y: 12, delay: 500 }}>
			<span class="font-display font-semibold text-correct-stage tabular">{Math.round((right / total) * 100)}%</span> of the room got it
		</p>
	{/if}
</div>
