<script lang="ts">
	import { QUESTIONS_PER_GAME, type WordQuestion } from '$lib/games/tech-word-rush/questions';
	import { WORDS_PER_STAGE } from '$lib/games/tournament/types';
	import Segmented from '$lib/components/live/Segmented.svelte';
	import QuestionSetPicker, { type QuestionMode } from '$lib/components/games/QuestionSetPicker.svelte';

	/**
	 * Tech Word Rush's own settings. A plain game picks its question set; a
	 * tournament stage plays `words` fresh words from the bank (no repeats
	 * across stages), so only the count is asked for.
	 */
	interface Props {
		/** Seconds per word. */
		duration?: number;
		/** Tournament: words per stage. */
		words?: number;
		questionMode?: QuestionMode;
		questions?: WordQuestion[];
		/** Why the settings can't be used yet ('' when fine). */
		problem?: string;
		tournament?: boolean;
	}
	let { duration = $bindable(15), words = $bindable(10), questionMode = $bindable('random'), questions = $bindable([]), problem = $bindable(''), tournament = false }: Props = $props();

	let questionProblem = $state('');
	const wordCount = $derived(tournament ? words : questionMode === 'random' ? QUESTIONS_PER_GAME : questions.length);
	$effect(() => {
		problem = tournament ? '' : questionProblem;
	});
</script>

<div class="space-y-5">
	<Segmented label="Time per word" bind:value={duration} options={[10, 15, 20, 25].map((s) => ({ value: s, label: `${s} sec` }))} />
	{#if tournament}
		<Segmented label="Words per stage" bind:value={words} options={WORDS_PER_STAGE.map((n) => ({ value: n, label: String(n) }))} />
		<p class="text-[13px] text-muted-foreground">Each stage plays a fresh random set from the question bank — no word is repeated in the tournament.</p>
	{:else}
		<QuestionSetPicker bind:mode={questionMode} bind:questions bind:problem={questionProblem} />
	{/if}
	<p class="rounded-md bg-muted px-3 py-2 text-[13px] text-muted-foreground">
		<span class="font-semibold text-foreground tabular">{wordCount}</span> words{tournament ? ' a stage' : ''} ·
		<span class="font-semibold text-foreground tabular">~{Math.ceil((wordCount * duration) / 60)} min</span> answer time · up to
		<span class="font-semibold text-foreground tabular">100 XP</span> per word
	</p>
</div>
