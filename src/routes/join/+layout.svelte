<script lang="ts">
	import AppHead from '$lib/components/ui/AppHead.svelte';

	let { children } = $props();
</script>

<AppHead />
{@render children()}
