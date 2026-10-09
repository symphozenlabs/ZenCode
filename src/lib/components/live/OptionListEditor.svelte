<script lang="ts">
	import { Plus, Trash2, Check, GripVertical } from '@lucide/svelte';
	import { moveItem, sortable } from '$lib/actions/sortable';
	import { uid } from '$lib/live/slides';
	import { LIMITS, type Option } from '$lib/live/types';
	import { DUR, rise, sink } from '$lib/live/motion';
	import Button from '$lib/components/ui/Button.svelte';

	/**
	 * Edits options (tap slides) or ordered items (line up / ranking).
	 * - `correct` + bindable: shows a correct toggle per option.
	 * - `ordered`: drag handles and position numbers instead of letters.
	 */
	interface Props {
		label: string;
		items: Option[];
		min: number;
		max: number;
		correct?: string[];
		ordered?: boolean;
		fixed?: boolean;
		placeholder?: (i: number) => string;
		addLabel?: string;
	}
	let {
		label,
		items = $bindable(),
		min,
		max,
		correct = $bindable(),
		ordered = false,
		fixed = false,
		placeholder = (i) => `Option ${i + 1}`,
		addLabel = 'Add option'
	}: Props = $props();

	let announce = $state('');
	const letter = (i: number) => String.fromCharCode(65 + i);

	function add() {
		if (items.length >= max) return;
		items.push({ id: uid(), text: '' });
		queueMicrotask(() => document.getElementById(`opt-${items[items.length - 1].id}`)?.focus());
	}
	function remove(i: number) {
		const [gone] = items.splice(i, 1);
		if (correct) correct = correct.filter((id) => id !== gone.id);
	}
	function toggleCorrect(id: string) {
		if (!correct) return;
		correct = correct.includes(id) ? correct.filter((x) => x !== id) : [...correct, id];
	}
	function reorder(from: number, to: number) {
		moveItem(items, from, to);
		announce = `Moved to position ${to + 1}.`;
	}
	function onkeydown(e: KeyboardEvent, i: number) {
		if (!ordered || !e.altKey) return;
		const to = e.key === 'ArrowUp' ? i - 1 : e.key === 'ArrowDown' ? i + 1 : -1;
		if (to < 0 || to >= items.length) return;
		e.preventDefault();
		reorder(i, to);
		queueMicrotask(() => document.getElementById(`opt-${items[to].id}`)?.focus());
	}
</script>

<fieldset>
	<legend class="text-[13px] font-medium text-foreground">{label}</legend>
	<ol class="mt-2 space-y-2" use:sortable={{ onsort: reorder, disabled: !ordered }}>
		{#each items as item, i (item.id)}
			{@const isCorrect = correct?.includes(item.id)}
			<li
				data-sort-item
				class="group flex items-center gap-2 rounded-md bg-card data-lifted:shadow-lg data-lifted:ring-1 data-lifted:ring-ring/40"
				in:rise={{ y: 6, duration: DUR.base }}
				out:sink={{ y: 0, duration: DUR.fast }}
			>
				{#if ordered}
					<button
						type="button"
						data-sort-handle
						class="grid h-9 w-6 cursor-grab place-items-center rounded-md text-muted-foreground hover:text-foreground active:cursor-grabbing"
						aria-label="Drag to reorder (or Alt + arrow keys in the field)"
						tabindex="-1"
					>
						<GripVertical class="size-4" />
					</button>
				{/if}
				<span
					class="grid size-7 shrink-0 place-items-center rounded-md font-mono text-xs font-semibold tabular"
					style:background="color-mix(in srgb, var(--color-chart-{(i % 6) + 1}) 30%, transparent)"
					aria-hidden="true">{ordered ? i + 1 : letter(i)}</span
				>
				<input
					id="opt-{item.id}"
					bind:value={item.text}
					placeholder={placeholder(i)}
					maxlength={LIMITS.optionText}
					aria-label="{label} {ordered ? i + 1 : letter(i)}"
					onkeydown={(e) => onkeydown(e, i)}
					class="h-9 min-w-0 flex-1 rounded-md border bg-card px-3 text-sm outline-none transition-[border-color,box-shadow] duration-150 focus:border-ring focus:ring-3 focus:ring-ring/20
						{isCorrect ? 'border-brand/60' : 'border-input'}"
				/>
				{#if correct}
					<button
						type="button"
						role="checkbox"
						aria-checked={isCorrect}
						aria-label="Correct answer"
						onclick={() => toggleCorrect(item.id)}
						class="inline-flex h-9 items-center gap-1.5 rounded-md border px-2.5 text-[13px] font-medium transition-colors duration-150
							{isCorrect ? 'border-brand/40 bg-green-100 text-forest-800' : 'border-transparent text-muted-foreground hover:bg-muted hover:text-foreground'}"
					>
						<Check class="size-4 {isCorrect ? '' : 'opacity-40'}" />
						<span class="hidden sm:inline">{isCorrect ? 'Correct' : 'Mark correct'}</span>
					</button>
				{/if}
				{#if !fixed}
					<Button
						variant="ghost"
						size="icon"
						class="text-muted-foreground hover:text-destructive"
						aria-label="Remove {ordered ? `item ${i + 1}` : `option ${letter(i)}`}"
						disabled={items.length <= min}
						onclick={() => remove(i)}><Trash2 class="size-4" /></Button
					>
				{/if}
			</li>
		{/each}
	</ol>
	{#if !fixed && items.length < max}
		<Button variant="outline" size="sm" class="mt-3" onclick={add}><Plus class="size-3.5" /> {addLabel}</Button>
	{/if}
	<p class="sr-only" aria-live="polite">{announce}</p>
</fieldset>
