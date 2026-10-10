<script lang="ts">
	import AppHead from '$lib/components/ui/AppHead.svelte';

	// Phones usually land here straight from the QR code, so this route must
	// load the styles itself (each area brings its own; the root layout has none).
	let { children } = $props();
</script>

<AppHead />
{@render children()}
