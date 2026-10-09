<script lang="ts">
	import { MessagesSquare } from '@lucide/svelte';
	import { burst, rise } from '$lib/live/motion';

	/** Q&A slide: the floor is open. Questions are taken out loud for now. */
</script>

<div class="relative grid h-full place-items-center overflow-hidden text-center">
	{#each [0, 1, 2] as r (r)}
		<span
			class="absolute top-1/2 left-1/2 size-[70vh] rounded-full border border-sun/30"
			style:animation="ripple 4.5s ease-out {r * 1.5}s infinite both"
			aria-hidden="true"
		></span>
	{/each}
	<div class="relative">
		<span class="mx-auto grid size-[clamp(4.5rem,12vh,7rem)] place-items-center rounded-full bg-sun text-forest-950 shadow-[0_0_80px_-10px_var(--color-sun)]" in:burst={{ duration: 1000 }}>
			<MessagesSquare class="size-1/2" />
		</span>
		<p class="mt-[4vh] font-display text-stage-xl font-semibold text-cream" in:rise={{ y: 30, delay: 200, duration: 900 }}>Your questions</p>
		<p class="mt-[1.5vh] text-stage-md text-cream/60" in:rise={{ y: 16, delay: 360 }}>Raise a hand — the floor is open.</p>
	</div>
</div>
