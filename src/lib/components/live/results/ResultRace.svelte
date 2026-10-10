<script lang="ts">
	import { flip } from 'svelte/animate';
	import { backOut } from 'svelte/easing';
	import { Check } from '@lucide/svelte';
	import type { Option, SlideResults } from '$lib/live/types';
	import { reduced, rise } from '$lib/live/motion';
	import { fmtNum } from './text';

	/**
	 * Ranking / line up: a live race. Rows re-sort by the crowd's average
	 * position and slide past each other. For line up, the reveal snaps the
	 * rows into the true order and marks what the crowd got right.
	 */
	interface Props {
		/** Shuffled options as phones saw them. */
		options: Option[];
		/** Line up only: the true order (ids). */
		key: string[] | null;
		results: SlideResults | null;
		show: boolean;
		revealed: boolean;
	}
	let { options, key, results, show, revealed }: Props = $props();

	const avg = $derived(new Map(results?.input === 'order' ? results.items.map((x) => [x.id, x.avg]) : []));
	const total = $derived(results?.total ?? 0);
	const n = $derived(options.length);
	const crowd = $derived([...options].sort((a, b) => (avg.get(a.id) ?? 0) - (avg.get(b.id) ?? 0)));
	const crowdRank = $derived(new Map(crowd.map((o, i) => [o.id, i])));
	const rows = $derived(
		revealed && key ? key.map((id) => options.find((o) => o.id === id)!).filter(Boolean) : show && total ? crowd : options
	);
	const MEDAL = ['var(--color-sun)', 'var(--color-chart-6)', 'var(--color-chart-4)'];
</script>

<ol class="flex h-full flex-col justify-center gap-[1.2vh]" aria-label="Results">
	{#each rows as o, i (o.id)}
		{@const a = avg.get(o.id)}
		{@const strength = show && total && a != null ? 1 - a / Math.max(1, n - 1) : 0}
		{@const hit = revealed && key ? crowdRank.get(o.id) === i : false}
		<li
			class="relative grid min-h-0 flex-1 grid-cols-[auto_1fr_auto] items-center gap-[1.2vw] overflow-hidden rounded-xl bg-stage-raised/85 px-[1.2vw] ring-1 transition-[box-shadow] duration-700
				{hit ? 'ring-2 ring-correct-stage' : 'ring-stage-line'}"
			style:max-height="clamp(3rem, 9vh, 5.5rem)"
			animate:flip={{ duration: reduced() ? 0 : 900, easing: backOut }}
			in:rise={{ y: 20, delay: 100 + i * 70, duration: 700 }}
		>
			<div
				aria-hidden="true"
				class="absolute inset-y-0 left-0 w-full origin-left"
				style:transform="scaleX({strength})"
				style:transition="transform 1000ms var(--ease-spring)"
				style:background="linear-gradient(90deg, color-mix(in srgb, var(--color-chart-5) 10%, transparent), color-mix(in srgb, var(--color-chart-5) 34%, transparent))"
			></div>
			<span
				class="relative grid size-[clamp(2rem,5vh,3.25rem)] place-items-center rounded-full font-display text-stage-md font-bold tabular transition-colors duration-500
					{i < 3 && (show || revealed) ? 'text-forest-950' : 'text-cream ring-1 ring-stage-line'}"
				style:background={i < 3 && (show || revealed) ? MEDAL[i] : 'transparent'}>{i + 1}</span
			>
			<span class="relative min-w-0 truncate text-stage-md font-medium text-cream">{o.text}</span>
			<span class="relative flex items-center gap-2 text-stage-sm text-cream/60 tabular">
				{#if revealed && key}
					{#if hit}
						<span class="inline-flex items-center gap-1 rounded-full bg-correct-stage px-2.5 py-0.5 font-semibold text-forest-950"><Check class="size-[1em]" strokeWidth={3} /> Crowd nailed it</span>
					{:else if crowdRank.has(o.id) && total}
						Crowd had it #{(crowdRank.get(o.id) ?? 0) + 1}
					{/if}
				{:else if show && total && a != null}
					avg #{fmtNum(a + 1)}
				{/if}
			</span>
		</li>
	{/each}
</ol>
