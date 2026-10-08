<script lang="ts">
	import { page } from '$app/state';
	import { fly } from 'svelte/transition';
	import SiteHeader from '$lib/components/site/SiteHeader.svelte';
	import SiteFooter from '$lib/components/site/SiteFooter.svelte';

	let { data, children } = $props();
</script>

<div class="site flex min-h-dvh flex-col bg-cream">
	<a
		href="#main"
		class="sr-only z-50 rounded-md bg-sun px-4 py-2 text-forest-950 focus:not-sr-only focus:fixed focus:top-3 focus:left-3"
		>Skip to content</a
	>
	<SiteHeader />
	{#key page.url.pathname}
		<main id="main" class="flex-1" in:fly={{ y: 10, duration: 220 }}>
			{@render children()}
		</main>
	{/key}
	<SiteFooter config={data.config} />
</div>
