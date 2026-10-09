<script lang="ts">
	import { cubicOut } from 'svelte/easing';

	interface Props {
		/** One entry per letter; null renders an empty box. */
		letters: (string | null)[];
		/** Positions revealed by a hint (highlighted). */
		hinted?: number[];
		tone?: 'neutral' | 'success' | 'fail';
		/** Largest box width (CSS length). Boxes shrink to fit long words. */
		max?: string;
		/** Stagger reveals left to right (used when the full word is shown). */
		stagger?: boolean;
		label?: string;
	}
	let { letters, hinted = [], tone = 'neutral', max = '4rem', stagger = false, label }: Props = $props();

	const n = $derived(letters.length);
	const last = $derived(n - 1);

	function flip(_node: Element, { delay = 0 }: { delay?: number }) {
		return {
			delay,
			duration: 360,
			easing: cubicOut,
			css: (t: number) => `transform: perspective(400px) rotateX(${(1 - t) * 90}deg) scale(${0.9 + t * 0.1}); opacity: ${t}`
		};
	}

	const spoken = $derived(letters.map((l) => l ?? 'blank').join(', '));

	function boxClass(ch: string | null, i: number) {
		if (ch === null) return 'border-stage-line bg-stage-raised/70';
		if (tone === 'success') return 'border-green-300 bg-brand/25 text-cream shadow-[0_0_24px_-6px_var(--color-green-300)]';
		if (tone === 'fail') return 'border-cream/25 bg-white/5 text-cream/85';
		if (hinted.includes(i)) return 'border-sun/80 bg-sun/10 text-sun';
		return i === 0 || i === last ? 'border-green-300/60 bg-forest-900/80 text-cream' : 'border-green-300/40 bg-forest-900/60 text-cream';
	}
</script>

<div class="w-full [container-type:inline-size]" role="img" aria-label={label ? `${label}: ${spoken}` : spoken}>
	<div class="mx-auto flex w-fit justify-center gap-1.5" style:--box="min({max}, calc((100cqw - {n - 1} * 0.375rem) / {n}))">
		{#each letters as ch, i (i)}
			<div
				class="relative grid place-items-center rounded-md border-2 font-display font-bold uppercase transition-colors duration-300 {boxClass(ch, i)}"
				style:width="var(--box)"
				style:height="calc(var(--box) * 1.2)"
				style:font-size="calc(var(--box) * 0.55)"
			>
				{#key ch}
					{#if ch !== null}
						<span in:flip={{ delay: stagger ? i * 55 : 0 }}>{ch}</span>
					{:else}
						<span class="absolute bottom-[18%] h-0.5 w-[38%] rounded-full bg-green-300/30" aria-hidden="true"></span>
					{/if}
				{/key}
			</div>
		{/each}
	</div>
</div>
