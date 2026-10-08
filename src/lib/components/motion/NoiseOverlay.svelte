<script lang="ts">
	let { opacity = 0.06 }: { opacity?: number } = $props();

	const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="160" height="160"><filter id="n"><feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="2" stitchTiles="stitch"/></filter><rect width="100%" height="100%" filter="url(#n)"/></svg>`;
	const noise = `url("data:image/svg+xml,${encodeURIComponent(svg)}")`;
</script>

<div
	aria-hidden="true"
	class="pointer-events-none absolute inset-0 mix-blend-overlay"
	style:opacity
	style:background-image={noise}
></div>
