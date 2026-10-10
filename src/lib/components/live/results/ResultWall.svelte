<script lang="ts">
	import { flip } from 'svelte/animate';
	import { backOut } from 'svelte/easing';
	import type { TransitionConfig } from 'svelte/transition';
	import type { SlideResults, TextGroup } from '$lib/live/types';
	import { reduced, softFade } from '$lib/live/motion';
	import { hashTilt, hashTint } from './text';

	/**
	 * Open ended: a pinboard of sticky notes. Notes stay still so they read
	 * from the back of the room; popular answers get bigger notes and move to
	 * the front, and a new answer drops onto the board with a NEW tag.
	 */
	let { results, show }: { results: SlideResults | null; show: boolean } = $props();

	/** Never more than three rows, so text stays projector-sized. */
	const ROWS = 3;

	const groups = $derived<TextGroup[]>(results?.input === 'text' ? results.groups : []);
	const newest = $derived(groups.reduce<TextGroup | undefined>((a, g) => (!a || g.at > a.at ? g : a), undefined));
	const maxCount = $derived(Math.max(1, ...groups.map((g) => g.count)));
	const total = $derived(groups.reduce((n, g) => n + g.count, 0));

	// Popular first, then newest first
	const sorted = $derived([...groups].sort((a, b) => b.count - a.count || b.at - a.at));
	/** The top answer gets a double-width note once it clearly leads. */
	const lead = $derived(sorted[0] && sorted[0].count > 1 && (sorted[1]?.count ?? 0) < sorted[0].count ? sorted[0] : null);
	const cols = $derived(groups.length > 8 ? 5 : 4);

	// Fill at most ROWS rows; when answers don't fit, the last slot says "+N more"
	const notes = $derived.by(() => {
		const room = cols * ROWS - (lead ? 1 : 0);
		if (sorted.length <= room) return sorted;
		const shown = sorted.slice(0, room - 1);
		if (newest && !shown.includes(newest)) shown[shown.length - 1] = newest; // the newest always gets a spot
		return shown;
	});
	const hidden = $derived(groups.length - notes.length);
	const rows = $derived(Math.ceil((notes.length + (lead ? 1 : 0) + (hidden ? 1 : 0)) / cols));

	const isLead = (g: TextGroup) => g === lead;
	/** A full board has shorter notes: smaller type, clamped to two lines. */
	const full = $derived(rows >= ROWS);
	const size = (g: TextGroup) => {
		if (full) return 'text-stage-md line-clamp-2';
		return isLead(g) ? 'text-stage-lg line-clamp-3' : g.count > 1 && g.count / maxCount > 0.5 ? 'text-[calc(var(--text-stage-md)*1.12)] line-clamp-3' : 'text-stage-md line-clamp-3';
	};

	/** Dropped onto the board: falls in tilted, lands with a little bounce. */
	function drop(node: Element): TransitionConfig {
		if (reduced()) return softFade(node);
		return {
			duration: 750,
			easing: backOut,
			css: (t, u) => `transform: translate3d(0, ${-u * 60}px, 0) scale(${1 + u * 0.25}) rotate(${u * -8}deg); opacity: ${Math.min(1, t * 2)}`
		};
	}
</script>

{#if !groups.length}
	<div class="grid h-full place-items-center">
		<p class="stage-panel flex items-center gap-3 rounded-full px-[1.5vw] py-[1vh] text-stage-md text-cream/70">
			<span class="flex gap-1.5" aria-hidden="true">
				{#each [0, 1, 2] as i (i)}<span class="size-2 animate-pulse-dot rounded-full bg-sun" style:animation-delay="{i * 200}ms"></span>{/each}
			</span>
			Answers will appear here
		</p>
	</div>
{:else}
	<div class="flex h-full flex-col transition-[filter] duration-700" style:filter={show ? 'none' : 'blur(16px)'}>
		<!-- A full board shares the height evenly; a sparse one sits in the middle -->
		<ul
			class="grid min-h-0 flex-1 gap-x-[1.6vw] gap-y-[3vh] px-[0.5vw] pt-[2.5vh] [grid-auto-flow:dense] {full ? '' : 'content-center'}"
			style:grid-template-columns="repeat({cols}, minmax(0, 1fr))"
			style:grid-template-rows={full ? `repeat(${ROWS}, minmax(0, 1fr))` : undefined}
		>
			{#each notes as g (g.key)}
				{@const tint = `var(--color-chart-${hashTint(g.key)})`}
				{@const fresh = g.key === newest?.key && groups.length > 1}
				<li class="relative {isLead(g) ? 'col-span-2' : ''}" style:rotate="{hashTilt(g.key, isLead(g) ? 0.6 : 1.8)}deg" in:drop animate:flip={{ duration: 650, easing: backOut }}>
					<!-- Tape -->
					<span
						aria-hidden="true"
						class="absolute -top-[1.2vh] left-1/2 z-10 h-[2.4vh] w-[30%] -translate-x-1/2 rounded-[2px]"
						style:rotate="{-hashTilt(g.key, 4)}deg"
						style:background="color-mix(in srgb, {tint} 35%, rgb(255 255 255 / 0.7))"
						style:box-shadow="0 1px 2px color-mix(in srgb, var(--color-cream) 15%, transparent)"
					></span>
					<div
						class="flex h-full flex-col justify-between gap-[1vh] overflow-hidden rounded-md px-[1.3vw] {full ? 'pt-[2vh] pb-[1.2vh]' : 'min-h-[clamp(5rem,16vh,11rem)] pt-[2.4vh] pb-[1.6vh]'}"
						style:background="linear-gradient(170deg, color-mix(in srgb, {tint} 30%, white), color-mix(in srgb, {tint} 18%, white))"
						style:box-shadow={fresh
							? `0 0 0 3px ${tint}, 0 18px 40px -16px color-mix(in srgb, ${tint} 80%, transparent)`
							: '0 14px 28px -18px color-mix(in srgb, var(--color-cream) 45%, transparent)'}
					>
						<p class="font-display leading-snug font-semibold text-balance wrap-break-word text-cream {size(g)}" title={g.text}>{g.text}</p>
						<div class="flex items-center justify-between gap-2">
							{#if fresh}
								<span class="rounded-full bg-cream px-2 py-0.5 font-mono text-stage-xs font-semibold tracking-[0.15em] text-stage">NEW</span>
							{:else}
								<span></span>
							{/if}
							{#if g.count > 1}
								<span class="flex items-center gap-1.5 font-display text-stage-md font-bold text-cream tabular" aria-label="{g.count} people">
									<span class="flex gap-0.5" aria-hidden="true">
										{#each Array.from({ length: Math.min(g.count, 5) }, (_, d) => d) as d (d)}<span class="size-[0.45em] rounded-full" style:background={tint}></span>{/each}
									</span>
									×{g.count}
								</span>
							{/if}
						</div>
					</div>
				</li>
			{/each}
			{#if hidden > 0}
				<li class="grid min-h-[clamp(4rem,12vh,9rem)] place-items-center rounded-md border-2 border-dashed border-stage-line text-stage-md font-semibold text-cream/60">
					+{hidden} more
				</li>
			{/if}
		</ul>
		<p class="stage-panel mt-[1.5vh] self-end rounded-full px-3 py-1 font-mono text-stage-xs tracking-[0.2em] text-cream/75 uppercase tabular">
			{groups.length} {groups.length === 1 ? 'answer' : 'answers'} · {total} {total === 1 ? 'response' : 'responses'}
		</p>
	</div>
{/if}
