<script lang="ts" module>
	/** The shape of a rooms-based tournament, as the organiser set it. */
	export interface RoomsShape {
		maxPlayers: number;
		stages: number;
		roomSize: number;
		advance: number;
	}
</script>

<script lang="ts">
	import { untrack } from 'svelte';
	import { describeSizes, maxParticipants, planStages, solveShape, type AllocationLimits, type ShapeKey, type Stage } from '$lib/games/word-heist/allocation';
	import Field from '$lib/components/ui/Field.svelte';
	import SelectField from '$lib/components/ui/SelectField.svelte';

	/**
	 * Rules for a rooms-based tournament (Word Heist, Scribble Showdown):
	 * participants, stages, players per room and how many go through from
	 * each room. A box the organiser sets is locked and stays as set (× frees
	 * it); the others are worked out to fit. If the locked boxes can't work
	 * together the form says which, instead of changing them.
	 */
	interface Props {
		limits: AllocationLimits;
		defaults: RoomsShape;
		/** The shape when it works, else null. */
		rules?: RoomsShape | null;
		/** Why it doesn't work ('' when fine). */
		problem?: string;
		/** The room size as currently typed (valid or not), for forms that depend on it. */
		roomSize?: number;
		/** What a room is called in this game. */
		roomNoun?: string;
	}
	let { limits, defaults, rules = $bindable(null), problem = $bindable(''), roomSize = $bindable(defaults.roomSize), roomNoun = 'room' }: Props = $props();

	// The defaults only seed the form; after that the organiser's boxes are the truth.
	const seed = untrack(() => defaults);
	let form = $state({ participants: String(seed.maxPlayers), stages: String(seed.stages), roomSize: String(seed.roomSize), advance: String(seed.advance) });
	let locked = $state<ShapeKey[]>([]);
	let shapeProblem = $state('');
	const range = (lo: number, hi: number) => Array.from({ length: Math.max(0, hi - lo + 1) }, (_, i) => lo + i);
	const num = (k: ShapeKey) => Number(form[k === 'participants' ? 'participants' : k]);

	function solve() {
		const current = { participants: num('participants'), stages: num('stages'), roomSize: num('roomSize'), advance: num('advance') };
		if (Object.values(current).some((v) => !Number.isInteger(v))) return;
		const out = solveShape(current, new Set(locked), limits);
		if (typeof out === 'string') {
			shapeProblem = out;
			return;
		}
		shapeProblem = '';
		Object.assign(form, { participants: String(out.participants), stages: String(out.stages), roomSize: String(out.roomSize), advance: String(out.advance) });
	}
	function onShape(key: ShapeKey, value: string) {
		form[key] = value;
		if (!locked.includes(key)) locked = [...locked, key];
		solve();
	}
	function unlock(key: ShapeKey) {
		locked = locked.filter((k) => k !== key);
		solve();
	}

	const plan = $derived<Stage[] | string>(planStages(num('participants'), num('stages'), num('advance'), num('roomSize'), limits));
	const most = $derived(maxParticipants(num('stages'), num('advance'), num('roomSize'), limits));
	const error = $derived.by(() => {
		if (shapeProblem) return shapeProblem;
		if (!/^\d+$/.test(form.participants.trim())) return 'Enter the number of participants.';
		if (num('participants') > limits.maxPlayers) return `At most ${limits.maxPlayers} participants.`;
		return typeof plan === 'string' ? plan : '';
	});
	$effect(() => {
		problem = error;
		roomSize = num('roomSize');
		rules = error ? null : { maxPlayers: num('participants'), stages: num('stages'), roomSize: num('roomSize'), advance: num('advance') };
	});
</script>

<div class="space-y-4">
	<p class="text-[13px] text-muted-foreground">
		A box you set is highlighted and stays as you set it (× to free it); the others are worked out to fit. If what you set can't work together, you'll be told which to change.
	</p>
	<div class="grid gap-3 sm:grid-cols-2">
		<Field
			label="Participants"
			type="number"
			inputmode="numeric"
			min="2"
			max={limits.maxPlayers}
			bind:value={form.participants}
			onchange={(e) => onShape('participants', e.currentTarget.value)}
			locked={locked.includes('participants')}
			onunlock={() => unlock('participants')}
		/>
		<SelectField label="Stages" bind:value={form.stages} options={range(2, limits.maxStages).map(String)} onchange={(v) => onShape('stages', v)} locked={locked.includes('stages')} onunlock={() => unlock('stages')} />
		<SelectField label="Players per {roomNoun} (most)" bind:value={form.roomSize} options={range(limits.roomMin, limits.roomMax).map(String)} onchange={(v) => onShape('roomSize', v)} locked={locked.includes('roomSize')} onunlock={() => unlock('roomSize')} />
		<SelectField label="Go through per {roomNoun}" bind:value={form.advance} options={range(1, num('roomSize') - 1).map(String)} onchange={(v) => onShape('advance', v)} locked={locked.includes('advance')} onunlock={() => unlock('advance')} />
	</div>
	{#if error}
		<p class="text-[13px] text-destructive" role="alert">{error}</p>
	{:else}
		<p class="text-[13px] text-muted-foreground">
			{#if most}
				Up to <button type="button" class="font-semibold text-foreground underline-offset-4 hover:underline tabular" onclick={() => onShape('participants', String(most))}>{most} participants</button> for
				{form.stages} stages, {roomNoun}s of up to {form.roomSize}, {form.advance} going through from each {roomNoun}.
			{:else}
				{form.stages} stages can't work with {form.advance} going through from each {roomNoun} — send fewer through.
			{/if}
		</p>
	{/if}
	{#if typeof plan !== 'string'}
		<ol class="space-y-1 rounded-md bg-muted px-3 py-2 text-[13px] text-muted-foreground" aria-label="Stages">
			{#each plan as st (st.stage)}
				<li>
					<span class="font-semibold text-foreground">{st.final ? 'Final' : `Stage ${st.stage}`}:</span>
					<span class="tabular">{st.players} players · {describeSizes(st.sizes).replaceAll('room', roomNoun)}</span>{st.final ? ' · top 3 on the podium' : ` · top ${st.advance} from each ${roomNoun} go through`}
				</li>
			{/each}
		</ol>
	{/if}
</div>
