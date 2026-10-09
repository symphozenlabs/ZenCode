<script lang="ts">
	let { class: cls = 'size-5', label }: { class?: string; label?: string } = $props();
</script>

<svg
	class="animate-spin {cls}"
	viewBox="0 0 24 24"
	fill="none"
	role={label ? 'status' : undefined}
	aria-label={label}
	aria-hidden={label ? undefined : 'true'}
>
	<circle cx="12" cy="12" r="9" stroke="currentColor" stroke-opacity="0.2" stroke-width="3" />
	<path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" stroke-width="3" stroke-linecap="round" />
</svg>
