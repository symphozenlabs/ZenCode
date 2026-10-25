<script lang="ts">
	import { X } from '@lucide/svelte';
	import type { HTMLInputAttributes } from 'svelte/elements';

	interface Props extends Omit<HTMLInputAttributes, 'class' | 'value'> {
		label: string;
		value: string;
		error?: string;
		hint?: string;
		/** 'site' = larger public-form styling */
		tone?: 'product' | 'site';
		class?: string;
		/** Highlight the box as set by the user, with a × that calls `onunlock`. */
		locked?: boolean;
		onunlock?: () => void;
	}

	let {
		label,
		value = $bindable(),
		error,
		hint,
		tone = 'product',
		id,
		class: cls = '',
		locked = false,
		onunlock,
		...rest
	}: Props = $props();

	const uid = $props.id();
	const inputId = $derived(id ?? `f-${uid}`);
	const describedBy = $derived(error ? `${inputId}-err` : hint ? `${inputId}-hint` : undefined);
</script>

<div class="flex flex-col gap-1.5 {cls}">
	<label
		for={inputId}
		class={tone === 'site'
			? 'font-mono text-[11px] font-medium tracking-[0.16em] text-muted-foreground uppercase'
			: 'text-[13px] font-medium text-foreground'}>{label}</label
	>
	<div class="relative">
		<input
			id={inputId}
			bind:value
			aria-invalid={error ? 'true' : undefined}
			aria-describedby={describedBy}
			class="w-full rounded-md border bg-card text-foreground placeholder:text-muted-foreground/70
				transition-[border-color,box-shadow] duration-150 outline-none
				focus:border-ring focus:ring-3 focus:ring-ring/20
				{tone === 'site' ? 'h-12 px-4 text-base' : 'h-9 px-3 text-sm'}
				{error ? 'border-destructive' : locked ? 'border-primary bg-primary/5 ring-2 ring-primary/15' : 'border-input'}
				{locked && onunlock ? 'pr-9' : ''}"
			{...rest}
		/>
		{#if locked && onunlock}
			<button
				type="button"
				onclick={onunlock}
				class="absolute top-1/2 right-2 grid size-5 -translate-y-1/2 place-items-center rounded text-muted-foreground hover:bg-muted hover:text-foreground"
				aria-label="Unlock {label} so it can adjust"
				title="Unlock so it can adjust"><X class="size-3.5" /></button
			>
		{/if}
	</div>
	{#if error}
		<p id="{inputId}-err" class="text-[13px] text-destructive">{error}</p>
	{:else if hint}
		<p id="{inputId}-hint" class="text-[13px] text-muted-foreground">{hint}</p>
	{/if}
</div>
