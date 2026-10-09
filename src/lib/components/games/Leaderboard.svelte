<script lang="ts">
	import { flip } from 'svelte/animate';
	import { fly } from 'svelte/transition';
	import { ArrowUp, ArrowDown } from '@lucide/svelte';
	import type { RankEntry } from '$lib/games/tech-word-rush/engine';
	import XpCounter from './XpCounter.svelte';

	interface Props {
		entries: RankEntry[];
		limit?: number;
		highlightId?: string | null;
		size?: 'md' | 'lg';
	}
	let { entries, limit = 10, highlightId = null, size = 'md' }: Props = $props();

	const rows = $derived(entries.slice(0, limit));
	const pad = (n: number) => String(n).padStart(2, '0');
</script>

<ol class="flex flex-col {size === 'lg' ? 'gap-2.5' : 'gap-2'}" aria-label="Leaderboard">
	{#each rows as e, i (e.id)}
		{@const delta = e.prevRank === null ? 0 : e.prevRank - e.rank}
		<li
			animate:flip={{ duration: 550 }}
			in:fly={{ y: 16, duration: 320, delay: i * 45 }}
			class="flex items-center gap-3 rounded-lg border px-4 transition-colors duration-200 sm:gap-4
				{size === 'lg' ? 'h-16 text-xl' : 'h-12 text-base'}
				{e.id === highlightId ? 'border-sun/60 bg-sun/10' : e.rank === 1 ? 'border-green-300/50 bg-brand/15' : 'border-stage-line bg-stage-raised/80'}"
		>
			<span class="w-9 font-mono font-semibold tabular {e.rank <= 3 ? 'text-sun' : 'text-cream/50'}">{pad(e.rank)}</span>
			<span class="min-w-0 flex-1 truncate font-semibold tracking-wide text-cream uppercase">{e.name}</span>
			<span class="w-10 text-sm font-semibold">
				{#if delta > 0}
					<span class="inline-flex items-center gap-0.5 text-green-300"><ArrowUp class="size-3.5" aria-label="Up" />{delta}</span>
				{:else if delta < 0}
					<span class="inline-flex items-center gap-0.5 text-cream/40"><ArrowDown class="size-3.5" aria-label="Down" />{-delta}</span>
				{/if}
			</span>
			<span class="font-display font-bold whitespace-nowrap text-cream">
				<XpCounter value={e.xp} />
				<span class="text-[0.7em] font-medium text-cream/50">XP</span>
			</span>
		</li>
	{/each}
</ol>
