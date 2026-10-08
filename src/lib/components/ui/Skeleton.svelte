<script lang="ts">
	let { class: cls = 'h-4 w-full' }: { class?: string } = $props();
</script>

<div aria-hidden="true" class="animate-pulse rounded-md bg-muted {cls}"></div>
