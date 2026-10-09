<script lang="ts">
	import { goto } from '$app/navigation';
	import { flip } from 'svelte/animate';
	import { Plus, Radio, Play, PencilLine, Trash2, CloudOff, RotateCcw, Layers, FlaskConical } from '@lucide/svelte';
	import { enterFullscreen } from '$lib/live/fullscreen';
	import { adminApi, ApiError } from '$lib/live/admin-api';
	import { formatCode } from '$lib/live/session';
	import type { LiveSession, SessionSummary } from '$lib/live/types';
	import { formatTimestamp } from '$lib/utils/format';
	import { DUR, rise, softFade } from '$lib/live/motion';
	import PageHeader from '$lib/components/admin/PageHeader.svelte';
	import Button from '$lib/components/ui/Button.svelte';
	import Field from '$lib/components/ui/Field.svelte';
	import Modal from '$lib/components/ui/Modal.svelte';
	import Skeleton from '$lib/components/ui/Skeleton.svelte';
	import StateMessage from '$lib/components/ui/StateMessage.svelte';
	import LiveStatusBadge from '$lib/components/live/LiveStatusBadge.svelte';

	let sessions = $state<SessionSummary[]>([]);
	let status = $state<'loading' | 'ready' | 'error'>('loading');
	let loadError = $state('');

	let createOpen = $state(false);
	let title = $state('');
	let creating = $state(false);
	let createError = $state('');

	let creatingDemo = $state(false);
	let demoError = $state('');

	let toDelete = $state<SessionSummary | null>(null);
	let deleting = $state(false);
	let deleteError = $state('');

	async function load() {
		status = 'loading';
		try {
			sessions = await adminApi<SessionSummary[]>('/sessions');
			status = 'ready';
		} catch (err) {
			loadError = err instanceof ApiError ? err.message : 'Unable to load sessions.';
			status = 'error';
		}
	}
	$effect(() => {
		load();
	});

	function openCreate() {
		title = '';
		createError = '';
		createOpen = true;
	}

	async function create(e: SubmitEvent) {
		e.preventDefault();
		creating = true;
		createError = '';
		try {
			const s = await adminApi<LiveSession>('/sessions', { method: 'POST', body: { title } });
			goto(`/admin/live/${s.id}`);
		} catch (err) {
			createError = err instanceof ApiError ? err.message : 'Could not create the session.';
			creating = false;
		}
	}

	/** A session with one slide of every kind, for rehearsing before going live. */
	async function createDemo() {
		creatingDemo = true;
		demoError = '';
		try {
			const s = await adminApi<LiveSession>('/sessions', { method: 'POST', body: { demo: true } });
			goto(`/admin/live/${s.id}`);
		} catch (err) {
			demoError = err instanceof ApiError ? err.message : 'Could not create the demo session.';
			creatingDemo = false;
		}
	}

	async function remove() {
		const target = toDelete;
		if (!target) return;
		deleting = true;
		deleteError = '';
		try {
			await adminApi(`/sessions/${target.id}`, { method: 'DELETE' });
			sessions = sessions.filter((s) => s.id !== target.id);
			toDelete = null;
		} catch (err) {
			deleteError = err instanceof ApiError ? err.message : 'Could not delete the session.';
		} finally {
			deleting = false;
		}
	}

	/** Open the presenter straight into fullscreen (needs this click's gesture). */
	function present(id: string) {
		enterFullscreen();
		goto(`/admin/live/${id}/present`);
	}
</script>

<svelte:head><title>Live sessions — ZenCode Admin</title></svelte:head>

<PageHeader
	eyebrow="Engage"
	title="Live sessions"
	description="Quizzes, polls, reactions and Q&A — presented on the big screen, answered from phones."
>
	{#snippet actions()}
		<Button variant="outline" loading={creatingDemo} onclick={createDemo}><FlaskConical class="size-4" /> Demo session</Button>
		<Button onclick={openCreate}><Plus class="size-4" /> New session</Button>
	{/snippet}
</PageHeader>

{#if demoError}<p class="mb-4 text-[13px] text-destructive" role="alert">{demoError}</p>{/if}

{#if status === 'error'}
	<div class="rounded-lg border border-border bg-card">
		<StateMessage tone="error" icon={CloudOff} title="Unable to load sessions." description={loadError}>
			<Button variant="outline" onclick={load}><RotateCcw class="size-4" /> Retry</Button>
		</StateMessage>
	</div>
{:else if status === 'loading'}
	<div class="grid gap-3 sm:grid-cols-2 xl:grid-cols-3" aria-busy="true">
		{#each Array(3) as _, i (i)}
			<div class="rounded-lg border border-border bg-card p-5">
				<Skeleton class="h-5 w-2/3" />
				<Skeleton class="mt-3 h-4 w-1/3" />
				<div class="mt-8 flex gap-2"><Skeleton class="h-8 w-24" /><Skeleton class="h-8 w-20" /></div>
			</div>
		{/each}
	</div>
{:else if !sessions.length}
	<div class="rounded-lg border border-border bg-card" in:softFade>
		<StateMessage icon={Radio} title="No live sessions yet" description="Build a quiz or a set of polls, then present it to the room.">
			<Button onclick={openCreate}><Plus class="size-4" /> New session</Button>
		</StateMessage>
	</div>
{:else}
	<ul class="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
		{#each sessions as s, i (s.id)}
			<li
				class="flex flex-col rounded-lg border border-border bg-card p-5 transition-colors duration-150 hover:border-ring/50"
				in:rise={{ y: 10, duration: DUR.layout, delay: Math.min(i, 8) * 40 }}
				animate:flip={{ duration: DUR.layout }}
			>
				<div class="flex items-start justify-between gap-3">
					<a href="/admin/live/{s.id}" class="min-w-0 text-[15px] font-semibold text-foreground hover:text-forest-700">
						<span class="line-clamp-2">{s.title}</span>
					</a>
					<LiveStatusBadge status={s.status} />
				</div>
				<p class="mt-1.5 flex flex-wrap items-center gap-x-1.5 text-[13px] text-muted-foreground">
					<Layers class="size-3.5" aria-hidden="true" />
					<span class="tabular">{s.slideCount} {s.slideCount === 1 ? 'slide' : 'slides'}</span>
					<span aria-hidden="true">·</span>
					<span>Updated {formatTimestamp(s.updatedAt, true)}</span>
				</p>
				{#if s.joinCode}
					<p class="mt-3 text-[13px] text-muted-foreground">
						Join code <span class="font-mono font-semibold tracking-wider text-foreground tabular">{formatCode(s.joinCode)}</span>
					</p>
				{/if}
				<div class="mt-auto flex items-center gap-2 pt-6">
					<Button onclick={() => present(s.id)} size="sm"><Play class="size-3.5" /> Present</Button>
					<Button href="/admin/live/{s.id}" variant="outline" size="sm"><PencilLine class="size-3.5" /> Edit</Button>
					<Button
						variant="ghost"
						size="icon"
						class="ml-auto text-muted-foreground hover:text-destructive"
						aria-label="Delete {s.title}"
						onclick={() => ((deleteError = ''), (toDelete = s))}><Trash2 class="size-4" /></Button
					>
				</div>
			</li>
		{/each}
	</ul>
{/if}

<Modal open={createOpen} title="New live session" description="You can rename it any time." onclose={() => (createOpen = false)}>
	<form id="create-session" onsubmit={create}>
		<Field label="Title" bind:value={title} placeholder="e.g. Opening ceremony quiz" maxlength={80} error={createError || undefined} />
	</form>
	{#snippet footer()}
		<Button variant="outline" onclick={() => (createOpen = false)}>Cancel</Button>
		<Button type="submit" form="create-session" loading={creating}>Create and edit</Button>
	{/snippet}
</Modal>

<Modal
	open={!!toDelete}
	title="Delete this session?"
	description="Its slides, players and results are removed for good. This can’t be undone."
	onclose={() => (toDelete = null)}
>
	<p class="text-sm text-foreground">“{toDelete?.title}”</p>
	{#if deleteError}<p class="mt-2 text-[13px] text-destructive" role="alert">{deleteError}</p>{/if}
	{#snippet footer()}
		<Button variant="outline" onclick={() => (toDelete = null)}>Keep it</Button>
		<Button variant="destructive" loading={deleting} onclick={remove}><Trash2 class="size-4" /> Delete session</Button>
	{/snippet}
</Modal>
