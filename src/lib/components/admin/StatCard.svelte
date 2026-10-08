<script lang="ts">
	import type { Component } from 'svelte';
	import Skeleton from '$lib/components/ui/Skeleton.svelte';

	interface Props {
		label: string;
		value: number | string;
		helper?: string;
		icon?: Component<{ class?: string }>;
		loading?: boolean;
		href?: string;
	}
	let { label, value, helper, icon: Icon, loading = false, href }: Props = $props();
</script>

<svelte:element
	this={href ? 'a' : 'div'}
	{href}
	class="block rounded-lg border border-border bg-card p-4 transition-colors duration-150 {href ? 'hover:border-ring/50' : ''}"
>
	<div class="flex items-start justify-between gap-3">
		<p class="text-xs font-semibold tracking-[0.08em] text-muted-foreground uppercase">{label}</p>
		{#if Icon}
			<span class="grid size-8 place-items-center rounded-md bg-secondary text-secondary-foreground"><Icon class="size-4" /></span>
		{/if}
	</div>
	{#if loading}
		<Skeleton class="mt-2 h-8 w-16" />
	{:else}
		<p class="mt-1 text-3xl font-semibold tracking-tight text-foreground tabular">{value}</p>
	{/if}
	{#if helper}<p class="mt-1 text-xs text-muted-foreground">{helper}</p>{/if}
</svelte:element>
