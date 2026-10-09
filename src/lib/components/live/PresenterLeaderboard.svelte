<script lang="ts">
	import { flip } from 'svelte/animate';
	import { backOut } from 'svelte/easing';
	import { fly } from 'svelte/transition';
	import { Tween } from 'svelte/motion';
	import { ArrowDown, ArrowUp, Crown, Trophy } from '@lucide/svelte';
	import type { LeaderboardEntry } from '$lib/live/types';
	import { burst, grow, reduced, rise } from '$lib/live/motion';
	import Avatar from './Avatar.svelte';
	import Confetti from './Confetti.svelte';

	/**
	 * Standings. The podium rises third → second → first, the crown drops on
	 * the winner, and places 4–10 start in their old order and then race to
	 * their new ranks so the room sees who climbed.
	 */
	let { entries, final = false }: { entries: LeaderboardEntry[]; final?: boolean } = $props();

	const top = $derived(entries.slice(0, 10));
	const podium = $derived([top[1], top[0], top[2]]); // 2nd, 1st, 3rd
	const rest = $derived(top.slice(3));

	// Start in the previous order, then settle into the new one.
	let settled = $state(reduced());
	$effect(() => {
		const t = setTimeout(() => (settled = true), 1500);
		return () => clearTimeout(t);
	});
	const restShown = $derived(settled ? rest : [...rest].sort((a, b) => a.prevRank - b.prevRank));

	const PLACE = {
		1: { h: '100%', color: 'var(--color-sun)', delay: 1100 },
		2: { h: '74%', color: 'var(--color-chart-6)', delay: 600 },
		3: { h: '56%', color: 'var(--color-chart-4)', delay: 200 }
	} as const;

	let cheer = $state(false);
	$effect(() => {
		if (!top[0]) return;
		const t = setTimeout(() => (cheer = true), 1700);
		return () => clearTimeout(t);
	});

	// Podium scores count up as each block lands
	const ease = (x: number) => 1 - Math.pow(1 - x, 4);
	const up = { 1: new Tween(0, { easing: ease }), 2: new Tween(0, { easing: ease }), 3: new Tween(0, { easing: ease }) };
	$effect(() => {
		for (const p of [1, 2, 3] as const) up[p].set(1, { duration: reduced() ? 0 : 1400, delay: reduced() ? 0 : PLACE[p].delay + 300 });
	});
	/** Podium slot (left → right) → place. */
	const SLOT = [2, 1, 3] as const;
</script>

<div class="flex h-full flex-col">
	<p class="flex items-center justify-center gap-2 font-mono text-stage-sm tracking-[0.3em] text-sun uppercase" in:rise={{ y: 8, duration: 700 }}>
		<Trophy class="size-[1.2em]" />
		{final ? 'Final standings' : 'Leaderboard'}
	</p>

	{#if !top.length}
		<p class="mt-[8vh] text-center text-stage-md text-cream/60">No points yet — scores appear after the first quiz answer is revealed.</p>
	{:else}
		<!-- Podium -->
		<div class="mt-[2vh] grid min-h-0 flex-[1.25] grid-cols-3 items-end gap-[1.5vw] px-[6vw]">
			{#each podium as e, i (e?.id ?? `empty-${i}`)}
				{#if e}
					{@const slot = SLOT[i]}
					{@const place = PLACE[slot]}
					{@const first = slot === 1}
					<div class="flex h-full flex-col items-center justify-end">
						<div class="relative flex flex-col items-center pb-[1.5vh]" in:rise={{ y: 30, duration: 800, delay: place.delay + 200 }}>
							{#if first}
								<span class="absolute -top-[5.5vh]" in:fly={{ y: -260, duration: reduced() ? 0 : 900, delay: place.delay + 700, easing: backOut }}>
									<Crown class="size-[clamp(2rem,6vh,3.5rem)] text-sun drop-shadow-[0_0_18px_var(--color-sun)]" />
								</span>
							{/if}
							<Avatar
								avatar={e.avatar}
								class={first ? 'size-[clamp(3.5rem,11vh,7rem)] text-[clamp(2rem,6.5vh,4.2rem)]' : 'size-[clamp(2.75rem,8vh,5rem)] text-[clamp(1.5rem,4.5vh,3rem)]'}
							/>
							<p class="mt-[1vh] max-w-[16ch] truncate font-display text-stage-md font-semibold text-cream">{e.nickname}</p>
						</div>
						<div
							class="relative flex w-full flex-col items-center overflow-hidden rounded-t-xl pt-[2vh] {first ? 'shimmer' : ''}"
							style:height={place.h}
							style:background="linear-gradient(180deg, color-mix(in srgb, {place.color} 55%, var(--color-stage)), color-mix(in srgb, {place.color} 10%, var(--color-stage)))"
							style:box-shadow={first ? `0 0 90px -16px ${place.color}` : 'none'}
							in:grow={{ delay: place.delay, duration: 1000 }}
						>
							<span class="font-display text-stage-xl font-bold text-cream/90 tabular">{e.rank}</span>
							<span class="mt-[0.5vh] font-display text-stage-md font-semibold text-cream tabular">
								{Math.round(e.score * up[slot].current).toLocaleString('en-IN')}
							</span>
							{#if e.gained}
								<span class="mt-1 text-stage-xs font-semibold text-cream/70 tabular">+{e.gained.toLocaleString('en-IN')}</span>
							{/if}
						</div>
					</div>
				{:else}
					<div></div>
				{/if}
			{/each}
		</div>

		<!-- Places 4–10 -->
		{#if rest.length}
			<ol class="mt-[2.5vh] grid min-h-0 flex-1 auto-rows-min grid-cols-2 content-start gap-x-[1.5vw] gap-y-[1vh]">
				{#each restShown as e, i (e.id)}
					{@const moved = e.prevRank - e.rank}
					<li
						class="grid min-h-[clamp(2.5rem,6vh,4rem)] grid-cols-[3ch_auto_1fr_auto_auto] items-center gap-[1vw] rounded-lg bg-stage-raised/80 px-[1vw] ring-1 ring-stage-line"
						animate:flip={{ duration: 900, easing: backOut }}
						in:rise={{ y: 16, duration: 700, delay: 1300 + i * 60 }}
					>
						<span class="font-display text-stage-md font-semibold text-cream/60 tabular">{settled ? e.rank : e.prevRank}</span>
						<Avatar avatar={e.avatar} class="size-[clamp(1.75rem,4.2vh,2.75rem)] text-[clamp(1rem,2.4vh,1.6rem)]" />
						<span class="truncate text-stage-md font-medium text-cream">{e.nickname}</span>
						<span class="w-[4ch] text-stage-xs font-semibold tabular">
							{#if settled && moved > 0}
								<span class="inline-flex items-center text-correct-stage" in:burst={{ duration: 600 }}><ArrowUp class="size-[1.1em]" />{moved}</span>
							{:else if settled && moved < 0}
								<span class="inline-flex items-center text-wrong-stage" in:burst={{ duration: 600 }}><ArrowDown class="size-[1.1em]" />{-moved}</span>
							{/if}
						</span>
						<span class="font-display text-stage-md font-semibold text-cream tabular">{e.score.toLocaleString('en-IN')}</span>
					</li>
				{/each}
			</ol>
		{/if}
	{/if}
</div>

{#if cheer}<Confetti count={final ? 160 : 100} />{/if}
