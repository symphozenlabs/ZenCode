<script lang="ts">
	import AppHead from '$lib/components/ui/AppHead.svelte';

	// Reached straight from a certificate's QR code, so it loads its own styles
	// (each area brings its own; the root layout has none).
	let { children } = $props();
</script>

<AppHead />
{@render children()}
