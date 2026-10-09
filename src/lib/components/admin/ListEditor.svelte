<script lang="ts">
	import { ArrowUp, ArrowDown, Trash2, Plus } from '@lucide/svelte';
	import Button from '$lib/components/ui/Button.svelte';

	/** Edit an ordered list of strings (tracks, rules, organisers). */
	interface Props {
		label: string;
		items: string[];
		placeholder?: string;
		addLabel?: string;
		multiline?: boolean;
	}
	let { label, items = $bindable(), placeholder = '', addLabel = 'Add item', multiline = false }: Props = $props();

	function move(i: number, d: -1 | 1) {
		const j = i + d;
		if (j < 0 || j >= items.length) return;
		[items[i], items[j]] = [items[j], items[i]];
	}
	const remove = (i: number) => items.splice(i, 1);
	const add = () => items.push('');
</script>

<fieldset>
	<legend class="text-[13px] font-medium">{label}</legend>
	{#if items.length}
		<ol class="mt-2 space-y-2">
			{#each items as _, i (i)}
				<li class="flex items-start gap-2">
					<span class="w-6 pt-2 text-right font-mono text-[11px] text-muted-foreground">{i + 1}</span>
					{#if multiline}
						<textarea
							bind:value={items[i]}
							{placeholder}
							rows="2"
							aria-label="{label} {i + 1}"
							class="min-h-9 flex-1 resize-y rounded-md border border-input bg-card px-3 py-2 text-sm outline-none focus:border-ring focus:ring-3 focus:ring-ring/20"
						></textarea>
					{:else}
						<input
							bind:value={items[i]}
							{placeholder}
							aria-label="{label} {i + 1}"
							class="h-9 flex-1 rounded-md border border-input bg-card px-3 text-sm outline-none focus:border-ring focus:ring-3 focus:ring-ring/20"
						/>
					{/if}
					<div class="flex">
						<Button variant="ghost" size="icon" aria-label="Move up" disabled={i === 0} onclick={() => move(i, -1)}><ArrowUp class="size-4" /></Button>
						<Button variant="ghost" size="icon" aria-label="Move down" disabled={i === items.length - 1} onclick={() => move(i, 1)}><ArrowDown class="size-4" /></Button>
						<Button variant="ghost" size="icon" aria-label="Remove" class="hover:text-destructive" onclick={() => remove(i)}><Trash2 class="size-4" /></Button>
					</div>
				</li>
			{/each}
		</ol>
	{:else}
		<p class="mt-1 text-[13px] text-muted-foreground">None yet — the public site shows “To be announced”.</p>
	{/if}
	<Button variant="outline" size="sm" class="mt-2" onclick={add}><Plus class="size-3.5" /> {addLabel}</Button>
</fieldset>
