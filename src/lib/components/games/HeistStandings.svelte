<script lang="ts">
	import { tick, untrack } from 'svelte';
	import { Crown, Trophy } from '@lucide/svelte';
	import { reduced } from '$lib/live/motion';
	import { useGsap } from '$lib/live/gsap';
	import Confetti from '$lib/components/live/Confetti.svelte';

	export type Standing = { id: string; name: string; avatar: string; color: string; score: number; longest: number; rank: number; mine: boolean };

	/**
	 * A room's standings on the phone, played as a show (after the live
	 * presenter's leaderboard): third and second rise out of the floor, a beat,
	 * then first slams onto the stage — the board shakes, a shockwave rings out,
	 * rays turn behind them and the crown bounces in. Everyone else sweeps in
	 * from alternate sides while their score bars fill. In a stage before the
	 * final, a line marks how many go through.
	 */
	let { entries, final = false, advance = 0, title = '' }: { entries: Standing[]; final?: boolean; advance?: number; title?: string } = $props();

	const podium = $derived([entries[1], entries[0], entries[2]]); // 2nd, 1st, 3rd
	const rest = $derived(entries.slice(3));
	const best = $derived(Math.max(1, entries[0]?.score ?? 1));
	const mineOnPodium = $derived(entries.slice(0, 3).some((e) => e.mine));

	const PLACE = {
		1: { h: 100, color: 'var(--color-sun)', label: '1st' },
		2: { h: 74, color: '#cbd5e1', label: '2nd' },
		3: { h: 56, color: '#d9925a', label: '3rd' }
	} as const;
	const SLOT = [2, 1, 3] as const;

	/** Podium scores, counted up by the timeline. */
	const shown = $state({ 1: 0, 2: 0, 3: 0 });
	let filled = $state(false);
	let cheer = $state(false);

	let root: HTMLDivElement;
	let played = false;
	$effect(() => {
		if (!entries.length || played) return;
		played = true;
		untrack(() => void tick().then(play));
	});

	function play() {
		const score = (p: 1 | 2 | 3) => entries[p - 1]?.score ?? 0;
		if (reduced()) {
			for (const p of [1, 2, 3] as const) shown[p] = score(p);
			filled = true;
			return;
		}
		const g = useGsap();
		const one = (sel: string) => root.querySelector<HTMLElement>(sel);
		const tl = g.timeline();

		tl.from(one('[data-st="title"]'), { opacity: 0, letterSpacing: '1em', duration: 0.9, ease: 'expo.out' }, 0);

		// Third and second rise out of the floor, their players hop on top
		for (const [p, at] of [
			[3, 0.25],
			[2, 0.75]
		] as const) {
			const block = one(`[data-block="${p}"]`);
			const who = one(`[data-who="${p}"]`);
			if (!block) continue;
			tl.from(block, { scaleY: 0, transformOrigin: '50% 100%', duration: 0.7, ease: 'back.out(1.6)' }, at);
			if (who) tl.from(who, { y: 40, opacity: 0, scale: 0.6, duration: 0.6, ease: 'back.out(2.2)' }, at + 0.35);
			tl.to(shown, { [p]: score(p), duration: 1, ease: 'power3.out' }, at + 0.3);
		}

		// A beat of suspense, then the champion lands
		const champBlock = one('[data-block="1"]');
		const champ = one('[data-who="1"]');
		if (champBlock && champ) {
			tl.addLabel('land', 1.9);
			tl.from(champBlock, { scaleY: 0, transformOrigin: '50% 100%', duration: 0.55, ease: 'power3.out' }, 'land-=0.75');
			tl.from(champ, { scale: 2.4, y: -120, opacity: 0, filter: 'blur(18px)', duration: 0.55, ease: 'power4.in' }, 'land-=0.55');
			tl.to(root, { keyframes: { x: [0, -10, 8, -6, 4, -2, 0], y: [0, 6, -4, 3, -1, 0] }, duration: 0.45, ease: 'none' }, 'land');
			tl.fromTo(one('[data-st="shock"]'), { scale: 0.2, opacity: 0.9 }, { scale: 2.6, opacity: 0, duration: 1.1, ease: 'expo.out', immediateRender: false }, 'land');
			tl.from(one('[data-st="rays"]'), { opacity: 0, scale: 0.3, duration: 1.2, ease: 'expo.out' }, 'land');
			tl.to(shown, { 1: score(1), duration: 1.2, ease: 'power3.out' }, 'land');
			tl.from(one('[data-st="crown"]'), { y: -140, rotation: -40, opacity: 0, duration: 1, ease: 'bounce.out' }, 'land+=0.25');
			tl.call(() => void (cheer = true), [], 'land+=0.3');
		}

		// Everyone else sweeps in from alternate sides, then the bars fill
		tl.addLabel('rest', champ ? 'land+=0.6' : 1.2);
		const rows = root.querySelectorAll<HTMLElement>('[data-st="row"]');
		if (rows.length) tl.from(rows, { x: (i) => (i % 2 ? 120 : -120), opacity: 0, duration: 0.7, stagger: 0.07, ease: 'expo.out', clearProps: 'transform' }, 'rest');
		const cut = one('[data-st="cut"]');
		if (cut) tl.from(cut, { scaleX: 0, opacity: 0, duration: 0.6, ease: 'expo.out' }, 'rest+=0.3');
		tl.call(() => void (filled = true), [], 'rest');
	}
</script>

<div bind:this={root} class="relative isolate w-full">
	<p data-st="title" class="flex items-center justify-center gap-2 font-mono text-[11px] tracking-[0.35em] text-sun uppercase">
		<span class="h-px w-8 bg-linear-to-r from-transparent to-sun/70"></span>
		<Trophy class="size-3.5" />
		{title || (final ? 'Final standings' : 'Standings')}
		<span class="h-px w-8 bg-linear-to-l from-transparent to-sun/70"></span>
	</p>

	<!-- Podium -->
	<div class="relative mt-14 grid h-60 grid-cols-3 items-end gap-2 sm:h-72 sm:gap-3">
		{#each podium as e, i (e?.id ?? `empty-${i}`)}
			{#if e}
				{@const slot = SLOT[i]}
				{@const place = PLACE[slot]}
				{@const first = slot === 1}
				<div class="relative flex h-full flex-col items-center justify-end" aria-label="{place.label}: {e.mine ? 'you' : e.name}, {e.score} points">
					{#if first}
						<!-- Turning rays and the landing shockwave behind the champion -->
						<div data-st="rays" aria-hidden="true" class="pointer-events-none absolute top-[18%] left-1/2 -z-10 motion-reduce:hidden">
							<div
								class="absolute top-0 left-0 size-104 rounded-full opacity-70"
								style:background="repeating-conic-gradient(from 0deg, color-mix(in srgb, var(--color-sun) 32%, transparent) 0deg 7deg, transparent 7deg 20deg)"
								style:mask-image="radial-gradient(closest-side, black 12%, transparent 70%)"
								style:animation="rays-spin 36s linear infinite"
							></div>
						</div>
						<span
							data-st="shock"
							aria-hidden="true"
							class="pointer-events-none absolute top-[18%] left-1/2 -z-10 -mt-20 -ml-20 size-40 rounded-full opacity-0 motion-reduce:hidden"
							style:box-shadow="0 0 0 3px var(--color-sun), 0 0 50px var(--color-sun)"
						></span>
					{/if}

					<!-- The player standing on their block -->
					<div data-who={slot} class="relative flex w-full flex-col items-center">
						{#if first}
							<span data-st="crown" class="absolute -top-9">
								<Crown class="size-9 fill-sun/30 text-sun drop-shadow-[0_4px_10px_color-mix(in_srgb,var(--color-sun)_60%,transparent)]" />
							</span>
						{/if}
						<span
							class="grid place-items-center rounded-full {first ? 'size-18 text-4xl sm:size-20 sm:text-5xl' : 'size-14 text-3xl sm:size-16 sm:text-4xl'} {e.mine ? 'standing-mine' : ''}"
							style:background="radial-gradient(circle at 50% 35%, color-mix(in srgb, {e.color} 55%, transparent), color-mix(in srgb, {e.color} 15%, transparent) 70%)"
							style:box-shadow="0 0 0 3px {place.color}, 0 10px 30px -8px {place.color}"
							style:--ring={place.color}
						>
							<span aria-hidden="true" class="drop-shadow">{e.avatar}</span>
						</span>
						<p class="mt-2 w-full truncate px-1 text-center font-display font-bold {first ? 'text-base' : 'text-sm'} {e.mine ? 'text-sun' : 'text-cream'}">{e.mine ? 'You' : e.name}</p>
					</div>

					<!-- The block: rank on its face, the score counting up -->
					<div
						data-block={slot}
						class="relative mt-2 flex w-full flex-col items-center overflow-hidden rounded-t-xl border-x border-t pt-2 {first ? 'shimmer' : ''}"
						style:height="{place.h * 0.55}%"
						style:border-color="color-mix(in srgb, {place.color} 60%, transparent)"
						style:background="linear-gradient(180deg, color-mix(in srgb, {place.color} {first ? 45 : 30}%, var(--color-stage-raised)), color-mix(in srgb, {place.color} 8%, var(--color-stage)) 85%)"
						style:box-shadow="inset 0 1px 0 color-mix(in srgb, white 35%, transparent), 0 -10px 40px -20px {place.color}"
					>
						<span class="font-display leading-none font-bold text-cream tabular {first ? 'text-3xl' : 'text-2xl'}">{Math.round(shown[slot])}</span>
						<span class="mt-0.5 text-[10px] font-semibold tracking-[0.2em] text-cream/60 uppercase">pts</span>
						<span
							aria-hidden="true"
							class="pointer-events-none absolute -bottom-3 font-display leading-none font-black text-transparent select-none {first ? 'text-7xl' : 'text-6xl'}"
							style:-webkit-text-stroke="2px color-mix(in srgb, {place.color} 55%, transparent)">{e.rank}</span
						>
					</div>
				</div>
			{:else}
				<div></div>
			{/if}
		{/each}
	</div>
	<!-- The floor the podium stands on -->
	<div aria-hidden="true" class="h-px bg-linear-to-r from-transparent via-sun/60 to-transparent"></div>

	<!-- Everyone else -->
	{#if rest.length}
		<ol class="mt-4 space-y-1.5 text-left" aria-label="Other places">
			{#each rest as e, i (e.id)}
				{#if !final && advance > 3 && i === advance - 3}
					<li data-st="cut" aria-hidden="true" class="flex items-center gap-2 py-1 font-mono text-[10px] tracking-[0.25em] text-green-300 uppercase">
						<span class="h-px flex-1 bg-linear-to-r from-transparent to-green-300/60"></span>Top {advance} go through<span class="h-px flex-1 bg-linear-to-l from-transparent to-green-300/60"></span>
					</li>
				{/if}
				<li
					data-st="row"
					class="relative isolate flex items-center gap-3 overflow-hidden rounded-xl border px-3 py-2 {e.mine ? 'standing-row-mine border-sun/70 bg-sun/10' : 'border-stage-line bg-stage-raised/85'}"
				>
					<!-- Score bar against the leader -->
					<span
						aria-hidden="true"
						class="absolute inset-y-0 left-0 -z-10"
						style:width="{filled ? (e.score / best) * 100 : 0}%"
						style:background="linear-gradient(90deg, color-mix(in srgb, {e.color} 8%, transparent), color-mix(in srgb, {e.color} 30%, transparent))"
						style:box-shadow="inset -2px 0 0 color-mix(in srgb, {e.color} 70%, transparent)"
						style:transition="width 1100ms var(--ease-out-quart) {i * 70}ms"
					></span>
					<span class="w-6 text-center font-display text-sm font-bold text-cream/55 tabular">{e.rank}</span>
					<span class="grid size-9 shrink-0 place-items-center rounded-full text-xl" style:background="color-mix(in srgb, {e.color} 25%, transparent)" style:box-shadow="inset 0 0 0 1.5px {e.color}" aria-hidden="true">{e.avatar}</span>
					<span class="min-w-0 flex-1 truncate font-semibold {e.mine ? 'text-sun' : 'text-cream'}">{e.mine ? `${e.name} (you)` : e.name}</span>
					<span class="font-display text-lg font-bold text-cream tabular">{e.score}</span>
				</li>
			{/each}
		</ol>
	{/if}
	{#if !final && advance > 0 && advance <= 3 && entries.length > advance}
		<p data-st="cut" class="mt-4 text-center font-mono text-[10px] tracking-[0.25em] text-green-300 uppercase">Top {advance} go through</p>
	{/if}
</div>

{#if cheer && (final || mineOnPodium)}<Confetti count={final ? 160 : 90} />{/if}

<style>
	/* Your own place breathes in its medal colour. */
	.standing-mine {
		animation: standing-glow 2.4s ease-in-out infinite;
	}
	@keyframes standing-glow {
		50% {
			box-shadow:
				0 0 0 4px var(--ring),
				0 0 36px 4px var(--ring);
		}
	}
	.standing-row-mine {
		box-shadow: 0 0 24px -8px var(--color-sun);
	}
	@media (prefers-reduced-motion: reduce) {
		.standing-mine {
			animation: none;
		}
	}
</style>
