<script lang="ts">
	import { collection, deleteDoc, doc, onSnapshot, setDoc, writeBatch } from 'firebase/firestore';
	import { Plus, Pencil, Trash2, Search, ListChecks, CloudOff, Download, ArrowLeft } from '@lucide/svelte';
	import { db } from '$lib/firebase/client';
	import { QUESTIONS_COLLECTION } from '$lib/games/tech-word-rush/types';
	import {
		CATEGORIES,
		DEFAULT_QUESTIONS,
		DIFFICULTIES,
		QUESTIONS_PER_GAME,
		type Category,
		type Difficulty,
		type WordQuestion
	} from '$lib/games/tech-word-rush/questions';
	import { isValidWord, maskWord } from '$lib/games/tech-word-rush/engine';
	import PageHeader from '$lib/components/admin/PageHeader.svelte';
	import Button from '$lib/components/ui/Button.svelte';
	import Field from '$lib/components/ui/Field.svelte';
	import SelectField from '$lib/components/ui/SelectField.svelte';
	import Modal from '$lib/components/ui/Modal.svelte';
	import Skeleton from '$lib/components/ui/Skeleton.svelte';
	import StateMessage from '$lib/components/ui/StateMessage.svelte';

	let items = $state<WordQuestion[]>([]);
	let status = $state<'loading' | 'ready' | 'error'>('loading');
	let attempt = $state(0);

	$effect(() => {
		attempt;
		status = 'loading';
		return onSnapshot(
			collection(db(), QUESTIONS_COLLECTION),
			(snap) => {
				items = snap.docs
					.map((d) => ({ id: d.id, ...(d.data() as Omit<WordQuestion, 'id'>) }))
					.sort((a, b) => a.category.localeCompare(b.category) || a.word.localeCompare(b.word));
				status = 'ready';
			},
			(err) => {
				console.error('[question-bank]', err);
				status = 'error';
			}
		);
	});

	let search = $state('');
	let category = $state('all');
	const filtered = $derived(
		items.filter(
			(q) =>
				(category === 'all' || q.category === category) &&
				(!search.trim() || `${q.word} ${q.description}`.toLowerCase().includes(search.trim().toLowerCase()))
		)
	);
	const missingDefaults = $derived(DEFAULT_QUESTIONS.filter((d) => !items.some((q) => q.word === d.word)));

	let message = $state<{ text: string; tone: 'ok' | 'error' } | null>(null);

	// Import built-ins
	let importing = $state(false);
	async function importDefaults() {
		importing = true;
		message = null;
		try {
			const batch = writeBatch(db());
			for (const { id, ...q } of missingDefaults) batch.set(doc(db(), QUESTIONS_COLLECTION, id), q);
			const n = missingDefaults.length;
			await batch.commit();
			message = { text: `Added ${n} built-in words.`, tone: 'ok' };
		} catch {
			message = { text: 'Unable to import the built-in words. Please try again.', tone: 'error' };
		} finally {
			importing = false;
		}
	}

	// Editor
	type Draft = { id: string | null; word: string; description: string; category: Category; difficulty: Difficulty };
	let draft = $state<Draft | null>(null);
	let errors = $state<Record<string, string>>({});
	let saving = $state(false);

	const openNew = () => {
		errors = {};
		draft = { id: null, word: '', description: '', category: 'Programming', difficulty: 'medium' };
	};
	const openEdit = (q: WordQuestion) => {
		errors = {};
		draft = { ...q };
	};

	function validate(d: Draft) {
		const e: Record<string, string> = {};
		const word = d.word.trim().toUpperCase();
		const description = d.description.trim();
		if (!isValidWord(word)) e.word = 'Use 3–20 letters A–Z, no spaces or digits.';
		else if (items.some((q) => q.word === word && q.id !== d.id)) e.word = 'This word is already in the bank.';
		if (description.length < 20) e.description = 'Write a clue of at least 20 characters.';
		else if (word && description.toUpperCase().includes(word)) e.description = 'The clue must not contain the answer.';
		return e;
	}

	async function save() {
		if (!draft) return;
		errors = validate(draft);
		if (Object.keys(errors).length) return;
		saving = true;
		const word = draft.word.trim().toUpperCase();
		const id = draft.id ?? `${word.toLowerCase()}-${Date.now().toString(36)}`;
		try {
			await setDoc(doc(db(), QUESTIONS_COLLECTION, id), {
				word,
				description: draft.description.trim(),
				category: draft.category,
				difficulty: draft.difficulty
			});
			message = { text: draft.id ? `Updated ${word}.` : `Added ${word}.`, tone: 'ok' };
			draft = null;
		} catch {
			errors = { form: 'Unable to save the question. Please try again.' };
		} finally {
			saving = false;
		}
	}

	// Delete
	let removing = $state<WordQuestion | null>(null);
	let deleting = $state(false);
	async function confirmDelete() {
		if (!removing) return;
		deleting = true;
		try {
			await deleteDoc(doc(db(), QUESTIONS_COLLECTION, removing.id));
			message = { text: `Deleted ${removing.word}.`, tone: 'ok' };
			removing = null;
		} catch {
			message = { text: 'Unable to delete the question. Please try again.', tone: 'error' };
		} finally {
			deleting = false;
		}
	}

	const difficultyCls: Record<Difficulty, string> = {
		easy: 'border-emerald-200 bg-emerald-50 text-emerald-800',
		medium: 'border-amber-200 bg-amber-50 text-amber-800',
		hard: 'border-red-200 bg-red-50 text-red-800'
	};
	const preview = $derived(draft && isValidWord(draft.word.trim().toUpperCase()) ? maskWord(draft.word.trim().toUpperCase(), []) : null);
</script>

<svelte:head><title>Question bank — ZenCode Admin</title></svelte:head>

<a href="/admin/games" class="mb-3 inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
	<ArrowLeft class="size-4" /> Games
</a>
<PageHeader eyebrow="Tech Word Rush" title="Question bank" description="Words and clues used by live games. Each game picks {QUESTIONS_PER_GAME} at random.">
	{#snippet actions()}
		{#if status === 'ready' && missingDefaults.length}
			<Button variant="outline" onclick={importDefaults} loading={importing}><Download class="size-4" /> Import {missingDefaults.length} built-in words</Button>
		{/if}
		<Button onclick={openNew}><Plus class="size-4" /> Add question</Button>
	{/snippet}
</PageHeader>

{#if message}
	<p
		class="mb-4 rounded-md border px-3 py-2 text-sm {message.tone === 'ok' ? 'border-emerald-200 bg-emerald-50 text-emerald-800' : 'border-red-200 bg-red-50 text-destructive'}"
		role={message.tone === 'error' ? 'alert' : 'status'}
	>
		{message.text}
	</p>
{/if}

{#if status === 'ready' && items.length < QUESTIONS_PER_GAME}
	<p class="mb-4 text-sm text-muted-foreground">
		{items.length
			? `Only ${items.length} saved — games top up with built-in words until you have ${QUESTIONS_PER_GAME}.`
			: `Games use the ${DEFAULT_QUESTIONS.length} built-in words until you add your own.`}
	</p>
{/if}

<section class="rounded-lg border border-border bg-card">
	<div class="flex flex-col gap-3 border-b border-border p-3 sm:flex-row sm:items-center">
		<label class="relative flex-1">
			<span class="sr-only">Search questions</span>
			<Search class="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
			<input
				bind:value={search}
				placeholder="Search words or clues"
				class="h-9 w-full rounded-md border border-input bg-card pr-3 pl-9 text-sm outline-none transition-[border-color,box-shadow] duration-150 focus:border-ring focus:ring-3 focus:ring-ring/20"
			/>
		</label>
		<SelectField
			label="Category"
			class="sm:w-56 [&>label]:sr-only"
			bind:value={category}
			options={[{ value: 'all', label: 'All categories' }, ...CATEGORIES]}
		/>
	</div>

	{#if status === 'loading'}
		<ul class="divide-y divide-border">
			{#each Array(6) as _, i (i)}
				<li class="flex items-center gap-4 px-4 py-3"><Skeleton class="h-4 w-28" /><Skeleton class="h-4 flex-1" /><Skeleton class="h-6 w-16" /></li>
			{/each}
		</ul>
	{:else if status === 'error'}
		<StateMessage tone="error" icon={CloudOff} title="Unable to load questions." description="Check your connection, then retry.">
			<Button variant="outline" onclick={() => attempt++}>Retry</Button>
		</StateMessage>
	{:else if !items.length}
		<StateMessage icon={ListChecks} title="No questions" description="Add your first Tech Word Rush question, or import the built-in words to edit them.">
			<Button onclick={openNew}><Plus class="size-4" /> Add question</Button>
			<Button variant="outline" onclick={importDefaults} loading={importing}><Download class="size-4" /> Import built-in words</Button>
		</StateMessage>
	{:else if !filtered.length}
		<StateMessage icon={Search} title="No matching questions" description="Try a different search or category." />
	{:else}
		<ul class="divide-y divide-border">
			{#each filtered as q (q.id)}
				<li class="grid grid-cols-[1fr_auto] gap-x-4 gap-y-1 px-4 py-3 text-sm md:grid-cols-[10rem_1fr_9rem_5rem_auto] md:items-center">
					<span class="font-mono font-semibold tracking-wider">{q.word}</span>
					<span class="order-3 col-span-2 text-muted-foreground md:order-none md:col-span-1 md:line-clamp-2">{q.description}</span>
					<span class="hidden text-xs text-muted-foreground md:block">{q.category}</span>
					<span class="hidden md:block">
						<span class="inline-flex min-h-6 items-center rounded-md border px-2 text-xs font-medium capitalize {difficultyCls[q.difficulty]}">{q.difficulty}</span>
					</span>
					<span class="flex justify-end gap-1">
						<Button size="icon" variant="ghost" aria-label="Edit {q.word}" onclick={() => openEdit(q)}><Pencil class="size-4" /></Button>
						<Button size="icon" variant="ghost" aria-label="Delete {q.word}" onclick={() => (removing = q)}><Trash2 class="size-4 text-destructive" /></Button>
					</span>
				</li>
			{/each}
		</ul>
	{/if}
</section>

<Modal open={!!draft} title={draft?.id ? 'Edit question' : 'Add question'} description="Players see the clue, the letter count, and the first and last letters." onclose={() => !saving && (draft = null)}>
	{#if draft}
		<form class="space-y-4" onsubmit={(e) => (e.preventDefault(), save())}>
			<Field label="Answer word" bind:value={draft.word} error={errors.word} hint="Letters only, 3–20 characters." autocomplete="off" maxlength={20} class="[&_input]:font-mono [&_input]:uppercase" />
			<div class="flex flex-col gap-1.5">
				<label for="clue" class="text-[13px] font-medium text-foreground">Technical description</label>
				<textarea
					id="clue"
					bind:value={draft.description}
					rows="3"
					maxlength="240"
					aria-invalid={errors.description ? 'true' : undefined}
					aria-describedby={errors.description ? 'clue-err' : undefined}
					class="w-full rounded-md border bg-card px-3 py-2 text-sm text-foreground outline-none transition-[border-color,box-shadow] duration-150 focus:border-ring focus:ring-3 focus:ring-ring/20 {errors.description ? 'border-destructive' : 'border-input'}"
				></textarea>
				{#if errors.description}<p id="clue-err" class="text-[13px] text-destructive">{errors.description}</p>{/if}
			</div>
			<div class="grid gap-4 sm:grid-cols-2">
				<SelectField label="Category" bind:value={draft.category} options={CATEGORIES} />
				<SelectField label="Difficulty" bind:value={draft.difficulty} options={DIFFICULTIES.map((d) => ({ value: d, label: d[0].toUpperCase() + d.slice(1) }))} />
			</div>
			{#if preview}
				<div class="rounded-md bg-muted px-3 py-2">
					<p class="text-[11px] text-muted-foreground">Players start with</p>
					<p class="mt-0.5 font-mono text-base font-semibold tracking-[0.3em]">{preview.map((c) => c ?? '_').join(' ')}</p>
				</div>
			{/if}
			{#if errors.form}<p class="text-[13px] text-destructive" role="alert">{errors.form}</p>{/if}
			<button type="submit" class="hidden" aria-hidden="true" tabindex="-1"></button>
		</form>
	{/if}
	{#snippet footer()}
		<Button variant="ghost" onclick={() => (draft = null)} disabled={saving}>Cancel</Button>
		<Button onclick={save} loading={saving}>{saving ? 'Saving…' : 'Save question'}</Button>
	{/snippet}
</Modal>

<Modal open={!!removing} title="Delete question?" description="Games already in progress keep their words." onclose={() => !deleting && (removing = null)}>
	<p class="text-sm">Remove <span class="font-mono font-semibold">{removing?.word}</span> from the question bank?</p>
	{#snippet footer()}
		<Button variant="ghost" onclick={() => (removing = null)} disabled={deleting}>Cancel</Button>
		<Button variant="destructive" onclick={confirmDelete} loading={deleting}>Delete</Button>
	{/snippet}
</Modal>
