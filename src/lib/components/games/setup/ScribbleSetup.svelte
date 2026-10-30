<script lang="ts">
	import { DRAW_SECONDS, TURN_COUNTS } from '$lib/games/scribble/types';
	import { PACKS, buildPool, parseCustomWords, type PackId } from '$lib/games/scribble/words';
	import Segmented from '$lib/components/live/Segmented.svelte';

	/** Scribble Showdown's own settings: drawing time, turns and the word pool. In a tournament they apply to every room. */
	interface Props {
		drawSeconds?: number;
		turns?: number;
		packs?: PackId[];
		custom?: string;
		/** Why the settings can't be used yet ('' when fine). */
		problem?: string;
		tournament?: boolean;
	}
	let { drawSeconds = $bindable(80), turns = $bindable(8), packs = $bindable(['everyday', 'tech']), custom = $bindable(''), problem = $bindable(''), tournament = false }: Props = $props();

	const customCount = $derived(parseCustomWords(custom).length);
	const pool = $derived(buildPool(packs, parseCustomWords(custom)).length);
	$effect(() => {
		problem = pool < 10 ? 'Pick a word pack, or add at least 10 words of your own.' : '';
	});

	function togglePack(id: PackId) {
		packs = packs.includes(id) ? packs.filter((p) => p !== id) : [...packs, id];
	}
</script>

<div class="space-y-5">
	<Segmented label="Time to draw" bind:value={drawSeconds} options={DRAW_SECONDS.map((s) => ({ value: s, label: `${s} sec` }))} />
	<Segmented label={tournament ? 'Turns per room' : 'Turns'} bind:value={turns} options={TURN_COUNTS.map((n) => ({ value: n, label: String(n) }))} />
	<fieldset>
		<legend class="text-[13px] font-medium text-foreground">Word packs</legend>
		<div class="mt-1.5 grid gap-2 sm:grid-cols-3">
			{#each PACKS as pack (pack.id)}
				{@const on = packs.includes(pack.id)}
				<label class="flex cursor-pointer items-start gap-2 rounded-md border px-3 py-2 transition-colors {on ? 'border-ring bg-accent' : 'border-border hover:bg-muted'}">
					<input type="checkbox" class="mt-0.5 accent-[var(--color-primary)]" checked={on} onchange={() => togglePack(pack.id)} />
					<span>
						<span class="block text-sm font-medium">{pack.name}</span>
						<span class="block text-xs text-muted-foreground">{pack.description}</span>
					</span>
				</label>
			{/each}
		</div>
	</fieldset>
	<div>
		<label for="custom-words" class="text-[13px] font-medium text-foreground">Your own words <span class="font-normal text-muted-foreground">(optional)</span></label>
		<textarea
			id="custom-words"
			bind:value={custom}
			rows="3"
			placeholder="symba, hackathon trophy, pitch deck…"
			class="mt-1.5 w-full rounded-md border border-input bg-card px-3 py-2 text-sm outline-none focus:border-ring focus:ring-4 focus:ring-ring/20"
		></textarea>
		<p class="mt-1 text-xs text-muted-foreground">Separate with commas or new lines. {customCount ? `${customCount} added.` : ''}</p>
	</div>
	<p class="rounded-md bg-muted px-3 py-2 text-[13px] text-muted-foreground">
		<span class="font-semibold text-foreground tabular">{pool}</span> words ·
		<span class="font-semibold text-foreground tabular">~{Math.ceil((turns * (drawSeconds + 25)) / 60)} min</span>{tournament ? ' a stage' : ''} · {tournament ? 'every room plays the same way' : 'needs 2+ players'}
	</p>
	{#if problem}<p class="text-[13px] text-destructive" role="alert">{problem}</p>{/if}
</div>
