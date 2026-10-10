<script lang="ts">
	import { tick, untrack } from 'svelte';
	import { flip } from 'svelte/animate';
	import { backOut } from 'svelte/easing';
	import { ArrowDown, ArrowUp, Crown, Trophy } from '@lucide/svelte';
	import type { LeaderboardEntry } from '$lib/live/types';
	import { burst, reduced } from '$lib/live/motion';
	import { useGsap } from '$lib/live/gsap';
	import Avatar from './Avatar.svelte';
	import Confetti from './Confetti.svelte';

	/**
	 * Standings as a show, choreographed on one GSAP timeline: spotlights hunt
	 * the stage, third and second tip up off the floor, a beat of suspense,
	 * then first drops onto the stage — the board shakes, a shockwave rings
	 * out, rays bloom and the crown bounces in. Places 4–10 sweep in from both
	 * sides in last round's order, then race to their new ranks.
	 */
	let { entries, final = false }: { entries: LeaderboardEntry[]; final?: boolean } = $props();

	const top = $derived(entries.slice(0, 10));
	const podium = $derived([top[1], top[0], top[2]]); // 2nd, 1st, 3rd
	const rest = $derived(top.slice(3));
	const best = $derived(Math.max(1, top[0]?.score ?? 1));

	let settled = $state(false);
	let cheer = $state(false);
	const restShown = $derived(settled ? rest : [...rest].sort((a, b) => a.prevRank - b.prevRank));

	const PLACE = {
		1: { h: '100%', color: 'var(--color-sun)', label: 'Champion' },
		2: { h: '88%', color: 'var(--color-chart-5)', label: 'Runner-up' },
		3: { h: '78%', color: 'var(--color-chart-4)', label: 'Third' }
	} as const;
	/** Podium slot (left → right) → place. */
	const SLOT = [2, 1, 3] as const;

	/** Podium scores, counted up by the timeline. */
	const shown = $state({ 1: 0, 2: 0, 3: 0 });

	let root: HTMLDivElement;
	let played = false;

	$effect(() => {
		if (!top.length || played) return;
		played = true;
		untrack(() => void tick().then(play));
	});

	function play() {
		const score = (p: 1 | 2 | 3) => top[p - 1]?.score ?? 0;
		if (reduced()) {
			for (const p of [1, 2, 3] as const) shown[p] = score(p);
			settled = true;
			return;
		}
		const g = useGsap();
		const q = (sel: string) => root.querySelectorAll<HTMLElement>(sel);
		const one = (sel: string) => root.querySelector<HTMLElement>(sel);
		const card = (p: number) => one(`[data-card="${p}"]`);
		const tl = g.timeline();

		tl.from(one('[data-lb="title"]'), { opacity: 0, letterSpacing: '1.4em', duration: 1.1, ease: 'expo.out' }, 0);

		// Third and second tip up off the floor
		for (const [p, at] of [
			[3, 0.35],
			[2, 1.0]
		] as const) {
			const el = card(p);
			if (!el) continue;
			tl.from(el, { rotationX: -95, y: 90, opacity: 0, transformOrigin: '50% 100%', transformPerspective: 1400, duration: 1.1, ease: 'back.out(1.5)' }, at);
			tl.to(shown, { [p]: score(p), duration: 1.3, ease: 'power3.out' }, at + 0.3);
		}

		// A beat of suspense, then the champion lands
		const champ = card(1);
		if (champ) {
			tl.addLabel('land', 2.15);
			tl.from(champ, { scale: 2.6, y: -160, opacity: 0, filter: 'blur(26px)', duration: 0.62, ease: 'power4.in' }, 'land-=0.62');
			tl.to(root, { keyframes: { x: [0, -16, 13, -9, 6, -3, 0], y: [0, 8, -6, 4, -2, 0] }, duration: 0.5, ease: 'none' }, 'land');
			tl.fromTo(one('[data-lb="shock"]'), { scale: 0.3, opacity: 0.95 }, { scale: 3.2, opacity: 0, duration: 1.3, ease: 'expo.out', immediateRender: false }, 'land');
			tl.fromTo(one('[data-lb="flash"]'), { opacity: 0.7 }, { opacity: 0, duration: 0.9, ease: 'power2.out', immediateRender: false }, 'land');
			tl.from(one('[data-lb="rays"]'), { opacity: 0, scale: 0.3, duration: 1.4, ease: 'expo.out' }, 'land');
			tl.to(shown, { 1: score(1), duration: 1.5, ease: 'power3.out' }, 'land+=0.05');
			tl.from(one('[data-lb="crown"]'), { y: -320, rotation: -50, opacity: 0, duration: 1.1, ease: 'bounce.out' }, 'land+=0.35');
			tl.call(() => void (cheer = true), [], 'land+=0.45');
		}
		const after = champ ? 'land+=0.8' : 2;
		const gains = q('[data-lb="gain"]');
		if (gains.length) tl.from(gains, { scale: 0, opacity: 0, duration: 0.6, stagger: 0.12, ease: 'back.out(3)' }, after);

		// Places 4–10 sweep in from their own side, then race to their new ranks
		const rows = q('[data-lb="row"]');
		if (rows.length) {
			tl.from(rows, { x: (i) => (i % 2 ? 160 : -160), opacity: 0, duration: 0.85, stagger: 0.08, ease: 'expo.out', clearProps: 'transform' }, after);
			tl.call(() => void (settled = true), [], '+=0.5');
		} else {
			tl.call(() => void (settled = true));
		}
	}
</script>

<div bind:this={root} class="relative isolate flex h-full flex-col">
	<!-- Impact flash -->
	<div data-lb="flash" aria-hidden="true" class="pointer-events-none fixed inset-0 z-20 bg-white opacity-0"></div>

	<!-- Spotlights hunting from the top corners -->
	<div aria-hidden="true" class="pointer-events-none absolute -inset-x-[5vw] -top-[22vh] bottom-0 overflow-hidden motion-reduce:hidden">
		{#each ['left', 'right'] as side (side)}
			<div
				class="absolute top-0 h-[150%] w-[22vw] origin-top {side === 'left' ? 'left-[12%]' : 'right-[12%]'}"
				style:background="linear-gradient(180deg, color-mix(in srgb, var(--color-sun) 26%, transparent), transparent 75%)"
				style:clip-path="polygon(45% 0, 55% 0, 100% 100%, 0 100%)"
				style:filter="blur(14px)"
				style:animation="beam-{side} 2.6s var(--ease-out-quart) both"
			></div>
		{/each}
	</div>

	<p data-lb="title" class="relative flex items-center justify-center gap-3 font-mono text-stage-sm tracking-[0.4em] text-sun uppercase">
		<span class="h-px w-[6vw] bg-gradient-to-r from-transparent to-sun/70"></span>
		<Trophy class="size-[1.2em]" />
		{final ? 'Final standings' : 'Leaderboard'}
		<span class="h-px w-[6vw] bg-gradient-to-l from-transparent to-sun/70"></span>
	</p>

	{#if !top.length}
		<p class="mt-[8vh] text-center text-stage-md text-cream/60">No points yet — scores appear after the first quiz answer is revealed.</p>
	{:else}
		<!-- Podium -->
		<div class="relative mt-[7vh] grid min-h-0 flex-1 grid-cols-3 items-end gap-[2vw] px-[5vw]">
			{#each podium as e, i (e?.id ?? `empty-${i}`)}
				{#if e}
					{@const slot = SLOT[i]}
					{@const place = PLACE[slot]}
					{@const first = slot === 1}
					<div class="relative flex h-full flex-col justify-end">
						{#if first}
							<!-- Turning rays + shockwave behind the champion -->
							<div data-lb="rays" aria-hidden="true" class="pointer-events-none absolute top-[38%] left-1/2 -z-10 motion-reduce:hidden">
								<div
									class="absolute top-0 left-0 size-[80vh] rounded-full opacity-60"
									style:background="repeating-conic-gradient(from 0deg, color-mix(in srgb, var(--color-sun) 34%, transparent) 0deg 7deg, transparent 7deg 20deg)"
									style:mask-image="radial-gradient(closest-side, black 15%, transparent 70%)"
									style:animation="rays-spin 40s linear infinite"
								></div>
							</div>
							<span
								data-lb="shock"
								aria-hidden="true"
								class="pointer-events-none absolute top-[40%] left-1/2 -z-10 -mt-[20vh] -ml-[20vh] size-[40vh] rounded-full opacity-0 motion-reduce:hidden"
								style:box-shadow="0 0 0 4px var(--color-sun), 0 0 60px var(--color-sun)"
							></span>
						{/if}

						<div
							data-card={slot}
							class="relative flex min-h-0 flex-col items-center rounded-2xl border px-[1vw] pt-[2vh] pb-[1.8vh] backdrop-blur-md"
							style:height={place.h}
							style:border-color="color-mix(in srgb, {place.color} {first ? 70 : 40}%, transparent)"
							style:background="linear-gradient(180deg, color-mix(in srgb, {place.color} {first ? 30 : 18}%, var(--color-stage-raised)), var(--color-stage-raised) 70%)"
							style:box-shadow={first
								? `0 30px 90px -30px ${place.color}, 0 0 0 1px ${place.color}`
								: `0 18px 50px -28px color-mix(in srgb, var(--color-cream) 45%, transparent)`}
						>
							<!-- Giant outlined rank behind the content (+ the winner's glint) -->
							<span aria-hidden="true" class="pointer-events-none absolute inset-0 overflow-hidden rounded-2xl {first ? 'shimmer' : ''}">
								<span
									class="absolute -right-[0.5vw] -bottom-[4vh] font-display leading-none font-bold text-transparent select-none"
									style:font-size="clamp(6rem, 22vh, 15rem)"
									style:-webkit-text-stroke="2px color-mix(in srgb, {place.color} 35%, transparent)">{e.rank}</span
								>
							</span>

							<div class="relative">
								{#if first}
									<span data-lb="crown" class="absolute -top-[8vh] left-1/2 -ml-[clamp(1rem,3.25vh,2rem)]">
										<Crown class="size-[clamp(2rem,6.5vh,4rem)] fill-sun/30 text-sun drop-shadow-[0_4px_10px_color-mix(in_srgb,var(--color-sun)_60%,transparent)]" />
									</span>
								{/if}
								<span class="block rounded-full p-[0.5vh]" style:background="conic-gradient(from 210deg, {place.color}, transparent 60%, {place.color})">
									<Avatar
										avatar={e.avatar}
										class={first ? 'size-[clamp(3.5rem,11vh,7rem)] text-[clamp(2rem,6.5vh,4.2rem)]' : 'size-[clamp(2.75rem,7.5vh,4.75rem)] text-[clamp(1.5rem,4.2vh,2.8rem)]'}
									/>
								</span>
							</div>

							<p class="relative mt-[1.5vh] font-mono text-stage-xs tracking-[0.3em] uppercase" style:color={place.color}>{place.label}</p>
							<p class="relative mt-[0.5vh] max-w-full truncate font-display font-semibold text-cream {first ? 'text-stage-lg' : 'text-stage-md'}">{e.nickname}</p>
							<p class="relative mt-auto pt-[1vh] font-display leading-none font-bold text-cream tabular {first ? 'text-stage-xl' : 'text-stage-lg'}">
								{Math.round(shown[slot]).toLocaleString('en-IN')}
							</p>
							{#if e.gained}
								<span data-lb="gain" class="relative mt-[0.5vh] rounded-full px-2.5 py-0.5 text-stage-xs font-semibold text-forest-950 tabular" style:background={place.color}
									>+{e.gained.toLocaleString('en-IN')}</span
								>
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
			<ol class="mt-[2.5vh] grid flex-none auto-rows-min grid-cols-2 content-start gap-x-[1.5vw] gap-y-[1vh]">
				{#each restShown as e, i (e.id)}
					{@const moved = e.prevRank - e.rank}
					{@const before = Math.max(0, e.score - e.gained)}
					<li
						data-lb="row"
						class="relative isolate grid min-h-[clamp(2.5rem,6vh,4rem)] grid-cols-[3ch_auto_1fr_auto_auto] items-center gap-[1vw] overflow-hidden rounded-xl border border-stage-line bg-stage-raised/85 px-[1vw] shadow-[0_6px_20px_-12px_color-mix(in_srgb,var(--color-cream)_30%,transparent)]"
						animate:flip={{ duration: 1000, easing: backOut }}
					>
						<!-- Score bar: last round's total, then fills to the new one -->
						<span
							aria-hidden="true"
							class="absolute inset-y-0 left-0 -z-10"
							style:width="{((settled ? e.score : before) / best) * 100}%"
							style:background="linear-gradient(90deg, color-mix(in srgb, var(--color-chart-3) 10%, transparent), color-mix(in srgb, var(--color-chart-3) 34%, transparent))"
							style:box-shadow="inset -2px 0 0 color-mix(in srgb, var(--color-chart-3) 70%, transparent)"
							style:transition="width 1200ms var(--ease-out-quart) {i * 60}ms"
						></span>
						<span class="font-display text-stage-md font-semibold text-cream/55 tabular">{settled ? e.rank : e.prevRank}</span>
						<Avatar avatar={e.avatar} class="size-[clamp(1.75rem,4.2vh,2.75rem)] text-[clamp(1rem,2.4vh,1.6rem)]" />
						<span class="truncate text-stage-md font-medium text-cream">{e.nickname}</span>
						<span class="w-[4ch] text-stage-xs font-semibold tabular">
							{#if settled && moved > 0}
								<span class="inline-flex items-center text-correct-stage" in:burst={{ duration: 600 }}><ArrowUp class="size-[1.1em]" />{moved}</span>
							{:else if settled && moved < 0}
								<span class="inline-flex items-center text-wrong-stage" in:burst={{ duration: 600 }}><ArrowDown class="size-[1.1em]" />{-moved}</span>
							{/if}
						</span>
						<span class="font-display text-stage-md font-semibold text-cream tabular">{(settled ? e.score : before).toLocaleString('en-IN')}</span>
					</li>
				{/each}
			</ol>
		{/if}
	{/if}
</div>

{#if cheer}<Confetti count={final ? 180 : 110} />{/if}
