<script lang="ts">
	import { untrack } from 'svelte';
	import { Minus, Plus, Send } from '@lucide/svelte';
	import type { PublicSlide } from '$lib/live/slides';
	import type { ResponseValue } from '$lib/live/types';
	import { DUR, rise } from '$lib/live/motion';
	import Button from '$lib/components/ui/Button.svelte';

	/**
	 * Phone input for number slides. Scales: a row of tappable stops per
	 * statement. Guess / pick a number: a big readout, a slider and steppers.
	 */
	interface Props {
		slide: PublicSlide;
		disabled?: boolean;
		onsubmit: (value: ResponseValue) => void;
	}
	let { slide, disabled = false, onsubmit }: Props = $props();

	const scales = $derived(slide.kind === 'scales');
	const mid = (min: number, max: number, step: number) => min + Math.round((max - min) / 2 / step) * step;
	// Fresh per slide (PlayerLive re-mounts inputs), so the initial slide is enough
	let values = $state<(number | null)[]>(untrack(() => slide).numbers.map((n) => (slide.kind === 'scales' ? null : mid(n.min, n.max, n.step))));
	const ready = $derived(values.every((v) => v != null));

	const decimals = (step: number) => (String(step).split('.')[1] ?? '').length;
	const fmt = (v: number, step: number) => v.toLocaleString('en-IN', { maximumFractionDigits: decimals(step) });
	function nudge(i: number, dir: 1 | -1) {
		const n = slide.numbers[i];
		const v = (values[i] ?? n.min) + dir * n.step;
		values[i] = Number(Math.min(n.max, Math.max(n.min, v)).toFixed(decimals(n.step)));
	}
</script>

<div class="flex flex-col gap-5">
	{#each slide.numbers as n, i (n.id)}
		<div in:rise={{ y: 12, duration: DUR.layout, delay: i * 60 }}>
			{#if scales}
				<p class="mb-2 text-[15px] font-medium text-foreground">{n.label}</p>
				<div class="flex gap-1.5" role="radiogroup" aria-label={n.label}>
					{#each Array.from({ length: n.max - n.min + 1 }, (_, k) => n.min + k) as v (v)}
						{@const on = values[i] === v}
						<button
							type="button"
							role="radio"
							aria-checked={on}
							{disabled}
							onclick={() => (values[i] = v)}
							class="h-12 flex-1 rounded-lg font-display text-lg font-semibold tabular transition-[background-color,color,transform] duration-150 active:scale-95
								{on ? 'bg-brand text-white shadow-md' : 'bg-card text-foreground ring-1 ring-border'}">{v}</button
						>
					{/each}
				</div>
				<div class="mt-1.5 flex justify-between text-xs text-muted-foreground">
					<span>{n.minLabel}</span><span>{n.maxLabel}</span>
				</div>
			{:else}
				{@const v = values[i] ?? n.min}
				<p class="text-center font-display text-6xl font-semibold text-forest-950 tabular">{fmt(v, n.step)}</p>
				<div class="mt-5 flex items-center gap-3">
					<button type="button" class="grid size-12 shrink-0 place-items-center rounded-full bg-card ring-1 ring-border active:scale-95" onclick={() => nudge(i, -1)} aria-label="Less" {disabled}>
						<Minus class="size-5" />
					</button>
					<input
						type="range"
						min={n.min}
						max={n.max}
						step={n.step}
						bind:value={values[i]}
						class="h-10 flex-1 accent-brand"
						aria-label={n.label}
						{disabled}
					/>
					<button type="button" class="grid size-12 shrink-0 place-items-center rounded-full bg-card ring-1 ring-border active:scale-95" onclick={() => nudge(i, 1)} aria-label="More" {disabled}>
						<Plus class="size-5" />
					</button>
				</div>
				<div class="mt-1 flex justify-between px-15 text-xs text-muted-foreground tabular">
					<span>{fmt(n.min, n.step)}</span><span>{fmt(n.max, n.step)}</span>
				</div>
			{/if}
		</div>
	{/each}
	<Button size="xl" class="w-full" disabled={!ready || disabled} onclick={() => onsubmit({ input: 'number', values: values.map((v) => Number(v)) })}>
		<Send class="size-4" /> {scales ? 'Send ratings' : 'Lock it in'}
	</Button>
</div>
