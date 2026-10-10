<script lang="ts" generics="T extends string | number | boolean">
	/** Radio group styled as a segmented control; arrow keys move the choice. */
	interface Props {
		label: string;
		value: T;
		options: readonly { value: T; label: string }[];
		hideLabel?: boolean;
	}
	let { label, value = $bindable(), options, hideLabel = false }: Props = $props();
	const uid = $props.id();

	function onkeydown(e: KeyboardEvent) {
		const i = options.findIndex((o) => o.value === value);
		const d = e.key === 'ArrowRight' || e.key === 'ArrowDown' ? 1 : e.key === 'ArrowLeft' || e.key === 'ArrowUp' ? -1 : 0;
		if (!d) return;
		e.preventDefault();
		const next = options[(i + d + options.length) % options.length];
		value = next.value;
		(e.currentTarget as HTMLElement).querySelector<HTMLElement>(`[data-value="${String(next.value)}"]`)?.focus();
	}
</script>

<div class="flex flex-col gap-1.5">
	<span id="seg-{uid}" class="text-[13px] font-medium text-foreground {hideLabel ? 'sr-only' : ''}">{label}</span>
	<div role="radiogroup" aria-labelledby="seg-{uid}" tabindex="-1" class="inline-flex w-fit rounded-md bg-muted p-0.5" {onkeydown}>
		{#each options as o (o.value)}
			{@const active = o.value === value}
			<button
				type="button"
				role="radio"
				aria-checked={active}
				tabindex={active ? 0 : -1}
				data-value={String(o.value)}
				onclick={() => (value = o.value)}
				class="h-8 rounded-[calc(var(--radius-md)-2px)] px-3 text-[13px] font-medium whitespace-nowrap transition-[background-color,color,box-shadow] duration-150
					{active ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'}"
			>
				{o.label}
			</button>
		{/each}
	</div>
</div>
