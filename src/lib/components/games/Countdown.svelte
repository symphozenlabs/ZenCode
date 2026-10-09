<script lang="ts">
	import { serverNow } from '$lib/games/tech-word-rush/api';

	interface Props {
		/** Server timestamp (ms) when time runs out. */
		endsAt: number | null;
		/** Full duration in seconds (for the progress indicator). */
		total: number;
		variant?: 'ring' | 'bar';
		onexpire?: () => void;
	}
	let { endsAt, total, variant = 'ring', onexpire }: Props = $props();

	// Remaining time is always derived from the shared endsAt timestamp
	// (corrected for this device's clock offset); the interval only repaints.
	let now = $state(serverNow());
	$effect(() => {
		const end = endsAt;
		if (!end) return;
		let fired = false;
		const tick = () => {
			now = serverNow();
			if (!fired && now >= end) {
				fired = true;
				onexpire?.();
			}
		};
		tick();
		const id = setInterval(tick, 200);
		return () => clearInterval(id);
	});

	const remainingMs = $derived(endsAt ? Math.max(0, endsAt - now) : 0);
	const seconds = $derived(Math.ceil(remainingMs / 1000));
	const fraction = $derived(total > 0 ? Math.min(1, remainingMs / (total * 1000)) : 0);
	const urgent = $derived(endsAt !== null && seconds <= 10);
	const C = 2 * Math.PI * 44;
</script>

{#if variant === 'ring'}
	<div class="relative grid size-full place-items-center [container-type:size]" role="timer" aria-label="{seconds} seconds left">
		<svg viewBox="0 0 100 100" class="absolute inset-0 size-full -rotate-90" aria-hidden="true">
			<circle cx="50" cy="50" r="44" fill="none" stroke="var(--color-stage-line)" stroke-width="6" />
			<circle
				cx="50"
				cy="50"
				r="44"
				fill="none"
				stroke={urgent ? 'var(--color-attention)' : 'var(--color-green-300)'}
				stroke-width="6"
				stroke-linecap="round"
				stroke-dasharray={C}
				stroke-dashoffset={C * (1 - fraction)}
				class="transition-[stroke-dashoffset,stroke] duration-200 ease-linear"
			/>
		</svg>
		<span class="font-display text-[38cqh] leading-none font-bold tabular {urgent ? 'text-attention' : 'text-cream'}">{seconds}</span>
	</div>
{:else}
	<div class="flex items-center gap-3" role="timer" aria-label="{seconds} seconds left">
		<div class="h-1.5 flex-1 overflow-hidden rounded-full bg-stage-line">
			<div
				class="h-full rounded-full transition-[width,background-color] duration-200 ease-linear {urgent ? 'bg-attention' : 'bg-green-300'}"
				style:width="{fraction * 100}%"
			></div>
		</div>
		<span class="w-9 text-right font-mono text-sm font-semibold tabular {urgent ? 'text-attention' : 'text-cream/80'}">{seconds}s</span>
	</div>
{/if}
