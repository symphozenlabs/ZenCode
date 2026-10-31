<script lang="ts">
	import { untrack } from 'svelte';
	import { durationLabel } from '$lib/games/flappy/types';
	import { HEIST_LIMITS, planStages } from '$lib/games/word-heist/allocation';
	import {
		DEFAULT_ROOM_SIZE,
		DEFAULT_RULES,
		FINAL_OPTIONS,
		GAME_RULES,
		PACE_LIMITS,
		ROOM_MAX,
		ROOM_MIN,
		ROUND_SECONDS,
		RULE_LIMITS,
		TILE_BANDS,
		TILE_LIMITS,
		bandTiles,
		formatClock,
		maxTilesFor,
		suggestedTiles,
		tileBand,
		tilePace,
		tilesFor,
		type HeistMode,
		type HeistRules
	} from '$lib/games/word-heist/types';
	import Field from '$lib/components/ui/Field.svelte';
	import SelectField from '$lib/components/ui/SelectField.svelte';
	import RoomsRules, { type RoomsShape } from './RoomsRules.svelte';

	/**
	 * Word Heist's rules: one room (a game) or the tournament shape (rooms and
	 * stages, see RoomsRules), plus the timing every room shares — round
	 * length, tiles, final countdown and the shortest word.
	 */
	interface Props {
		mode: HeistMode;
		/** The rules when they work, else null. */
		rules?: HeistRules | null;
		/** Why they don't work ('' when fine). */
		problem?: string;
	}
	let { mode, rules = $bindable(null), problem = $bindable('') }: Props = $props();

	let gamePlayers = $state(String(DEFAULT_ROOM_SIZE));
	let shape = $state<RoomsShape | null>(null);
	let shapeProblem = $state('');
	let shapeRoomSize = $state(DEFAULT_RULES.roomSize);
	let timing = $state({ roundSeconds: String(DEFAULT_RULES.roundSeconds), finalSeconds: String(DEFAULT_RULES.finalSeconds), tiles: String(DEFAULT_RULES.tileCount), minWordLength: String(DEFAULT_RULES.minWordLength) });

	const roundSeconds = $derived(Number(timing.roundSeconds));
	const finalSeconds = $derived(Number(timing.finalSeconds));
	const tileCount = $derived(Number(timing.tiles));
	/** The room size tiles are set for: the game's players, or a tournament's room size. */
	const fullRoom = $derived(mode === 'game' ? Number(gamePlayers) : shapeRoomSize);
	const pace = $derived(tilePace(roundSeconds, tileCount));
	/** Most tiles a full room can have for this round length. */
	const maxTiles = $derived(maxTilesFor(roundSeconds));
	const range = (lo: number, hi: number) => Array.from({ length: hi - lo + 1 }, (_, i) => lo + i);

	// Tiles not set by the organiser follow the room size and round length.
	let tilesLocked = $state(false);
	function recalcTiles() {
		if (!tilesLocked) timing.tiles = String(suggestedTiles(fullRoom, roundSeconds));
	}
	let tilesSetFor = DEFAULT_RULES.roomSize;
	$effect(() => {
		const size = fullRoom;
		if (size === tilesSetFor || !(size >= ROOM_MIN)) return;
		tilesSetFor = size;
		untrack(recalcTiles);
	});

	const gameError = $derived.by(() => {
		if (mode !== 'game') return '';
		const plan = planStages(fullRoom, 1, 0, fullRoom, HEIST_LIMITS);
		return typeof plan === 'string' ? plan : '';
	});
	const timingError = $derived.by(() => {
		if (!Number.isInteger(tileCount) || tileCount < TILE_LIMITS[0] || tileCount > maxTiles)
			return `Tiles per room: ${TILE_LIMITS[0]}–${maxTiles} for a ${durationLabel(roundSeconds)} round${tileCount > maxTiles ? ' — use fewer tiles or a longer round' : ''}.`;
		if (pace < PACE_LIMITS[0])
			return `${tileCount} tiles in ${durationLabel(roundSeconds)} is a tile every ${pace.toFixed(1)} s — at most ${tilesFor(roundSeconds, PACE_LIMITS[0])} tiles fit (one every ${PACE_LIMITS[0]} s). Use fewer tiles or a longer round.`;
		if (pace > PACE_LIMITS[1])
			return `${tileCount} tiles in ${durationLabel(roundSeconds)} is a tile every ${pace.toFixed(1)} s — use at least ${tilesFor(roundSeconds, PACE_LIMITS[1])} tiles or a shorter round.`;
		return '';
	});
	/** What each room-size band gets, from the full room's band down. */
	const tileBands = $derived(
		Array.from({ length: tileBand(fullRoom) }, (_, i) => {
			const band = tileBand(fullRoom) - i;
			const low = band === 1 ? ROOM_MIN : TILE_BANDS[band - 2] + 1;
			const high = Math.min(TILE_BANDS[band - 1], fullRoom);
			const count = bandTiles(high, fullRoom, tileCount);
			return { label: low === high ? `${low}` : `${low}–${high}`, count, pace: tilePace(roundSeconds, count) };
		})
	);

	const error = $derived((mode === 'game' ? gameError : shapeProblem) || timingError);
	const built = $derived<HeistRules | null>(
		mode === 'game'
			? { ...GAME_RULES, roundSeconds, finalSeconds, tileCount, minWordLength: Number(timing.minWordLength), maxPlayers: fullRoom, roomSize: fullRoom }
			: shape && { mode: 'tournament', roundSeconds, finalSeconds, tileCount, minWordLength: Number(timing.minWordLength), stages: shape.stages, advance: shape.advance, maxPlayers: shape.maxPlayers, roomSize: shape.roomSize }
	);
	$effect(() => {
		problem = error || (built ? '' : 'Set the tournament shape.');
		rules = error ? null : built;
	});
</script>

<div class="space-y-4">
	{#if mode === 'game'}
		<p class="text-[13px] text-muted-foreground">One room, one round, {ROOM_MIN}–{ROOM_MAX} players. The top three make the podium.</p>
		<SelectField label="Players (most)" bind:value={gamePlayers} options={range(ROOM_MIN, ROOM_MAX).map(String)} />
		{#if gameError}<p class="text-[13px] text-destructive" role="alert">{gameError}</p>{/if}
	{:else}
		<RoomsRules limits={HEIST_LIMITS} defaults={{ maxPlayers: DEFAULT_RULES.maxPlayers, stages: DEFAULT_RULES.stages, roomSize: DEFAULT_RULES.roomSize, advance: DEFAULT_RULES.advance }} bind:rules={shape} bind:problem={shapeProblem} bind:roomSize={shapeRoomSize} />
	{/if}

	<div class="grid gap-3 sm:grid-cols-3">
		<SelectField
			label="Round length"
			bind:value={timing.roundSeconds}
			options={ROUND_SECONDS.map((s) => ({ value: String(s), label: durationLabel(s) }))}
			onchange={(v) => ((timing.roundSeconds = v), recalcTiles())}
		/>
		<Field
			label="Tiles per room"
			type="number"
			inputmode="numeric"
			min={TILE_LIMITS[0]}
			max={maxTiles}
			hint="For a full room of {fullRoom} · up to {maxTiles}"
			bind:value={timing.tiles}
			onchange={(e) => ((timing.tiles = e.currentTarget.value), (tilesLocked = true))}
			locked={tilesLocked}
			onunlock={() => ((tilesLocked = false), recalcTiles())}
		/>
		<div class="flex flex-col gap-1.5">
			<span class="text-[13px] font-medium text-foreground">New tile every</span>
			<output class="flex h-9 items-center rounded-md border border-dashed border-input bg-muted/60 px-3 text-sm text-foreground tabular" aria-live="polite">
				{Number.isFinite(pace) && pace > 0 ? `${pace.toFixed(1)} s` : '—'}
			</output>
			<span class="text-[13px] text-muted-foreground">Worked out from the two boxes</span>
		</div>
	</div>
	{#if timingError}
		<p class="text-[13px] text-destructive" role="alert">{timingError}</p>
	{:else}
		<p class="text-[13px] text-muted-foreground">
			Tiles drop for <span class="font-medium text-foreground">{durationLabel(roundSeconds)}</span>, then a {finalSeconds} s final countdown —
			<span class="font-medium text-foreground tabular">{formatClock((roundSeconds + finalSeconds) * 1000)}</span> a round in all.
			{#each tileBands as b, i (b.label)}{i ? ' · ' : 'Rooms of '}<span class="font-medium text-foreground tabular">{b.label}</span>:
				<span class="tabular">{b.count} tiles ({b.pace.toFixed(1)} s)</span>{/each}.
		</p>
	{/if}
	<div class="grid gap-3 sm:grid-cols-2">
		<SelectField
			label="Final countdown"
			bind:value={timing.finalSeconds}
			options={FINAL_OPTIONS.map((s) => ({ value: String(s), label: s ? `${s} seconds, no new tiles` : 'None — end with the last tile' }))}
		/>
		<SelectField label="Shortest word" bind:value={timing.minWordLength} options={range(...RULE_LIMITS.minWordLength).map(String)} />
	</div>
	<ul class="space-y-1.5 text-[13px] text-muted-foreground">
		<li>• Everyone scans one QR code and starts on 0. Letter tiles drop into a row shared by the room; words can only be made from those tiles.</li>
		<li>• Steal any word by adding at least one tile to it (just adding S to the end doesn't count). Score = letters in the words you hold.</li>
		<li>• Banned words are managed on the Word moderation page.</li>
	</ul>
</div>
