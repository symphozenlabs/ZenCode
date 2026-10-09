<script lang="ts">
	import { flip } from 'svelte/animate';
	import { fly } from 'svelte/transition';
	import { Check, X } from '@lucide/svelte';
	import type { Guess } from '$lib/games/tech-word-rush/engine';

	/**
	 * A player's guesses for one word. No right/wrong is shown until `answer`
	 * arrives; then the correct guess flows up to the top, or — if none match —
	 * every guess sinks.
	 */
	let {
		guesses,
		answer = null,
		max = 3,
		delay = 900
	}: {
		guesses: Guess[];
		answer?: string | null;
		max?: number;
		/** Wait for the answer letters to land before judging. */
		delay?: number;
	} = $props();

	let judged = $state(false);
	$effect(() => {
		if (!answer) {
			judged = false;
			return;
		}
		const t = setTimeout(() => (judged = true), delay);
		return () => clearTimeout(t);
	});

	const hit = $derived(answer ? guesses.find((g) => g.text === answer) : undefined);
	const items = $derived(
		guesses
			.map((g, i) => ({ ...g, n: i + 1 }))
			.sort((a, b) => (judged && hit ? Number(b.text === hit.text) - Number(a.text === hit.text) : 0))
	);
	const allWrong = $derived(judged && !hit && guesses.length > 0);
</script>

<ol class="space-y-2" aria-label="Your guesses" aria-live="polite">
	{#each items as g, i (g.text)}
		{@const correct = judged && g.text === hit?.text}
		{@const wrong = judged && !correct}
		<li
			animate:flip={{ duration: 700 }}
			in:fly={{ y: 10, duration: 240 }}
			style:--i={i}
			class="flex items-center gap-3 rounded-lg border-2 px-4 py-3 transition-colors duration-500
				{correct
				? 'rise border-green-300 bg-green-300/15'
				: wrong
					? 'border-attention/40 bg-attention/5'
					: 'border-stage-line bg-stage-raised'}
				{allWrong ? 'sink' : ''}"
		>
			<span class="w-5 font-mono text-xs text-cream/40">{g.n}</span>
			<span class="min-w-0 flex-1 truncate font-mono text-lg font-bold tracking-[0.12em] {wrong ? 'text-cream/50 line-through decoration-attention/70' : 'text-cream'}">{g.text}</span>
			{#if correct}
				<span class="flex items-center gap-1 font-display font-bold text-green-300"><Check class="size-5" />+{g.reward} XP</span>
			{:else if wrong}
				<X class="size-5 text-attention" aria-label="Wrong" />
			{:else}
				<span class="text-xs text-cream/40">locks {g.reward} XP</span>
			{/if}
		</li>
	{/each}
	{#if !answer}
		{#each Array(Math.max(0, max - guesses.length)) as _, i (i)}
			<li class="flex items-center gap-3 rounded-lg border-2 border-dashed border-stage-line/70 px-4 py-3 text-cream/30">
				<span class="w-5 font-mono text-xs">{guesses.length + i + 1}</span>
				<span class="text-sm">Guess left</span>
			</li>
		{/each}
	{/if}
</ol>

<style>
	.rise {
		animation: rise 900ms cubic-bezier(0.22, 1, 0.36, 1);
		box-shadow: 0 0 40px -12px var(--color-green-300);
	}
	.sink {
		animation: sink 700ms cubic-bezier(0.55, 0, 0.75, 0.2) forwards;
		animation-delay: calc(var(--i) * 140ms);
	}
	@keyframes rise {
		0% {
			transform: translateY(14px) scale(0.98);
		}
		60% {
			transform: translateY(-6px) scale(1.03);
		}
		100% {
			transform: none;
		}
	}
	@keyframes sink {
		to {
			transform: translateY(18px);
			opacity: 0.45;
		}
	}
	@media (prefers-reduced-motion: reduce) {
		.rise,
		.sink {
			animation: none;
		}
	}
</style>
