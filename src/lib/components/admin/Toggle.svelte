<script lang="ts">
	interface Props {
		checked: boolean;
		label: string;
		description?: string;
	}
	let { checked = $bindable(), label, description }: Props = $props();
	const uid = $props.id();
</script>

<div class="flex items-start justify-between gap-4">
	<div>
		<p id="t-{uid}" class="text-sm font-medium">{label}</p>
		{#if description}<p class="text-[13px] text-muted-foreground">{description}</p>{/if}
	</div>
	<button
		type="button"
		role="switch"
		aria-checked={checked}
		aria-labelledby="t-{uid}"
		onclick={() => (checked = !checked)}
		class="relative h-6 w-11 shrink-0 rounded-full transition-colors duration-200 {checked ? 'bg-primary' : 'bg-input'}"
	>
		<span class="absolute top-0.5 left-0.5 size-5 rounded-full bg-white shadow transition-transform duration-200 {checked ? 'translate-x-5' : ''}"></span>
	</button>
</div>
