<script lang="ts">
	import type { Snippet } from 'svelte';

	interface Props {
		eyebrow?: string;
		title: string;
		description?: string;
		actions?: Snippet;
	}
	let { eyebrow, title, description, actions }: Props = $props();
</script>

<div class="mb-6 flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
	<div>
		{#if eyebrow}<p class="text-xs font-semibold tracking-[0.1em] text-muted-foreground uppercase">{eyebrow}</p>{/if}
		<h1 class="mt-1 text-2xl font-semibold tracking-tight text-foreground">{title}</h1>
		{#if description}<p class="mt-1 text-sm text-muted-foreground">{description}</p>{/if}
	</div>
	{#if actions}<div class="flex flex-wrap gap-2">{@render actions()}</div>{/if}
</div>
