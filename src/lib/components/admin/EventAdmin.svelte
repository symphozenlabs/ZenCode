<script lang="ts">
	import { untrack } from 'svelte';
	import { page } from '$app/state';
	import { goto } from '$app/navigation';
	import { ExternalLink, Plus, Trash2, CloudOff, RotateCcw } from '@lucide/svelte';
	import { EVENT_LABELS, type EventConfig, type EventId } from '$lib/config/site';
	import { registrations } from '$lib/stores/registrations.svelte';
	import { TEAM_SIZES } from '$lib/registrations/model';
	import { siteConfig } from '$lib/stores/site-config.svelte';
	import PageHeader from './PageHeader.svelte';
	import StatCard from './StatCard.svelte';
	import RegistrationTable from './RegistrationTable.svelte';
	import ListEditor from './ListEditor.svelte';
	import Toggle from './Toggle.svelte';
	import SaveBar from './SaveBar.svelte';
	import Button from '$lib/components/ui/Button.svelte';
	import Field from '$lib/components/ui/Field.svelte';
	import Skeleton from '$lib/components/ui/Skeleton.svelte';
	import StateMessage from '$lib/components/ui/StateMessage.svelte';

	let { eventId }: { eventId: EventId } = $props();

	$effect(() => siteConfig.subscribe());

	const tab = $derived(page.url.searchParams.get('tab') === 'settings' ? 'settings' : 'registrations');

	const list = $derived(registrations.items.filter((r) => r.event === eventId));
	const stats = $derived({
		total: list.length,
		pending: list.filter((r) => r.status === 'pending').length,
		approved: list.filter((r) => r.status === 'approved').length,
		people: list.filter((r) => r.status === 'approved').reduce((n, r) => n + r.teamSize, 0)
	});
	const loading = $derived(registrations.status !== 'ready');

	// ---- Settings form -------------------------------------------------
	let draft = $state<EventConfig | null>(null);
	let saving = $state(false);
	let message = $state<{ text: string; tone: 'ok' | 'error' } | null>(null);
	let errors = $state<Record<string, string>>({});

	const stored = $derived(siteConfig.value.events[eventId]);

	function resetDraft() {
		draft = structuredClone($state.snapshot(stored));
		errors = {};
	}

	// Load the draft once config arrives, and whenever another admin saves while we're clean.
	$effect(() => {
		if (siteConfig.status !== 'ready') return;
		stored;
		untrack(() => {
			if (!draft || !dirtyUntracked()) resetDraft();
		});
	});

	function normalized(d: EventConfig): EventConfig {
		return {
			...d,
			tracks: d.tracks.map((t) => t.trim()).filter(Boolean),
			rules: d.rules.map((t) => t.trim()).filter(Boolean),
			prizes: d.prizes.map((p) => ({ place: p.place.trim(), reward: p.reward.trim() })).filter((p) => p.place || p.reward)
		};
	}

	const dirty = $derived(!!draft && JSON.stringify(normalized(draft)) !== JSON.stringify(stored));
	function dirtyUntracked() {
		return draft ? JSON.stringify(normalized($state.snapshot(draft) as EventConfig)) !== JSON.stringify($state.snapshot(stored)) : false;
	}

	function validate(d: EventConfig) {
		const e: Record<string, string> = {};
		if (!d.title.trim()) e.title = 'Enter a title.';
		if (d.startDate && d.endDate && d.endDate < d.startDate) e.endDate = 'End date must be after the start date.';
		return e;
	}

	async function save() {
		if (!draft) return;
		const data = normalized($state.snapshot(draft) as EventConfig);
		errors = validate(data);
		if (Object.keys(errors).length) {
			message = { text: 'Fix the highlighted fields before saving.', tone: 'error' };
			return;
		}
		saving = true;
		message = null;
		try {
			await siteConfig.saveEvent(eventId, data);
			draft = structuredClone(data);
			message = { text: 'Saved. The public site updates within a minute.', tone: 'ok' };
			setTimeout(() => (message = null), 3000);
		} catch {
			message = { text: 'Unable to save settings. Try again.', tone: 'error' };
		} finally {
			saving = false;
		}
	}

	function setTab(t: 'registrations' | 'settings') {
		const url = new URL(page.url);
		if (t === 'settings') url.searchParams.set('tab', 'settings');
		else url.searchParams.delete('tab');
		goto(url, { replaceState: true, noScroll: true, keepFocus: true });
	}

	const label = $derived(EVENT_LABELS[eventId]);
	const teamSizeLabel = $derived(TEAM_SIZES[eventId].join(' or ') + ' members');
	const publicHref = $derived(eventId === 'hackathon' ? '/hackathon' : '/pitch-fest');
</script>

<svelte:head><title>{label} — ZenCode Admin</title></svelte:head>

<PageHeader eyebrow="Event" title={label} description="Registrations and public event settings for {label}.">
	{#snippet actions()}
		<Button href={publicHref} variant="outline"><ExternalLink class="size-4" /> Public page</Button>
	{/snippet}
</PageHeader>

<div class="mb-6 grid grid-cols-2 gap-3 md:grid-cols-4">
	<StatCard label="Registrations" value={stats.total} {loading} />
	<StatCard label="Pending" value={stats.pending} {loading} />
	<StatCard label="Approved entries" value={stats.approved} {loading} />
	<StatCard label="Approved people" value={stats.people} helper="All members of approved teams" {loading} />
</div>

<div class="mb-4 flex gap-1 border-b border-border" role="tablist">
	{#each [['registrations', 'Registrations'], ['settings', 'Event settings']] as [id, text] (id)}
		<button
			type="button"
			role="tab"
			aria-selected={tab === id}
			onclick={() => setTab(id as 'registrations' | 'settings')}
			class="-mb-px h-10 border-b-2 px-3 text-sm font-medium transition-colors duration-150 {tab === id ? 'border-primary text-foreground' : 'border-transparent text-muted-foreground hover:text-foreground'}"
		>{text}</button>
	{/each}
</div>

{#if tab === 'registrations'}
	<RegistrationTable event={eventId} />
{:else if siteConfig.status === 'error'}
	<div class="rounded-lg border border-border bg-card">
		<StateMessage tone="error" icon={CloudOff} title="Unable to load event settings.">
			<Button variant="outline" onclick={() => siteConfig.retry()}><RotateCcw class="size-4" /> Retry</Button>
		</StateMessage>
	</div>
{:else if !draft}
	<div class="space-y-3 rounded-lg border border-border bg-card p-6"><Skeleton class="h-9 w-1/2" /><Skeleton class="h-20" /><Skeleton class="h-9 w-1/3" /></div>
{:else}
	<div class="grid gap-6 xl:grid-cols-2">
		<section class="space-y-4 rounded-lg border border-border bg-card p-5">
			<h2 class="text-[15px] font-semibold">Registration</h2>
			<Toggle bind:checked={draft.registrationOpen} label="Accept registrations" description="When off, the public form shows this event as closed." />
			<div class="grid gap-4 sm:grid-cols-2">
				<Field label="Registration deadline" type="date" bind:value={draft.registrationDeadline} hint="Optional. Closes at 23:59 on this day." />
				<div class="flex flex-col gap-1.5">
					<p class="text-[13px] font-medium">Team size</p>
					<p class="flex h-9 items-center text-sm text-muted-foreground">{teamSizeLabel} — fixed by the registration form</p>
				</div>
			</div>
		</section>

		<section class="space-y-4 rounded-lg border border-border bg-card p-5">
			<h2 class="text-[15px] font-semibold">Dates</h2>
			<div class="grid gap-4 sm:grid-cols-2">
				<Field label="Start date" type="date" bind:value={draft.startDate} />
				<Field label="End date" type="date" bind:value={draft.endDate} error={errors.endDate} />
			</div>
			<Field label="Duration" bind:value={draft.duration} placeholder="e.g. 24 hours" hint="Shown as free text. Leave empty if not announced." />
		</section>

		<section class="space-y-4 rounded-lg border border-border bg-card p-5 xl:col-span-2">
			<h2 class="text-[15px] font-semibold">Public content</h2>
			<Field label="Title" bind:value={draft.title} error={errors.title} />
			<div class="flex flex-col gap-1.5">
				<label for="summary" class="text-[13px] font-medium">Summary</label>
				<textarea id="summary" rows="2" bind:value={draft.summary} class="rounded-md border border-input bg-card px-3 py-2 text-sm outline-none focus:border-ring focus:ring-3 focus:ring-ring/20"></textarea>
			</div>
			<div class="flex flex-col gap-1.5">
				<label for="description" class="text-[13px] font-medium">Description</label>
				<textarea id="description" rows="4" bind:value={draft.description} class="rounded-md border border-input bg-card px-3 py-2 text-sm outline-none focus:border-ring focus:ring-3 focus:ring-ring/20"></textarea>
			</div>
		</section>

		<section class="rounded-lg border border-border bg-card p-5">
			<ListEditor label="Tracks" bind:items={draft.tracks} placeholder="Track name" addLabel="Add track" />
		</section>

		<section class="rounded-lg border border-border bg-card p-5">
			<fieldset>
				<legend class="text-[13px] font-medium">Prizes</legend>
				{#if draft.prizes.length}
					<ul class="mt-2 space-y-2">
						{#each draft.prizes as prize, i (i)}
							<li class="grid grid-cols-[8rem_1fr_auto] gap-2">
								<input bind:value={prize.place} placeholder="Place" aria-label="Prize {i + 1} place" class="h-9 rounded-md border border-input bg-card px-3 text-sm outline-none focus:border-ring focus:ring-3 focus:ring-ring/20" />
								<input bind:value={prize.reward} placeholder="Reward" aria-label="Prize {i + 1} reward" class="h-9 rounded-md border border-input bg-card px-3 text-sm outline-none focus:border-ring focus:ring-3 focus:ring-ring/20" />
								<Button variant="ghost" size="icon" aria-label="Remove prize" onclick={() => draft?.prizes.splice(i, 1)}><Trash2 class="size-4" /></Button>
							</li>
						{/each}
					</ul>
				{:else}
					<p class="mt-1 text-[13px] text-muted-foreground">None yet — the public site shows “Prizes will be announced”.</p>
				{/if}
				<Button variant="outline" size="sm" class="mt-2" onclick={() => draft?.prizes.push({ place: '', reward: '' })}><Plus class="size-3.5" /> Add prize</Button>
			</fieldset>
		</section>

		<section class="rounded-lg border border-border bg-card p-5 xl:col-span-2">
			<ListEditor label="Event rules" bind:items={draft.rules} placeholder="Rule" addLabel="Add rule" multiline />
		</section>
	</div>

	<SaveBar {dirty} {saving} {message} onsave={save} onreset={resetDraft} />
{/if}
