<script lang="ts">
	interface Props {
		/** Grid cell size in px */
		size?: number;
		/** Fade the grid out toward the edges */
		masked?: boolean;
		animated?: boolean;
		class?: string;
	}
	let { size = 64, masked = true, animated = true, class: cls = '' }: Props = $props();

	const line = 'color-mix(in srgb, var(--color-green-300) 9%, transparent)';
</script>

<div
	aria-hidden="true"
	class="pointer-events-none absolute inset-0 {animated ? 'animate-grid-drift' : ''} {cls}"
	style:background-size="{size}px {size}px"
	style:background-image="linear-gradient(to right, {line} 1px, transparent 1px), linear-gradient(to bottom, {line} 1px, transparent 1px)"
	style:mask-image={masked ? 'radial-gradient(ellipse 75% 65% at 50% 40%, black 30%, transparent 100%)' : undefined}
></div>
