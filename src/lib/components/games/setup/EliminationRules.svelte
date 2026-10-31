<script lang="ts">
	import { planElimination } from '$lib/games/tournament/plan';
	import { DEFAULT_FINALISTS, FINALIST_LIMITS, MAX_PLAYERS, MAX_STAGES, type EliminationRules } from '$lib/games/tournament/types';
	import Field from '$lib/components/ui/Field.svelte';
	import SelectField from '$lib/components/ui/SelectField.svelte';

	/**
	 * Rules for an elimination tournament (whole-room games: everyone plays
	 * each stage together on one screen). Participants, stages and how many
	 * play the final; the cut after each stage is spread evenly between them.
	 */
	interface Props {
		rules?: EliminationRules | null;
		problem?: string;
	}
	let { rules = $bindable(null), problem = $bindable('') }: Props = $props();

	let participants = $state('100');
	let stages = $state('3');
	let finalists = $state(String(DEFAULT_FINALISTS));
	const range = (lo: number, hi: number) => Array.from({ length: hi - lo + 1 }, (_, i) => lo + i);

	const plan = $derived(planElimination(Number(participants), Number(stages), Number(finalists)));
	const error = $derived.by(() => {
		if (!/^\d+$/.test(participants.trim())) return 'Enter the number of participants.';
		if (!/^\d+$/.test(finalists.trim())) return 'Enter how many play the final.';
		return typeof plan === 'string' ? plan : '';
	});
	$effect(() => {
		problem = error;
		rules = error ? null : { format: 'elimination', maxPlayers: Number(participants), stages: Number(stages), finalists: Number(finalists) };
	});
</script>

<div class="space-y-4">
	<p class="text-[13px] text-muted-foreground">
		Everyone still in plays each stage together on the big screen. After each stage the top of the leaderboard goes through; the cut is spread evenly so every stage knocks out a similar share. The final decides the podium.
	</p>
	<div class="grid gap-3 sm:grid-cols-3">
		<Field label="Participants (most)" type="number" inputmode="numeric" min="2" max={MAX_PLAYERS} bind:value={participants} hint="Up to {MAX_PLAYERS}" />
		<SelectField label="Stages" bind:value={stages} options={range(2, MAX_STAGES).map(String)} />
		<Field label="Players in the final" type="number" inputmode="numeric" min={FINALIST_LIMITS[0]} max={FINALIST_LIMITS[1]} bind:value={finalists} hint="{FINALIST_LIMITS[0]}–{FINALIST_LIMITS[1]}" />
	</div>
	{#if error}
		<p class="text-[13px] text-destructive" role="alert">{error}</p>
	{:else if typeof plan !== 'string'}
		<ol class="space-y-1 rounded-md bg-muted px-3 py-2 text-[13px] text-muted-foreground" aria-label="Stages">
			{#each plan as st (st.stage)}
				<li>
					<span class="font-semibold text-foreground">{st.final ? 'Final' : `Stage ${st.stage}`}:</span>
					<span class="tabular">{st.players} players</span>{st.final ? ' · top 3 on the podium' : ` · top ${st.advance} go through`}
				</li>
			{/each}
		</ol>
	{/if}
</div>
