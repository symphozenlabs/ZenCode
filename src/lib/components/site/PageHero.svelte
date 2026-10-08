<script lang="ts">
	import type { Snippet } from 'svelte';
	import AnimatedGrid from '$lib/components/motion/AnimatedGrid.svelte';
	import GlowBackground from '$lib/components/motion/GlowBackground.svelte';
	import NoiseOverlay from '$lib/components/motion/NoiseOverlay.svelte';

	interface Props {
		eyebrow: string;
		title: string;
		description?: string;
		children?: Snippet;
		aside?: Snippet;
	}
	let { eyebrow, title, description, children, aside }: Props = $props();
</script>

<section class="relative overflow-hidden bg-stage pt-16 text-cream">
	<AnimatedGrid />
	<GlowBackground class="opacity-60" />
	<NoiseOverlay />
	<div class="shell relative grid gap-10 py-20 md:py-24 lg:grid-cols-[1.5fr_1fr] lg:items-end">
		<div>
			<p class="eyebrow text-sun">{eyebrow}</p>
			<h1 class="mt-4 font-display text-5xl leading-[1.02] font-semibold tracking-tight md:text-7xl">{title}</h1>
			{#if description}
				<p class="mt-6 max-w-2xl text-lg leading-relaxed text-cream/70">{description}</p>
			{/if}
			{#if children}<div class="mt-9 flex flex-wrap gap-3">{@render children()}</div>{/if}
		</div>
		{#if aside}<div>{@render aside()}</div>{/if}
	</div>
</section>
