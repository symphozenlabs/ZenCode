<script lang="ts">
	import type { Snippet } from 'svelte';
	import AnimatedGrid from '$lib/components/motion/AnimatedGrid.svelte';
	import GlowBackground from '$lib/components/motion/GlowBackground.svelte';
	import NoiseOverlay from '$lib/components/motion/NoiseOverlay.svelte';

	/** Dark ZenCode stage used by the live game screens (presenter + phone). */
	let { children, class: cls = '' }: { children: Snippet; class?: string } = $props();
</script>

<div class="relative isolate min-h-dvh overflow-hidden bg-stage font-sans text-cream {cls}">
	<AnimatedGrid size={56} />
	<GlowBackground class="opacity-80" />
	<NoiseOverlay opacity={0.05} />
	<div class="relative z-10 flex min-h-dvh flex-col">
		{@render children()}
	</div>
</div>
