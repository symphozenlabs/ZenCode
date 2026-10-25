<script lang="ts">
	import { Pencil, Eraser, PaintBucket, Undo2, Trash2 } from '@lucide/svelte';
	import { BRUSHES, PALETTE } from '$lib/games/scribble/types';
	import type { Tool } from './ScribbleCanvas.svelte';

	interface Props {
		color: number;
		brush: number;
		tool: Tool;
		canUndo?: boolean;
		onundo: () => void;
		onclear: () => void;
	}
	let { color = $bindable(), brush = $bindable(), tool = $bindable(), canUndo = true, onundo, onclear }: Props = $props();

	const NAMES = ['Black', 'White', 'Grey', 'Red', 'Orange', 'Yellow', 'Lime', 'Green', 'Sky blue', 'Blue', 'Purple', 'Pink', 'Brown', 'Peach'];
	const TOOLS = [
		{ id: 'brush', label: 'Pen', icon: Pencil },
		{ id: 'eraser', label: 'Eraser', icon: Eraser },
		{ id: 'fill', label: 'Fill', icon: PaintBucket }
	] as const;

	function pickColor(i: number) {
		color = i;
		if (tool === 'eraser') tool = 'brush';
	}
</script>

<div class="mx-auto flex w-full max-w-md flex-col gap-2">
	<div class="grid grid-cols-7 gap-1.5" role="radiogroup" aria-label="Colour">
		{#each PALETTE as hex, i (hex)}
			{@const active = color === i && tool !== 'eraser'}
			<button
				type="button"
				role="radio"
				aria-checked={active}
				aria-label={NAMES[i]}
				onclick={() => pickColor(i)}
				class="aspect-square w-full rounded-lg border transition-transform duration-100 active:scale-90
					{active ? 'scale-110 border-sun ring-2 ring-sun ring-offset-2 ring-offset-stage' : 'border-white/20 hover:scale-105'}"
				style:background={hex}
			></button>
		{/each}
	</div>

	<div class="flex flex-wrap items-center gap-1.5">
		<div class="flex gap-1 rounded-xl bg-white/5 p-1" role="radiogroup" aria-label="Tool">
			{#each TOOLS as t (t.id)}
				<button
					type="button"
					role="radio"
					aria-checked={tool === t.id}
					aria-label={t.label}
					title={t.label}
					onclick={() => (tool = t.id)}
					class="grid size-10 place-items-center rounded-lg transition-colors duration-150 {tool === t.id ? 'bg-sun text-forest-950' : 'text-cream/80 hover:bg-white/10'}"
				>
					<t.icon class="size-5" />
				</button>
			{/each}
		</div>

		<div class="flex gap-1 rounded-xl bg-white/5 p-1" role="radiogroup" aria-label="Brush size">
			{#each BRUSHES as size, i (size)}
				<button
					type="button"
					role="radio"
					aria-checked={brush === i}
					aria-label="Size {i + 1}"
					onclick={() => (brush = i)}
					class="grid size-10 place-items-center rounded-lg transition-colors duration-150 {brush === i ? 'bg-white/20' : 'hover:bg-white/10'}"
				>
					<span
						class="rounded-full"
						style:width="{Math.max(4, size / 1.6)}px"
						style:height="{Math.max(4, size / 1.6)}px"
						style:background={tool === 'eraser' ? '#ffffff' : PALETTE[color]}
						style:box-shadow="0 0 0 1px rgba(255,255,255,.35)"
					></span>
				</button>
			{/each}
		</div>

		<div class="ml-auto flex gap-1">
			<button
				type="button"
				onclick={onundo}
				disabled={!canUndo}
				class="grid size-10 place-items-center rounded-lg bg-white/5 text-cream/85 transition-colors hover:bg-white/10 disabled:opacity-35"
				aria-label="Undo"
				title="Undo"><Undo2 class="size-5" /></button
			>
			<button
				type="button"
				onclick={onclear}
				disabled={!canUndo}
				class="grid size-10 place-items-center rounded-lg bg-white/5 text-cream/85 transition-colors hover:bg-attention/20 hover:text-attention disabled:opacity-35"
				aria-label="Clear the canvas"
				title="Clear"><Trash2 class="size-5" /></button
			>
		</div>
	</div>
</div>
