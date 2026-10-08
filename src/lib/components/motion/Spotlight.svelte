<script lang="ts">
	/** A soft beam from the top center — used for moments of arrival (e.g. registration complete). */
	let { class: cls = '' }: { class?: string } = $props();
</script>

<div aria-hidden="true" class="pointer-events-none absolute inset-0 overflow-hidden {cls}">
	<div
		class="absolute left-1/2 top-0 h-full w-[min(900px,140%)] -translate-x-1/2"
		style="background: conic-gradient(from 180deg at 50% -8%, transparent 158deg, color-mix(in srgb, var(--color-sun) 16%, transparent) 180deg, transparent 202deg); mask-image: linear-gradient(to bottom, black 20%, transparent 85%);"
	></div>
</div>
