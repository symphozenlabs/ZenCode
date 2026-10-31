<script lang="ts">
	import { DURATIONS, durationLabel } from '$lib/games/flappy/types';
	import SelectField from '$lib/components/ui/SelectField.svelte';

	/** Flappy Bird / Soar & Roar settings: how long players may keep flying. */
	interface Props {
		/** Seconds, as a select value. */
		duration?: string;
		tournament?: boolean;
	}
	let { duration = $bindable('180'), tournament = false }: Props = $props();
</script>

<div class="space-y-4">
	<SelectField label={tournament ? 'Flight window per stage' : 'Game length'} bind:value={duration} options={DURATIONS.map((d) => ({ value: String(d), label: durationLabel(d) }))} />
	<ul class="space-y-1.5 text-[13px] text-muted-foreground">
		<li>• Players can practise in the lobby while they wait.</li>
		<li>• Once you start, they fly as many times as they like until time runs out.</li>
		<li>• Only each player’s <span class="font-medium text-foreground">best</span> flight counts — a worse one never lowers their score.</li>
		<li>• The {tournament ? 'stage’s' : 'final'} leaderboard appears when the timer ends.</li>
	</ul>
</div>
