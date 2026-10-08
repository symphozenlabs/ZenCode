<script lang="ts">
	import type { Component, Snippet } from 'svelte';

	/** Empty and error states share one restrained layout. */
	interface Props {
		title: string;
		description?: string;
		tone?: 'empty' | 'error';
		icon?: Component<{ class?: string }>;
		children?: Snippet;
	}
	let { title, description, tone = 'empty', icon: Icon, children }: Props = $props();
</script>

<div class="flex flex-col items-center px-6 py-14 text-center" role={tone === 'error' ? 'alert' : undefined}>
	{#if Icon}
		<div
			class="mb-4 grid size-11 place-items-center rounded-lg {tone === 'error'
				? 'bg-red-50 text-destructive'
				: 'bg-secondary text-secondary-foreground'}"
		>
			<Icon class="size-5" />
		</div>
	{/if}
	<p class="text-[15px] font-semibold text-foreground">{title}</p>
	{#if description}<p class="mt-1 max-w-sm text-sm text-muted-foreground">{description}</p>{/if}
	{#if children}<div class="mt-5 flex gap-2">{@render children()}</div>{/if}
</div>
