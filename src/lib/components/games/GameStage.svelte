<script lang="ts">
	import type { Snippet } from 'svelte';
	import AnimatedGrid from '$lib/components/motion/AnimatedGrid.svelte';
	import GlowBackground from '$lib/components/motion/GlowBackground.svelte';
	import NoiseOverlay from '$lib/components/motion/NoiseOverlay.svelte';

	/**
	 * Dark ZenCode stage used by the live game screens (presenter + phone).
	 * `fit` pins the stage to the part of the screen above a phone keyboard
	 * (the visual viewport), so a screen with a text box keeps its content in
	 * view while typing instead of the page scrolling away under it.
	 */
	let { children, class: cls = '', fit = false }: { children: Snippet; class?: string; fit?: boolean } = $props();

	let vv = $state<{ h: number; top: number } | null>(null);
	$effect(() => {
		const v = window.visualViewport;
		if (!fit || !v) return;
		const update = () => (vv = { h: v.height, top: v.offsetTop });
		update();
		v.addEventListener('resize', update);
		v.addEventListener('scroll', update);
		return () => {
			v.removeEventListener('resize', update);
			v.removeEventListener('scroll', update);
			vv = null;
		};
	});
</script>

<div
	class="isolate overflow-hidden bg-stage font-sans text-cream {fit ? 'fixed inset-x-0 top-0 h-dvh' : 'relative min-h-dvh'} {cls}"
	style={fit && vv ? `top: ${vv.top}px; height: ${vv.h}px` : undefined}
>
	<AnimatedGrid size={56} />
	<GlowBackground class="opacity-80" />
	<NoiseOverlay opacity={0.05} />
	<div class="relative z-10 flex flex-col {fit ? 'h-full' : 'min-h-dvh'}">
		{@render children()}
	</div>
</div>
