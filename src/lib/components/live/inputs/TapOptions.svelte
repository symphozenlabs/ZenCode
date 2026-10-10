<script lang="ts">
	import { Check, X } from '@lucide/svelte';
	import type { PublicSlide } from '$lib/live/slides';
	import type { ResponseValue } from '$lib/live/types';
	import { DUR, rise } from '$lib/live/motion';
	import Button from '$lib/components/ui/Button.svelte';

	/**
	 * Phone input: tap one option (or several, then submit). Used by every
	 * tap slide — select answer, polls, this-or-that, traffic lights, truth/lie.
	 */
	interface Props {
		slide: PublicSlide;
		answer: ResponseValue | null;
		correctIds?: string[] | null;
		disabled?: boolean;
		onsubmit: (value: ResponseValue) => void;
	}
	let { slide, answer, correctIds = null, disabled = false, onsubmit }: Props = $props();

	let picked = $state<string[]>([]);
	const chosen = $derived(answer?.input === 'tap' ? answer.ids : picked);
	const locked = $derived(!!answer || disabled);
	const letter = (i: number) => String.fromCharCode(65 + i);
	const LIGHT: Record<string, string> = { green: 'var(--color-green-500)', yellow: 'var(--color-sun)', red: 'var(--color-wrong)' };
	const special = $derived(!slide.multi && ['traffic_lights', 'this_or_that', 'truth_or_lie'].includes(slide.kind));

	function tap(id: string) {
		if (locked) return;
		if (!slide.multi) return onsubmit({ input: 'tap', ids: [id] });
		picked = picked.includes(id) ? picked.filter((x) => x !== id) : [...picked, id];
	}
</script>

{#if special}
	<!-- Big, kind-specific targets: lamps, two halves, two cards -->
	<ul
		class="grid gap-3 {slide.kind === 'traffic_lights' ? 'grid-cols-1' : 'grid-cols-2'}"
		aria-label="Options"
	>
		{#each slide.options as o, i (o.id)}
			{@const isChosen = chosen.includes(o.id)}
			{@const isCorrect = correctIds?.includes(o.id)}
			{@const color =
				slide.kind === 'traffic_lights'
					? LIGHT[o.id]
					: slide.kind === 'truth_or_lie'
						? o.id === 'true'
							? 'var(--color-green-500)'
							: 'var(--color-wrong)'
						: i === 0
							? 'var(--color-green-500)'
							: 'var(--color-chart-4)'}
			<li in:rise={{ y: 16, duration: DUR.layout, delay: i * 70 }}>
				<button
					type="button"
					onclick={() => tap(o.id)}
					aria-pressed={isChosen}
					disabled={locked && !isChosen && !isCorrect}
					class="relative flex w-full items-center gap-4 overflow-hidden rounded-2xl border-2 p-4 text-left transition-[transform,opacity,border-color] duration-200 ease-out-quart select-none active:scale-[0.96]
						{slide.kind === 'traffic_lights' ? 'min-h-20' : 'min-h-44 flex-col justify-center text-center'}
						{isChosen || isCorrect ? 'scale-[1.02]' : ''}
						{locked && !isChosen && !isCorrect ? 'opacity-40' : ''}"
					style:border-color={isChosen || isCorrect ? color : 'transparent'}
					style:background="color-mix(in srgb, {color} {isChosen || isCorrect ? 26 : 12}%, var(--color-card))"
				>
					{#if slide.kind === 'traffic_lights'}
						<span class="size-12 shrink-0 rounded-full shadow-inner" style:background={color} style:box-shadow={isChosen ? `0 0 24px ${color}` : 'none'}></span>
					{:else if slide.kind === 'truth_or_lie'}
						<span class="grid size-14 place-items-center rounded-full text-white" style:background={color}>
							{#if o.id === 'true'}<Check class="size-7" strokeWidth={3} />{:else}<X class="size-7" strokeWidth={3} />{/if}
						</span>
					{/if}
					<span class="text-xl leading-snug font-semibold wrap-break-word text-forest-950">{o.text}</span>
					{#if isCorrect}
						<span class="inline-flex items-center gap-1 text-[13px] font-semibold text-correct"><Check class="size-4" /> Correct</span>
					{:else if isChosen}
						<span class="text-[13px] font-semibold text-forest-700">Your pick</span>
					{/if}
				</button>
			</li>
		{/each}
	</ul>
	{#if slide.kind === 'this_or_that'}
		<p class="mt-3 text-center font-display text-sm font-bold tracking-[0.3em] text-muted-foreground">THIS · OR · THAT</p>
	{/if}
{:else}
<div class="flex flex-col gap-3">
	{#if slide.multi && !answer}
		<p class="text-[13px] font-medium text-muted-foreground">Choose all that apply</p>
	{/if}
	<ul class="flex flex-col gap-2.5" aria-label="Options">
		{#each slide.options as o, i (o.id)}
			{@const isChosen = chosen.includes(o.id)}
			{@const isCorrect = correctIds?.includes(o.id)}
			{@const revealed = !!correctIds}
			<li in:rise={{ y: 12, duration: DUR.layout, delay: i * 45 }}>
				<button
					type="button"
					onclick={() => tap(o.id)}
					aria-pressed={isChosen}
					disabled={locked && !isChosen && !isCorrect}
					class="group relative flex min-h-16 w-full items-center gap-3 rounded-lg border-2 bg-card px-3 py-3 text-left transition-[transform,opacity,border-color,background-color] duration-150 ease-out-quart select-none
						active:scale-[0.97] disabled:active:scale-100
						{revealed && isCorrect
						? 'border-correct bg-green-100'
						: revealed && isChosen
							? 'border-wrong/60'
							: isChosen
								? 'border-brand bg-green-100'
								: 'border-transparent shadow-sm ring-1 ring-border'}
						{locked && !isChosen && !isCorrect ? 'opacity-45' : ''}"
				>
					<span
						class="grid size-10 shrink-0 place-items-center rounded-md font-mono text-sm font-semibold text-forest-950"
						style:background="color-mix(in srgb, var(--color-chart-{(i % 6) + 1}) 45%, transparent)"
						aria-hidden="true">{letter(i)}</span
					>
					<span class="min-w-0 flex-1 text-base leading-snug font-medium wrap-break-word text-foreground">{o.text}</span>
					{#if revealed && isCorrect}
						<span class="inline-flex shrink-0 items-center gap-1 text-[13px] font-semibold text-correct"><Check class="size-4" /> Correct</span>
					{:else if revealed && isChosen}
						<span class="inline-flex shrink-0 items-center gap-1 text-[13px] font-semibold text-wrong"><X class="size-4" /> Your pick</span>
					{:else if isChosen}
						<span class="grid size-6 shrink-0 place-items-center rounded-full bg-brand text-white" aria-label="Selected"><Check class="size-3.5" /></span>
					{/if}
				</button>
			</li>
		{/each}
	</ul>
	{#if slide.multi && !answer && !disabled}
		<div class="sticky bottom-[calc(env(safe-area-inset-bottom)+4.5rem)] pt-2">
			<Button size="xl" class="w-full" disabled={!picked.length} onclick={() => onsubmit({ input: 'tap', ids: picked })}>
				Submit {picked.length ? `(${picked.length})` : ''}
			</Button>
		</div>
	{/if}
</div>
{/if}
