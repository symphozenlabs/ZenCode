<script lang="ts">
	import { ChevronDown } from '@lucide/svelte';

	interface Props {
		label: string;
		value: string;
		options: readonly (string | { value: string; label: string })[];
		placeholder?: string;
		error?: string;
		tone?: 'product' | 'site';
		class?: string;
	}

	let {
		label,
		value = $bindable(),
		options,
		placeholder,
		error,
		tone = 'product',
		class: cls = ''
	}: Props = $props();

	const uid = $props.id();
	const normalized = $derived(options.map((o) => (typeof o === 'string' ? { value: o, label: o } : o)));
</script>

<div class="flex flex-col gap-1.5 {cls}">
	<label
		for="s-{uid}"
		class={tone === 'site'
			? 'font-mono text-[11px] font-medium tracking-[0.16em] text-muted-foreground uppercase'
			: 'text-[13px] font-medium text-foreground'}>{label}</label
	>
	<div class="relative">
		<select
			id="s-{uid}"
			bind:value
			aria-invalid={error ? 'true' : undefined}
			aria-describedby={error ? `s-${uid}-err` : undefined}
			class="w-full appearance-none rounded-md border bg-card pr-9 text-foreground outline-none
				transition-[border-color,box-shadow] duration-150 focus:border-ring focus:ring-3 focus:ring-ring/20
				{tone === 'site' ? 'h-12 px-4 text-base' : 'h-9 px-3 text-sm'}
				{error ? 'border-destructive' : 'border-input'}"
		>
			{#if placeholder}<option value="" disabled>{placeholder}</option>{/if}
			{#each normalized as o (o.value)}
				<option value={o.value}>{o.label}</option>
			{/each}
		</select>
		<ChevronDown class="pointer-events-none absolute top-1/2 right-3 size-4 -translate-y-1/2 text-muted-foreground" />
	</div>
	{#if error}<p id="s-{uid}-err" class="text-[13px] text-destructive">{error}</p>{/if}
</div>
