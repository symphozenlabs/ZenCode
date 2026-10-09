<script lang="ts">
	import { untrack } from 'svelte';
	import { ChevronDown, ChevronUp, GripVertical, Send } from '@lucide/svelte';
	import { moveItem, sortable } from '$lib/actions/sortable';
	import type { PublicSlide } from '$lib/live/slides';
	import type { Option, ResponseValue } from '$lib/live/types';
	import { DUR, rise } from '$lib/live/motion';
	import Button from '$lib/components/ui/Button.svelte';

	/** Phone input for ranking / line up: drag (or use the arrows) to order. */
	interface Props {
		slide: PublicSlide;
		disabled?: boolean;
		onsubmit: (value: ResponseValue) => void;
	}
	let { slide, disabled = false, onsubmit }: Props = $props();

	// Fresh per slide (PlayerLive re-mounts inputs), so the initial order is enough
	let items = $state<Option[]>([...untrack(() => slide).options]);
	const reorder = (from: number, to: number) => moveItem(items, from, to);
</script>

<div class="flex flex-col gap-3">
	<p class="text-[13px] font-medium text-muted-foreground">{slide.kind === 'lineup' ? 'Put these in the right order' : 'Drag your favourite to the top'}</p>
	<ol class="flex flex-col gap-2" use:sortable={{ onsort: reorder, disabled }}>
		{#each items as item, i (item.id)}
			<li
				data-sort-item
				class="flex items-center gap-2 rounded-lg bg-card py-1.5 pr-1.5 pl-1 shadow-sm ring-1 ring-border data-lifted:shadow-xl data-lifted:ring-2 data-lifted:ring-brand"
				in:rise={{ y: 10, duration: DUR.layout, delay: i * 45 }}
			>
				<button type="button" data-sort-handle class="grid h-11 w-8 cursor-grab place-items-center text-muted-foreground active:cursor-grabbing" aria-label="Drag to reorder">
					<GripVertical class="size-4" />
				</button>
				<span class="grid size-8 shrink-0 place-items-center rounded-full bg-secondary font-display text-sm font-semibold text-secondary-foreground tabular">{i + 1}</span>
				<span class="min-w-0 flex-1 text-base font-medium wrap-break-word text-foreground">{item.text}</span>
				<span class="flex shrink-0 flex-col">
					<button type="button" class="grid h-6 w-9 place-items-center rounded text-muted-foreground disabled:opacity-25" disabled={disabled || i === 0} onclick={() => reorder(i, i - 1)} aria-label="Move up">
						<ChevronUp class="size-4" />
					</button>
					<button
						type="button"
						class="grid h-6 w-9 place-items-center rounded text-muted-foreground disabled:opacity-25"
						disabled={disabled || i === items.length - 1}
						onclick={() => reorder(i, i + 1)}
						aria-label="Move down"
					>
						<ChevronDown class="size-4" />
					</button>
				</span>
			</li>
		{/each}
	</ol>
	<Button size="xl" class="w-full" {disabled} onclick={() => onsubmit({ input: 'order', ids: items.map((o) => o.id) })}>
		<Send class="size-4" /> Submit order
	</Button>
</div>
