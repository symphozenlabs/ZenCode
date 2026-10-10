<script lang="ts">
	import { untrack } from 'svelte';
	import { Send } from '@lucide/svelte';
	import type { PublicSlide } from '$lib/live/slides';
	import type { ResponseValue } from '$lib/live/types';
	import { DUR, rise } from '$lib/live/motion';
	import Button from '$lib/components/ui/Button.svelte';

	/**
	 * Phone input for text slides: one to three short words (word cloud,
	 * type answer) or a sentence (open ended). Limits mirror the server.
	 */
	interface Props {
		slide: PublicSlide;
		disabled?: boolean;
		onsubmit: (value: ResponseValue) => void;
	}
	let { slide, disabled = false, onsubmit }: Props = $props();

	const max = $derived(slide.long ? 280 : 40);
	// Fresh per slide (PlayerLive re-mounts inputs)
	let entries = $state<string[]>(Array.from({ length: untrack(() => slide).maxEntries }, () => ''));
	const clean = $derived(entries.map((t) => t.trim()).filter(Boolean));

	function submit(e: SubmitEvent) {
		e.preventDefault();
		if (!clean.length || disabled) return;
		onsubmit({ input: 'text', texts: clean });
	}

	const field =
		'w-full rounded-lg border border-input bg-card px-4 text-base text-foreground outline-none transition-[border-color,box-shadow] duration-150 placeholder:text-muted-foreground/70 focus:border-ring focus:ring-4 focus:ring-ring/20';
</script>

<form class="flex flex-col gap-3" onsubmit={submit}>
	{#if slide.long}
		<div in:rise={{ y: 12, duration: DUR.layout }}>
			<textarea bind:value={entries[0]} maxlength={max} rows="5" placeholder="Share your thoughts…" class="{field} resize-none py-3" {disabled}></textarea>
			<p class="mt-1 text-right text-xs text-muted-foreground tabular">{entries[0].length}/{max}</p>
		</div>
	{:else}
		{#each entries as _, i (i)}
			<div in:rise={{ y: 12, duration: DUR.layout, delay: i * 60 }}>
				<input
					bind:value={entries[i]}
					maxlength={max}
					placeholder={slide.kind === 'type_answer' ? 'Type your answer' : slide.maxEntries > 1 ? `Word ${i + 1}` : 'One word or a short phrase'}
					autocomplete="off"
					autocapitalize="off"
					enterkeyhint={i === entries.length - 1 ? 'send' : 'next'}
					class="{field} h-14 text-lg"
					{disabled}
				/>
			</div>
		{/each}
	{/if}
	<Button type="submit" size="xl" class="w-full" disabled={!clean.length || disabled}>
		<Send class="size-4" /> Send
	</Button>
</form>
