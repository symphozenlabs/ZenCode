<script lang="ts">
	import EventPage from '$lib/components/site/EventPage.svelte';

	let { data } = $props();
</script>

<EventPage config={data.config} eventId="pitch-fest" />
