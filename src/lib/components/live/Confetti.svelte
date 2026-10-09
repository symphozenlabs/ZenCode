<script lang="ts">
	import { untrack } from 'svelte';
	import { reduced } from '$lib/live/motion';

	/**
	 * One-shot confetti burst over the whole viewport. Pure CSS pieces, no
	 * canvas; skipped entirely under reduced motion. Re-key to fire again.
	 */
	let { count = 90, duration = 3200 }: { count?: number; duration?: number } = $props();

	const COLORS = ['--color-sun', '--color-green-300', '--color-chart-3', '--color-chart-4', '--color-chart-5', '--color-cream'];
	// Fired once per mount: the initial props are all that matter
	const pieces = Array.from({ length: untrack(() => count) }, (_, i) => ({
		left: Math.random() * 100,
		delay: Math.random() * 600,
		dur: untrack(() => duration) * (0.65 + Math.random() * 0.5),
		drift: (Math.random() - 0.5) * 240,
		spin: (Math.random() > 0.5 ? 1 : -1) * (360 + Math.random() * 720),
		w: 6 + Math.random() * 8,
		h: 10 + Math.random() * 10,
		round: Math.random() > 0.7,
		color: COLORS[i % COLORS.length]
	}));

	let done = $state(reduced());
	$effect(() => {
		const t = setTimeout(() => (done = true), duration * 1.2 + 600);
		return () => clearTimeout(t);
	});
</script>

{#if !done}
	<div class="pointer-events-none fixed inset-0 z-30 overflow-hidden" aria-hidden="true">
		{#each pieces as p, i (i)}
			<span
				class="absolute top-0 block"
				style:left="{p.left}%"
				style:width="{p.w}px"
				style:height="{p.round ? p.w : p.h}px"
				style:border-radius={p.round ? '9999px' : '2px'}
				style:background="var({p.color})"
				style:--drift="{p.drift}px"
				style:--spin="{p.spin}deg"
				style:animation="confetti-fall {p.dur}ms cubic-bezier(0.2, 0.6, 0.4, 1) {p.delay}ms both"
			></span>
		{/each}
	</div>
{/if}
