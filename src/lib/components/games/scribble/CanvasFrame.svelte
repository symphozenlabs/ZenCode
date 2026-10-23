<script lang="ts">
	import type { Snippet } from 'svelte';

	/**
	 * Holds the drawing at 4:3, as large as the space it's given allows, on
	 * any screen. The frame needs a height from its parent (a flex or grid
	 * cell), or `fluid` to take its height from its width.
	 */
	let { children, fluid = false, class: cls = '' }: { children: Snippet; fluid?: boolean; class?: string } = $props();
</script>

<div class="frame {fluid ? 'fluid' : ''} {cls}">
	<div class="box overflow-hidden rounded-2xl bg-white shadow-2xl ring-1 shadow-black/40 ring-white/15">
		{@render children()}
	</div>
</div>

<style>
	.frame {
		container-type: size;
		display: grid;
		place-items: center;
		min-height: 0;
		min-width: 0;
	}
	.frame.fluid {
		width: 100%;
		aspect-ratio: 4 / 3;
	}
	.box {
		width: min(100cqw, 100cqh * 4 / 3);
		aspect-ratio: 4 / 3;
	}
</style>
