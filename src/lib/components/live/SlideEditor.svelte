<script lang="ts">
	import { CircleAlert, Info, X, Plus } from '@lucide/svelte';
	import { SLIDE_META, slideIssues, TRAFFIC_LIGHTS } from '$lib/live/slides';
	import { LIMITS, type Slide } from '$lib/live/types';
	import { DUR, rise, softFade } from '$lib/live/motion';
	import { SLIDE_ICONS } from './slide-icons';
	import OptionListEditor from './OptionListEditor.svelte';
	import Segmented from './Segmented.svelte';
	import Toggle from '$lib/components/admin/Toggle.svelte';
	import SelectField from '$lib/components/ui/SelectField.svelte';

	let { slide = $bindable(), index }: { slide: Slide; index: number } = $props();

	const meta = $derived(SLIDE_META[slide.kind]);
	const Icon = $derived(SLIDE_ICONS[slide.kind]);
	const issues = $derived(slideIssues(slide));
	const uid = $props.id();

	let acceptedDraft = $state('');
	function addAccepted() {
		if (slide.kind !== 'type_answer') return;
		const v = acceptedDraft.trim();
		const list = slide.config.accepted.filter((a) => a.trim());
		if (!v || list.length >= LIMITS.maxAccepted || list.some((a) => a.toLowerCase() === v.toLowerCase())) return;
		slide.config.accepted = [...list, v];
		acceptedDraft = '';
	}

	const numberInput =
		'h-9 w-full rounded-md border border-input bg-card px-3 text-sm tabular outline-none transition-[border-color,box-shadow] duration-150 focus:border-ring focus:ring-3 focus:ring-ring/20';
	const label = 'text-[13px] font-medium text-foreground';
</script>

<section class="rounded-lg border border-border bg-card" aria-labelledby="ed-{uid}">
	<header class="flex flex-wrap items-center gap-3 border-b border-border px-5 py-3.5">
		<span class="grid size-8 place-items-center rounded-md bg-secondary text-secondary-foreground"><Icon class="size-4" /></span>
		<div class="min-w-0">
			<h2 id="ed-{uid}" class="text-[15px] font-semibold text-foreground">
				<span class="font-mono text-muted-foreground tabular">{index + 1}.</span>
				{meta.label}
			</h2>
			<p class="text-[13px] text-muted-foreground">{meta.description}</p>
		</div>
		<span
			class="ml-auto inline-flex min-h-6 items-center rounded-md border px-2 text-xs font-medium
				{meta.scored ? 'border-sun/50 bg-sun-light/40 text-forest-900' : 'border-border bg-muted text-muted-foreground'}"
		>
			{meta.scored ? 'Quiz · scored' : 'Question · not scored'}
		</span>
	</header>

	<div class="space-y-6 px-5 py-5">
		{#if slide.kind !== 'qa'}
			<div class="flex flex-col gap-1.5">
				<label for="q-{uid}" class={label}>Question</label>
				<textarea
					id="q-{uid}"
					bind:value={slide.question}
					rows="2"
					maxlength={LIMITS.question}
					placeholder={slide.kind === 'truth_or_lie' ? 'Write a statement the room will judge…' : 'Ask something…'}
					class="w-full resize-none rounded-md border border-input bg-card px-3 py-2.5 text-lg leading-snug font-medium outline-none transition-[border-color,box-shadow] duration-150 placeholder:font-normal placeholder:text-muted-foreground/70 focus:border-ring focus:ring-3 focus:ring-ring/20"
				></textarea>
				<p class="text-right text-xs text-muted-foreground tabular">{slide.question.length}/{LIMITS.question}</p>
			</div>
		{:else}
			<div class="flex flex-col gap-1.5">
				<label for="q-{uid}" class={label}>Prompt <span class="font-normal text-muted-foreground">(optional)</span></label>
				<input id="q-{uid}" bind:value={slide.question} maxlength={LIMITS.question} placeholder="Ask us anything" class={numberInput} />
			</div>
		{/if}

		{#if slide.kind === 'select_answer'}
			<OptionListEditor
				label="Options"
				bind:items={slide.config.options}
				bind:correct={slide.config.correct}
				min={LIMITS.minOptions}
				max={LIMITS.maxOptions}
			/>
		{:else if slide.kind === 'multiple_choice'}
			<OptionListEditor label="Options" bind:items={slide.config.options} min={LIMITS.minOptions} max={LIMITS.maxOptions} />
			<Toggle bind:checked={slide.config.multiple} label="Allow several choices" description="Participants can pick more than one option." />
		{:else if slide.kind === 'this_or_that'}
			<OptionListEditor label="The two sides" bind:items={slide.config.options} min={2} max={2} fixed placeholder={(i) => (i ? 'That' : 'This')} />
		{:else if slide.kind === 'lineup' || slide.kind === 'ranking'}
			<OptionListEditor
				label={slide.kind === 'lineup' ? 'Items, in the correct order' : 'Items to rank'}
				bind:items={slide.config.items}
				min={LIMITS.minOrderItems}
				max={LIMITS.maxOrderItems}
				ordered
				addLabel="Add item"
				placeholder={(i) => `Item ${i + 1}`}
			/>
			<p class="flex gap-2 text-[13px] text-muted-foreground">
				<Info class="mt-0.5 size-4 shrink-0" aria-hidden="true" />
				{slide.kind === 'lineup'
					? 'Phones show these shuffled. Partial credit for items close to their right place.'
					: 'The group result adds up position points for each item.'}
			</p>
		{:else if slide.kind === 'type_answer'}
			<div>
				<p class={label} id="acc-{uid}">Accepted answers</p>
				<p class="text-[13px] text-muted-foreground">Matching ignores capitals and extra spaces.</p>
				<ul class="mt-3 flex flex-wrap gap-2" aria-labelledby="acc-{uid}">
					{#each slide.config.accepted.filter((a) => a.trim()) as answer (answer)}
						<li
							class="inline-flex h-8 items-center gap-1 rounded-md border border-brand/30 bg-green-100 pr-1 pl-3 text-sm text-forest-800"
							in:rise={{ y: 4, duration: DUR.base }}
						>
							{answer}
							<button
								type="button"
								class="grid size-6 place-items-center rounded-md hover:bg-forest-800/10"
								aria-label="Remove {answer}"
								onclick={() => slide.kind === 'type_answer' && (slide.config.accepted = slide.config.accepted.filter((a) => a !== answer))}
								><X class="size-3.5" /></button
							>
						</li>
					{/each}
				</ul>
				<form class="mt-3 flex max-w-md gap-2" onsubmit={(e) => (e.preventDefault(), addAccepted())}>
					<input bind:value={acceptedDraft} maxlength={LIMITS.optionText} placeholder="Type an answer, press Enter" aria-label="New accepted answer" class={numberInput} />
					<button
						type="submit"
						class="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-md border border-input bg-card px-3 text-sm font-medium hover:bg-muted"
						><Plus class="size-4" /> Add</button
					>
				</form>
			</div>
		{:else if slide.kind === 'pick_number' || slide.kind === 'guess_number'}
			<div class="grid grid-cols-2 gap-4 sm:grid-cols-4">
				<div class="flex flex-col gap-1.5"><label for="min-{uid}" class={label}>Minimum</label><input id="min-{uid}" type="number" bind:value={slide.config.min} class={numberInput} /></div>
				<div class="flex flex-col gap-1.5"><label for="max-{uid}" class={label}>Maximum</label><input id="max-{uid}" type="number" bind:value={slide.config.max} class={numberInput} /></div>
				<div class="flex flex-col gap-1.5"><label for="step-{uid}" class={label}>Step</label><input id="step-{uid}" type="number" min="0.001" bind:value={slide.config.step} class={numberInput} /></div>
				{#if slide.kind === 'pick_number'}
					<div class="flex flex-col gap-1.5">
						<label for="ans-{uid}" class={label}>Correct value</label>
						<input id="ans-{uid}" type="number" min={slide.config.min} max={slide.config.max} step={slide.config.step} bind:value={slide.config.correct} class="{numberInput} border-brand/60" />
					</div>
				{:else}
					<div class="flex flex-col gap-1.5">
						<label for="ans-{uid}" class={label}>Actual value <span class="font-normal text-muted-foreground">(optional)</span></label>
						<input id="ans-{uid}" type="number" min={slide.config.min} max={slide.config.max} step={slide.config.step} bind:value={slide.config.answer} class={numberInput} />
					</div>
				{/if}
			</div>
			<p class="flex gap-2 text-[13px] text-muted-foreground">
				<Info class="mt-0.5 size-4 shrink-0" aria-hidden="true" />
				{slide.kind === 'pick_number'
					? 'The closer a guess, the more points it earns.'
					: 'Shows the spread of guesses. If you add the actual value, it is marked on reveal.'}
			</p>
		{:else if slide.kind === 'truth_or_lie'}
			<Segmented
				label="This statement is"
				bind:value={slide.config.isTrue}
				options={[
					{ value: true, label: 'Truth' },
					{ value: false, label: 'Lie' }
				]}
			/>
			<p class="text-[13px] text-muted-foreground">Hidden from phones until you reveal it.</p>
		{:else if slide.kind === 'word_cloud'}
			<Segmented
				label="Entries per person"
				bind:value={slide.config.maxEntries}
				options={[
					{ value: 1, label: 'One' },
					{ value: 2, label: 'Two' },
					{ value: 3, label: 'Three' }
				]}
			/>
		{:else if slide.kind === 'scales'}
			<OptionListEditor
				label="Statements"
				bind:items={slide.config.statements}
				min={1}
				max={LIMITS.maxStatements}
				addLabel="Add statement"
				placeholder={(i) => `Statement ${i + 1}`}
			/>
			<div class="grid grid-cols-2 gap-4 sm:grid-cols-4">
				<div class="flex flex-col gap-1.5"><label for="smin-{uid}" class={label}>From</label><input id="smin-{uid}" type="number" min="0" max="9" bind:value={slide.config.min} class={numberInput} /></div>
				<div class="flex flex-col gap-1.5"><label for="smax-{uid}" class={label}>To</label><input id="smax-{uid}" type="number" min="1" max="10" bind:value={slide.config.max} class={numberInput} /></div>
				<div class="flex flex-col gap-1.5"><label for="sminl-{uid}" class={label}>Low label</label><input id="sminl-{uid}" bind:value={slide.config.minLabel} maxlength="24" class={numberInput} /></div>
				<div class="flex flex-col gap-1.5"><label for="smaxl-{uid}" class={label}>High label</label><input id="smaxl-{uid}" bind:value={slide.config.maxLabel} maxlength="24" class={numberInput} /></div>
			</div>
		{:else if slide.kind === 'traffic_lights'}
			<ul class="flex flex-wrap gap-2">
				{#each TRAFFIC_LIGHTS as t (t.id)}
					<li class="inline-flex h-8 items-center gap-2 rounded-md border border-border bg-muted px-3 text-sm text-foreground">
						<span class="size-2.5 rounded-full {t.id === 'green' ? 'bg-brand' : t.id === 'yellow' ? 'bg-sun' : 'bg-destructive'}" aria-hidden="true"></span>
						{t.text}
					</li>
				{/each}
			</ul>
		{:else if slide.kind === 'open_ended'}
			<p class="flex gap-2 text-[13px] text-muted-foreground"><Info class="mt-0.5 size-4 shrink-0" aria-hidden="true" /> Answers appear as cards on the big screen.</p>
		{:else if slide.kind === 'qa'}
			<p class="flex gap-2 text-[13px] text-muted-foreground">
				<Info class="mt-0.5 size-4 shrink-0" aria-hidden="true" /> Shows the audience question queue. Questions can be sent at any time while Q&amp;A is on in session settings.
			</p>
		{/if}

		{#if meta.scored}
			<div class="grid gap-4 border-t border-border pt-5 sm:grid-cols-2">
				<SelectField label="Time limit" bind:value={() => String(slide.timeLimit), (v) => (slide.timeLimit = Number(v))} options={LIMITS.timeLimits.map((s) => ({ value: String(s), label: s < 60 ? `${s} seconds` : `${s / 60} minute${s > 60 ? 's' : ''}` }))} />
				<SelectField
					label="Points"
					bind:value={() => String(slide.maxPoints), (v) => (slide.maxPoints = Number(v))}
					options={LIMITS.points.map((p) => ({ value: String(p), label: p === 0 ? 'No points' : p === 1000 ? '1000 (standard)' : p === 2000 ? '2000 (double)' : String(p) }))}
				/>
			</div>
		{/if}

		{#if issues.length}
			<ul class="space-y-1 rounded-md bg-sun-light/40 px-3 py-2.5" in:softFade aria-label="Before presenting">
				{#each issues as issue (issue)}
					<li class="flex items-center gap-2 text-[13px] text-forest-900">
						<CircleAlert class="size-4 shrink-0 text-attention" aria-hidden="true" />
						{issue}
					</li>
				{/each}
			</ul>
		{/if}
	</div>
</section>
