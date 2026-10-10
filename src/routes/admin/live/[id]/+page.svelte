<script lang="ts">
	import { page } from '$app/state';
	import { beforeNavigate, goto } from '$app/navigation';
	import { fade } from 'svelte/transition';
	import {
		ArrowLeft,
		Plus,
		Copy,
		Trash2,
		GripVertical,
		Settings,
		Play,
		Check,
		CloudOff,
		RotateCcw,
		LoaderCircle,
		CircleAlert,
		Lock
	} from '@lucide/svelte';
	import { enterFullscreen } from '$lib/live/fullscreen';
	import { adminApi, ApiError } from '$lib/live/admin-api';
	import { createSlide, duplicateSlide, sanitizeSlide, SLIDE_META, slideIssues } from '$lib/live/slides';
	import { LIMITS, type LiveSession, type SlideKind } from '$lib/live/types';
	import { moveItem, sortable } from '$lib/actions/sortable';
	import { DUR, rise, sink, softFade } from '$lib/live/motion';
	import Button from '$lib/components/ui/Button.svelte';
	import Skeleton from '$lib/components/ui/Skeleton.svelte';
	import StateMessage from '$lib/components/ui/StateMessage.svelte';
	import SlideEditor from '$lib/components/live/SlideEditor.svelte';
	import SlideTypePicker from '$lib/components/live/SlideTypePicker.svelte';
	import SessionSettingsModal from '$lib/components/live/SessionSettingsModal.svelte';
	import LiveStatusBadge from '$lib/components/live/LiveStatusBadge.svelte';
	import { SLIDE_ICONS } from '$lib/components/live/slide-icons';

	const id = $derived(page.params.id!);

	let session = $state<LiveSession | null>(null);
	let loadState = $state<'loading' | 'ready' | 'error'>('loading');
	let loadError = $state('');
	let selectedId = $state<string | null>(null);
	let pickerOpen = $state(false);
	let settingsOpen = $state(false);
	let announce = $state('');

	// ---- Load -----------------------------------------------------------------

	async function load() {
		loadState = 'loading';
		try {
			const s = await adminApi<LiveSession>(`/sessions/${id}`);
			s.slides = s.slides.map((x) => sanitizeSlide(x)!).filter(Boolean);
			session = s;
			lastSaved = payloadOf(s);
			selectedId = s.slides[0]?.id ?? null;
			loadState = 'ready';
		} catch (err) {
			loadError = err instanceof ApiError ? err.message : 'Unable to load this session.';
			loadState = 'error';
		}
	}
	$effect(() => {
		id;
		load();
	});

	// ---- Autosave (debounced, serialised) -------------------------------------

	type SaveState = 'saved' | 'pending' | 'saving' | 'error';
	let saveState = $state<SaveState>('saved');
	let saveError = $state('');
	let lastSaved = '';
	let chain: Promise<void> = Promise.resolve();

	const payloadOf = (s: LiveSession) => JSON.stringify({ title: s.title, settings: s.settings, slides: s.slides });
	const payload = $derived(session ? payloadOf(session) : '');

	function save(p: string) {
		chain = chain.then(async () => {
			if (p === lastSaved) return;
			saveState = 'saving';
			try {
				await adminApi(`/sessions/${id}`, { method: 'PUT', body: JSON.parse(p) });
				lastSaved = p;
				saveState = payload === p ? 'saved' : 'pending';
			} catch (err) {
				saveError = err instanceof ApiError ? err.message : 'Couldn’t save.';
				saveState = 'error';
			}
		});
		return chain;
	}

	$effect(() => {
		const p = payload;
		if (!p || p === lastSaved) return;
		saveState = 'pending';
		const t = setTimeout(() => save(p), 700);
		return () => clearTimeout(t);
	});

	beforeNavigate(() => {
		if (session && payload !== lastSaved) save(payload);
	});

	function onbeforeunload(e: BeforeUnloadEvent) {
		if (saveState === 'pending' || saveState === 'saving') e.preventDefault();
	}

	// ---- Slides ---------------------------------------------------------------

	const selectedIndex = $derived(session?.slides.findIndex((s) => s.id === selectedId) ?? -1);
	const issueCount = $derived(session?.slides.reduce((n, s) => n + (slideIssues(s).length ? 1 : 0), 0) ?? 0);
	const locked = $derived(session?.status === 'live');

	function select(slideId: string) {
		selectedId = slideId;
	}

	function addSlide(kind: SlideKind) {
		if (!session || session.slides.length >= LIMITS.maxSlides) return;
		const slide = createSlide(kind);
		const at = selectedIndex >= 0 ? selectedIndex + 1 : session.slides.length;
		session.slides.splice(at, 0, slide);
		selectedId = slide.id;
		pickerOpen = false;
		announce = `${SLIDE_META[kind].label} slide added at position ${at + 1}.`;
	}

	function duplicate(i: number) {
		if (!session || session.slides.length >= LIMITS.maxSlides) return;
		const copy = duplicateSlide(session.slides[i]);
		session.slides.splice(i + 1, 0, copy);
		selectedId = copy.id;
		announce = `Slide ${i + 1} duplicated.`;
	}

	function remove(i: number) {
		if (!session || session.slides.length <= 1) return;
		const [gone] = session.slides.splice(i, 1);
		if (gone.id === selectedId) selectedId = session.slides[Math.min(i, session.slides.length - 1)].id;
		announce = `Slide ${i + 1} deleted.`;
	}

	function reorder(from: number, to: number) {
		if (!session) return;
		moveItem(session.slides, from, to);
		announce = `Slide moved to position ${to + 1}.`;
	}

	function railKeydown(e: KeyboardEvent, i: number) {
		if (!session) return;
		if (e.altKey && (e.key === 'ArrowUp' || e.key === 'ArrowDown')) {
			const to = e.key === 'ArrowUp' ? i - 1 : i + 1;
			if (to < 0 || to >= session.slides.length) return;
			e.preventDefault();
			reorder(i, to);
			queueMicrotask(() => document.getElementById(`rail-${session!.slides[to].id}`)?.focus());
		}
	}

	function firstIssue() {
		const s = session?.slides.find((x) => slideIssues(x).length);
		if (s) selectedId = s.id;
	}

	/** Open the presenter straight into fullscreen (needs this click's gesture). */
	function present(id: string) {
		enterFullscreen();
		goto(`/admin/live/${id}/present`);
	}
</script>

<svelte:head><title>{session?.title ?? 'Session'} — Live sessions — ZenCode Admin</title></svelte:head>
<svelte:window {onbeforeunload} />

<a href="/admin/live" class="mb-4 inline-flex items-center gap-1.5 text-[13px] text-muted-foreground hover:text-foreground">
	<ArrowLeft class="size-4" /> Live sessions
</a>

{#if loadState === 'error'}
	<div class="rounded-lg border border-border bg-card">
		<StateMessage tone="error" icon={CloudOff} title="Unable to load this session." description={loadError}>
			<Button variant="outline" onclick={load}><RotateCcw class="size-4" /> Retry</Button>
		</StateMessage>
	</div>
{:else if loadState === 'loading' || !session}
	<div aria-busy="true">
		<div class="mb-6 flex items-end justify-between gap-4"><Skeleton class="h-8 w-72" /><Skeleton class="h-9 w-48" /></div>
		<div class="grid gap-6 lg:grid-cols-[18rem_1fr]">
			<div class="space-y-2">{#each Array(4) as _, i (i)}<Skeleton class="h-16 w-full" />{/each}</div>
			<Skeleton class="h-96 w-full rounded-lg" />
		</div>
	</div>
{:else}
	<!-- Header -->
	<div class="mb-6 flex flex-col gap-4 md:flex-row md:items-center md:justify-between" in:softFade>
		<div class="min-w-0 flex-1">
			<label for="session-title" class="sr-only">Session title</label>
			<input
				id="session-title"
				bind:value={session.title}
				maxlength={LIMITS.title}
				disabled={locked}
				class="-ml-2 w-full max-w-xl rounded-md bg-transparent px-2 py-1 text-2xl font-semibold tracking-tight text-foreground outline-none transition-[background-color,box-shadow] duration-150 hover:bg-muted focus:bg-card focus:ring-3 focus:ring-ring/20"
			/>
			<div class="mt-1 flex items-center gap-3 text-[13px] text-muted-foreground">
				<LiveStatusBadge status={session.status} />
				<span class="tabular">{session.slides.length} {session.slides.length === 1 ? 'slide' : 'slides'}</span>
				<span class="inline-flex items-center gap-1.5" aria-live="polite">
					{#if saveState === 'saving'}
						<LoaderCircle class="size-3.5 animate-spin" /> Saving…
					{:else if saveState === 'pending'}
						<span class="size-1.5 rounded-full bg-sun"></span> Unsaved changes
					{:else if saveState === 'error'}
						<CircleAlert class="size-3.5 text-destructive" />
						<span class="text-destructive">{saveError}</span>
						<button type="button" class="font-medium text-foreground underline underline-offset-2" onclick={() => save(payload)}>Retry</button>
					{:else}
						<Check class="size-3.5 text-brand" /> Saved
					{/if}
				</span>
			</div>
		</div>
		<div class="flex flex-wrap items-center gap-2">
			<Button variant="outline" onclick={() => (settingsOpen = true)} disabled={locked}><Settings class="size-4" /> Settings</Button>
			{#if issueCount}
				<Button variant="secondary" onclick={firstIssue}><CircleAlert class="size-4 text-attention" /> Fix {issueCount} {issueCount === 1 ? 'slide' : 'slides'}</Button>
			{:else}
				<Button onclick={() => present(session!.id)}><Play class="size-4" /> Present</Button>
			{/if}
		</div>
	</div>

	{#if locked}
		<p class="mb-4 flex items-center gap-2 rounded-md border border-border bg-muted px-3 py-2.5 text-sm text-foreground" transition:fade={{ duration: DUR.base }}>
			<Lock class="size-4 text-muted-foreground" /> This session is live. End it from the presenter screen to edit.
		</p>
	{/if}

	<div class="grid items-start gap-6 lg:grid-cols-[18rem_1fr]" inert={locked}>
		<!-- Slide rail -->
		<nav aria-label="Slides" class="lg:sticky lg:top-20">
			<ol class="space-y-1.5" use:sortable={{ onsort: reorder, disabled: locked }}>
				{#each session.slides as slide, i (slide.id)}
					{@const Icon = SLIDE_ICONS[slide.kind]}
					{@const active = slide.id === selectedId}
					{@const hasIssues = slideIssues(slide).length > 0}
					<li
						data-sort-item
						class="group relative flex items-stretch rounded-md border bg-card transition-[border-color,box-shadow] duration-150 data-lifted:shadow-lg
							{active ? 'border-ring/60 ring-3 ring-ring/15' : 'border-border hover:border-ring/40'}"
						in:rise={{ y: 8, duration: DUR.layout }}
						out:sink={{ y: 0, duration: DUR.fast }}
					>
						<button
							type="button"
							data-sort-handle
							tabindex="-1"
							aria-label="Drag slide {i + 1}"
							class="grid w-6 shrink-0 cursor-grab place-items-center text-muted-foreground/60 hover:text-foreground active:cursor-grabbing"
						>
							<GripVertical class="size-4" />
						</button>
						<button
							id="rail-{slide.id}"
							type="button"
							aria-current={active ? 'true' : undefined}
							onclick={() => select(slide.id)}
							onkeydown={(e) => railKeydown(e, i)}
							class="flex min-w-0 flex-1 items-center gap-3 py-2.5 pr-2 text-left outline-none focus-visible:ring-0"
						>
							<span class="w-5 font-mono text-xs text-muted-foreground tabular">{i + 1}</span>
							<span class="grid size-8 shrink-0 place-items-center rounded-md {SLIDE_META[slide.kind].scored ? 'bg-sun-light/50 text-forest-900' : 'bg-secondary text-secondary-foreground'}">
								<Icon class="size-4" />
							</span>
							<span class="min-w-0 flex-1">
								<span class="block truncate text-[13px] font-medium {slide.question.trim() ? 'text-foreground' : 'text-muted-foreground italic'}">
									{slide.question.trim() || (slide.kind === 'qa' ? 'Audience Q&A' : 'No question yet')}
								</span>
								<span class="block truncate text-xs text-muted-foreground">{SLIDE_META[slide.kind].label}</span>
							</span>
							{#if hasIssues}
								<CircleAlert class="size-4 shrink-0 text-attention" aria-label="Needs attention" />
							{/if}
						</button>
						<div
							class="flex items-center pr-1 opacity-0 transition-opacity duration-150 group-focus-within:opacity-100 group-hover:opacity-100 {active ? 'opacity-100' : ''}"
						>
							<button type="button" class="grid size-7 place-items-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground" aria-label="Duplicate slide {i + 1}" onclick={() => duplicate(i)}>
								<Copy class="size-3.5" />
							</button>
							<button
								type="button"
								class="grid size-7 place-items-center rounded-md text-muted-foreground hover:bg-muted hover:text-destructive disabled:pointer-events-none disabled:opacity-40"
								aria-label="Delete slide {i + 1}"
								disabled={session.slides.length <= 1}
								onclick={() => remove(i)}
							>
								<Trash2 class="size-3.5" />
							</button>
						</div>
					</li>
				{/each}
			</ol>
			<Button variant="outline" class="mt-3 w-full border-dashed" onclick={() => (pickerOpen = true)} disabled={session.slides.length >= LIMITS.maxSlides}>
				<Plus class="size-4" /> Add slide
			</Button>
			<p class="mt-2 hidden text-xs text-muted-foreground lg:block">Drag to reorder, or Alt + ↑/↓ on a slide.</p>
			<p class="sr-only" aria-live="polite">{announce}</p>
		</nav>

		<!-- Editor -->
		<div class="min-w-0">
			{#if selectedIndex >= 0}
				{#key selectedId}
					<div in:rise={{ y: 10, duration: DUR.layout }}>
						<SlideEditor bind:slide={session.slides[selectedIndex]} index={selectedIndex} />
					</div>
				{/key}
			{/if}
		</div>
	</div>

	<SlideTypePicker open={pickerOpen} onclose={() => (pickerOpen = false)} onpick={addSlide} />
	<SessionSettingsModal open={settingsOpen} onclose={() => (settingsOpen = false)} bind:settings={session.settings} />
{/if}
