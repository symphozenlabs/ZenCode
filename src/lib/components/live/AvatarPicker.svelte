<script lang="ts">
	import { AVATARS } from '$lib/live/avatars';
	import Avatar from './Avatar.svelte';

	/** 4-column avatar grid as a radio group (arrow keys move the choice). */
	let { value = $bindable() }: { value: string } = $props();
	const COLS = 4;

	function onkeydown(e: KeyboardEvent) {
		const i = AVATARS.findIndex((a) => a.id === value);
		const step = { ArrowRight: 1, ArrowLeft: -1, ArrowDown: COLS, ArrowUp: -COLS }[e.key];
		if (!step) return;
		e.preventDefault();
		const next = AVATARS[(i + step + AVATARS.length) % AVATARS.length];
		value = next.id;
		(e.currentTarget as HTMLElement).querySelector<HTMLElement>(`[data-avatar="${next.id}"]`)?.focus();
	}
</script>

<div role="radiogroup" aria-label="Avatar" tabindex="-1" class="grid grid-cols-4 gap-2.5" {onkeydown}>
	{#each AVATARS as a (a.id)}
		{@const selected = a.id === value}
		<button
			type="button"
			role="radio"
			aria-checked={selected}
			aria-label={a.label}
			tabindex={selected ? 0 : -1}
			data-avatar={a.id}
			onclick={() => (value = a.id)}
			class="grid aspect-square place-items-center rounded-lg border-2 bg-card transition-[border-color,transform,box-shadow] duration-200 ease-spring active:scale-95
				{selected ? 'scale-[1.04] border-brand shadow-md' : 'border-transparent'}"
		>
			<Avatar avatar={a.id} class="size-[min(14vw,3.5rem)] text-[min(7.5vw,1.9rem)]" />
		</button>
	{/each}
</div>
