<script lang="ts" module>
	export type QuestionMode = 'random' | 'bank' | 'json';
</script>

<script lang="ts">
	import { collection, onSnapshot } from 'firebase/firestore';
	import { Search, Upload, Download, Check, X, CloudOff } from '@lucide/svelte';
	import { db } from '$lib/firebase/client';
	import { QUESTIONS_COLLECTION } from '$lib/games/tech-word-rush/types';
	import {
		DEFAULT_QUESTIONS,
		MAX_FIXED_QUESTIONS,
		QUESTIONS_PER_GAME,
		parseQuestion,
		parseQuestionSet,
		type WordQuestion
	} from '$lib/games/tech-word-rush/questions';
	import Segmented from '$lib/components/live/Segmented.svelte';
	import Skeleton from '$lib/components/ui/Skeleton.svelte';

	/**
	 * Where a game's words come from. `questions` is the fixed set to play in
	 * order (empty in random mode); `problem` is why it can't be used yet.
	 */
	interface Props {
		mode: QuestionMode;
		questions: WordQuestion[];
		problem: string;
	}
	let { mode = $bindable(), questions = $bindable(), problem = $bindable() }: Props = $props();

	// ── Bank ─────────────────────────────────────────────────────────────
	let bank = $state<WordQuestion[]>([]);
	let bankState = $state<'idle' | 'loading' | 'ready' | 'error'>('idle');
	/** True when the stored bank is empty and the built-in words are shown instead. */
	let builtIn = $state(false);

	// Subscribe the first time the bank tab opens, then keep it: switching
	// tabs back and forth shouldn't reload the list.
	let bankWanted = $state(false);
	$effect(() => {
		if (mode === 'bank') bankWanted = true;
	});
	$effect(() => {
		if (!bankWanted) return;
		bankState = 'loading';
		return onSnapshot(
			collection(db(), QUESTIONS_COLLECTION),
			(snap) => {
				const stored = snap.docs
					.map((d) => parseQuestion(d.id, d.data()))
					.filter((q): q is WordQuestion => typeof q !== 'string')
					.sort((a, b) => a.category.localeCompare(b.category) || a.word.localeCompare(b.word));
				builtIn = !stored.length;
				bank = builtIn ? DEFAULT_QUESTIONS : stored;
				bankState = 'ready';
			},
			() => (bankState = 'error')
		);
	});

	let search = $state('');
	/** Selected question ids, in the order they were ticked (= play order). */
	let picked = $state<string[]>([]);
	const shown = $derived(
		bank.filter((q) => !search.trim() || `${q.word} ${q.category} ${q.description}`.toLowerCase().includes(search.trim().toLowerCase()))
	);
	const byId = $derived(new Map(bank.map((q) => [q.id, q])));
	const orderOf = $derived(new Map(picked.map((id, i) => [id, i])));

	function toggle(id: string) {
		if (picked.includes(id)) picked = picked.filter((p) => p !== id);
		else if (picked.length < MAX_FIXED_QUESTIONS) picked = [...picked, id];
	}
	function selectShown() {
		const add = shown.map((q) => q.id).filter((id) => !picked.includes(id));
		picked = [...picked, ...add].slice(0, MAX_FIXED_QUESTIONS);
	}

	// ── JSON upload ──────────────────────────────────────────────────────
	let fileName = $state('');
	let uploaded = $state<WordQuestion[]>([]);
	let uploadErrors = $state<string[]>([]);

	async function onFile(e: Event) {
		const input = e.currentTarget as HTMLInputElement;
		const file = input.files?.[0];
		input.value = ''; // picking the same file again re-reads it
		if (!file) return;
		fileName = file.name;
		uploaded = [];
		if (file.size > 512 * 1024) {
			uploadErrors = ['That file is too large. Keep it under 512 KB.'];
			return;
		}
		let raw: unknown;
		try {
			raw = JSON.parse(await file.text());
		} catch {
			uploadErrors = ['This is not valid JSON. Check for missing commas or quotes.'];
			return;
		}
		const { questions: parsed, errors } = parseQuestionSet(raw);
		uploadErrors = errors;
		uploaded = errors.length ? [] : parsed;
	}

	function downloadTemplate() {
		const sample = [
			{ word: 'KERNEL', description: 'The core of an operating system that manages memory, processes and hardware.', category: 'Operating Systems', difficulty: 'medium' },
			{ word: 'CACHE', description: 'Small, fast memory that keeps recently used data close to the processor.', category: 'Computer Fundamentals', difficulty: 'easy' }
		];
		const url = URL.createObjectURL(new Blob([JSON.stringify(sample, null, 2)], { type: 'application/json' }));
		const a = Object.assign(document.createElement('a'), { href: url, download: 'tech-word-rush-questions.json' });
		a.click();
		URL.revokeObjectURL(url);
	}

	// ── Result ───────────────────────────────────────────────────────────
	$effect(() => {
		if (mode === 'random') {
			questions = [];
			problem = '';
		} else if (mode === 'bank') {
			questions = picked.map((id) => byId.get(id)).filter((q): q is WordQuestion => !!q);
			problem = questions.length ? '' : 'Tick the questions to play.';
		} else {
			questions = uploaded;
			problem = uploaded.length ? '' : uploadErrors.length ? 'Fix the file and upload it again.' : 'Upload a JSON file of questions.';
		}
	});

	const difficultyCls = { easy: 'text-emerald-700', medium: 'text-amber-700', hard: 'text-red-700' } as const;
</script>

<div class="space-y-3">
	<Segmented
		label="Questions"
		bind:value={mode}
		options={[
			{ value: 'random', label: `Random ${QUESTIONS_PER_GAME}` },
			{ value: 'bank', label: 'Pick from bank' },
			{ value: 'json', label: 'Upload JSON' }
		]}
	/>

	{#if mode === 'random'}
		<p class="text-[13px] text-muted-foreground">
			{QUESTIONS_PER_GAME} words are picked at random from the question bank and ordered easy to hard.
		</p>
	{:else if mode === 'bank'}
		<div class="rounded-lg border border-border">
			<div class="flex flex-wrap items-center gap-2 border-b border-border p-2">
				<label class="relative min-w-40 flex-1">
					<span class="sr-only">Search questions</span>
					<Search class="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
					<input
						bind:value={search}
						placeholder="Search words or clues"
						class="h-8 w-full rounded-md border border-input bg-card pr-2 pl-8 text-sm outline-none focus:border-ring focus:ring-4 focus:ring-ring/20"
					/>
				</label>
				<button type="button" class="h-8 rounded-md px-2 text-[13px] font-medium text-brand hover:bg-muted" onclick={selectShown}>Select shown</button>
				<button type="button" class="h-8 rounded-md px-2 text-[13px] font-medium text-muted-foreground hover:bg-muted disabled:opacity-50" disabled={!picked.length} onclick={() => (picked = [])}>Clear</button>
			</div>
			{#if bankState === 'loading' || bankState === 'idle'}
				<div class="space-y-2 p-3">{#each Array(4) as _, i (i)}<Skeleton class="h-9 w-full" />{/each}</div>
			{:else if bankState === 'error'}
				<p class="flex items-center gap-2 p-4 text-sm text-destructive"><CloudOff class="size-4" /> Unable to load the question bank.</p>
			{:else}
				<!-- overscroll-contain: scrolling the list never drags the dialog with it -->
				<ul class="max-h-56 divide-y divide-border overflow-y-auto overscroll-contain" aria-label="Question bank">
					{#each shown as q (q.id)}
						{@const order = orderOf.get(q.id) ?? -1}
						<li>
							<!-- A real button, not a hidden checkbox: focusing a visually hidden
							     input made the browser scroll the dialog on every tick. -->
							<button
								type="button"
								role="checkbox"
								aria-checked={order >= 0}
								onclick={() => toggle(q.id)}
								class="flex w-full items-start gap-3 px-3 py-2 text-left hover:bg-muted/60 focus-visible:bg-muted/60 focus-visible:outline-none"
							>
								<span
									aria-hidden="true"
									class="mt-0.5 grid size-5 shrink-0 place-items-center rounded border text-[11px] font-semibold tabular
										{order >= 0 ? 'border-brand bg-brand text-white' : 'border-input bg-card'}">{order >= 0 ? order + 1 : ''}</span
								>
								<span class="min-w-0 flex-1">
									<span class="flex items-baseline gap-2">
										<span class="font-mono text-sm font-semibold tracking-wide">{q.word}</span>
										<span class="truncate text-xs text-muted-foreground">{q.category} · <span class={difficultyCls[q.difficulty]}>{q.difficulty}</span></span>
									</span>
									<span class="line-clamp-1 text-xs text-muted-foreground">{q.description}</span>
								</span>
							</button>
						</li>
					{:else}
						<li class="p-4 text-center text-sm text-muted-foreground">No questions match “{search}”.</li>
					{/each}
				</ul>
			{/if}
		</div>
		<p class="text-[13px] text-muted-foreground">
			{#if builtIn}Your bank is empty, so the built-in words are shown. {/if}
			<span class="font-medium text-foreground tabular">{picked.length}</span> selected (max {MAX_FIXED_QUESTIONS}). Played in the order you tick them.
		</p>
	{:else}
		<div class="flex flex-wrap items-center gap-2">
			<label class="inline-flex h-9 cursor-pointer items-center gap-2 rounded-md border border-input bg-card px-3 text-sm font-medium hover:bg-muted focus-within:ring-4 focus-within:ring-ring/20">
				<Upload class="size-4" /> Choose JSON file
				<input type="file" accept=".json,application/json" class="sr-only" onchange={onFile} />
			</label>
			<button type="button" class="inline-flex h-9 items-center gap-1.5 rounded-md px-2 text-[13px] font-medium text-brand hover:bg-muted" onclick={downloadTemplate}>
				<Download class="size-4" /> Download template
			</button>
			{#if fileName}<span class="truncate text-xs text-muted-foreground">{fileName}</span>{/if}
		</div>
		<p class="text-[13px] text-muted-foreground">
			A list of <code class="rounded bg-muted px-1">{'{ "word", "description" }'}</code>, with optional <code class="rounded bg-muted px-1">category</code> and
			<code class="rounded bg-muted px-1">difficulty</code> (easy, medium, hard). Up to {MAX_FIXED_QUESTIONS} words, played in file order.
		</p>
		{#if uploadErrors.length}
			<div class="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-[13px] text-red-900" role="alert">
				<p class="flex items-center gap-1.5 font-medium"><X class="size-4" /> {uploadErrors.length} problem{uploadErrors.length === 1 ? '' : 's'} in the file</p>
				<ul class="mt-1 list-disc space-y-0.5 pl-5">
					{#each uploadErrors.slice(0, 8) as err, i (i)}<li>{err}</li>{/each}
					{#if uploadErrors.length > 8}<li>…and {uploadErrors.length - 8} more</li>{/if}
				</ul>
			</div>
		{:else if uploaded.length}
			<div class="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-[13px] text-emerald-900">
				<p class="flex items-center gap-1.5 font-medium"><Check class="size-4" /> {uploaded.length} questions ready</p>
				<p class="mt-1 line-clamp-2 font-mono text-xs">{uploaded.map((q) => q.word).join(' · ')}</p>
			</div>
		{/if}
	{/if}
</div>
