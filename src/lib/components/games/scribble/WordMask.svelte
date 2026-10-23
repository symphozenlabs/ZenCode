<script lang="ts">
	import { cubicOut } from 'svelte/easing';

	/**
	 * The word as blanks: `_` is a hidden letter, spaces split words. Letters
	 * flip in as hints arrive; `solved` lights the whole word up.
	 */
	let { mask, size = 'md', solved = false }: { mask: string; size?: 'sm' | 'md' | 'lg' | 'xl'; solved?: boolean } = $props();

	const words = $derived(mask.split(' ').filter(Boolean));
	const counts = $derived(words.map((w) => w.length).join(' · '));
	const spoken = $derived(
		words.map((w) => [...w].map((ch) => (ch === '_' ? 'blank' : ch)).join(' ')).join(', then ') + ` (${counts} letters)`
	);
	const text = $derived({ sm: 'text-lg', md: 'text-2xl', lg: 'text-4xl', xl: 'text-5xl md:text-6xl' }[size]);

	function flip(_node: Element) {
		return { duration: 380, easing: cubicOut, css: (t: number) => `transform: perspective(300px) rotateX(${(1 - t) * 90}deg); opacity: ${t}` };
	}
</script>

<div class="flex flex-wrap items-end justify-center gap-x-[0.9em] gap-y-1 font-display font-bold uppercase {text}" role="img" aria-label={spoken}>
	{#each words as w, wi (wi)}
		<span class="flex gap-[0.18em]">
			{#each [...w] as ch, i (i)}
				<span
					class="grid w-[0.8em] place-items-center border-b-[0.09em] pb-[0.05em] leading-none transition-colors duration-300
						{solved ? 'border-green-300 text-green-300' : ch === '_' ? 'border-cream/40 text-transparent' : 'border-sun text-sun'}"
				>
					{#key ch}<span in:flip>{ch === '_' ? ' ' : ch}</span>{/key}
				</span>
			{/each}
		</span>
	{/each}
	<span class="self-center font-mono text-[0.42em] font-medium tracking-normal text-cream/45 normal-case">{counts}</span>
</div>
