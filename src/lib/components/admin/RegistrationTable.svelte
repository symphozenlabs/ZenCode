<script lang="ts">
	import { untrack } from 'svelte';
	import { slide, fade } from 'svelte/transition';
	import {
		Search,
		ChevronRight,
		ChevronLeft,
		ArrowUpDown,
		ArrowUp,
		ArrowDown,
		Download,
		Pencil,
		X,
		RotateCcw,
		Trash2,
		Inbox,
		CloudOff,
		SearchX
	} from '@lucide/svelte';
	import { EVENT_LABELS, type EventId } from '$lib/config/site';
	import { referenceId, type Registration, type RegistrationStatus } from '$lib/registrations/model';
	import { registrations } from '$lib/stores/registrations.svelte';
	import { formatTimestamp } from '$lib/utils/format';
	import { downloadCsv, toCsv } from '$lib/utils/csv';
	import Button from '$lib/components/ui/Button.svelte';
	import StatusBadge from '$lib/components/ui/StatusBadge.svelte';
	import Skeleton from '$lib/components/ui/Skeleton.svelte';
	import StateMessage from '$lib/components/ui/StateMessage.svelte';
	import Modal from '$lib/components/ui/Modal.svelte';
	import RegistrationEditModal from './RegistrationEditModal.svelte';

	type StatusFilter = RegistrationStatus | 'all';
	type EventFilter = EventId | 'all';
	type SortKey = 'name' | 'event' | 'status' | 'createdAt' | 'class';

	interface Props {
		/** Lock the table to one event (event admin pages) */
		event?: EventId;
		initialStatus?: StatusFilter;
		pageSize?: number;
	}
	let { event, initialStatus = 'all', pageSize = 20 }: Props = $props();

	let search = $state('');
	let eventFilter = $state<EventFilter>('all');
	let statusFilter = $state<StatusFilter>(untrack(() => initialStatus));
	let sortKey = $state<SortKey>('createdAt');
	let sortDir = $state<'asc' | 'desc'>('desc');
	let pageIndex = $state(0);
	let expanded = $state<string | null>(null);
	let busy = $state<Record<string, string>>({});
	let toast = $state<{ text: string; tone: 'ok' | 'error' } | null>(null);
	let editing = $state<Registration | null>(null);
	let deleting = $state<Registration | null>(null);
	let deleteBusy = $state(false);

	const scoped = $derived(
		registrations.items.filter((r) => (event ? r.event === event : eventFilter === 'all' || r.event === eventFilter))
	);

	const counts = $derived({
		all: scoped.length,
		approved: scoped.filter((r) => r.status === 'approved').length,
		rejected: scoped.filter((r) => r.status === 'rejected').length
	});

	const filtered = $derived.by(() => {
		const q = search.trim().toLowerCase();
		const rows = scoped.filter((r) => {
			if (statusFilter !== 'all' && r.status !== statusFilter) return false;
			if (!q) return true;
			return [
				r.id,
				referenceId(r.id),
				r.teamLeader.name,
				r.teamLeader.email,
				r.teamLeader.admissionNumber,
				r.teamLeader.classSection,
				...r.members.map((m) => `${m.name} ${m.email} ${m.admissionNumber}`)
			]
				.join(' ')
				.toLowerCase()
				.includes(q);
		});
		const dir = sortDir === 'asc' ? 1 : -1;
		const val = (r: Registration): string | number =>
			sortKey === 'name'
				? r.teamLeader.name.toLowerCase()
				: sortKey === 'event'
					? r.event
					: sortKey === 'status'
						? r.status
						: sortKey === 'class'
							? r.teamLeader.classSection.toLowerCase()
							: r.createdAt;
		return [...rows].sort((a, b) => (val(a) > val(b) ? dir : val(a) < val(b) ? -dir : 0));
	});

	const pageCount = $derived(Math.max(1, Math.ceil(filtered.length / pageSize)));
	const rows = $derived(filtered.slice(pageIndex * pageSize, pageIndex * pageSize + pageSize));

	// Reset to the first page whenever the result set changes shape.
	$effect(() => {
		search;
		eventFilter;
		statusFilter;
		sortKey;
		sortDir;
		pageIndex = 0;
	});
	$effect(() => {
		if (pageIndex > pageCount - 1) pageIndex = pageCount - 1;
	});

	function sortBy(key: SortKey) {
		if (sortKey === key) sortDir = sortDir === 'asc' ? 'desc' : 'asc';
		else {
			sortKey = key;
			sortDir = key === 'createdAt' ? 'desc' : 'asc';
		}
	}

	function notify(text: string, tone: 'ok' | 'error' = 'ok') {
		toast = { text, tone };
		const current = toast;
		setTimeout(() => {
			if (toast === current) toast = null;
		}, 3200);
	}

	async function setStatus(r: Registration, status: RegistrationStatus) {
		busy = { ...busy, [r.id]: status };
		try {
			await registrations.setStatus(r, status);
			notify(status === 'rejected' ? `${r.teamLeader.name}'s team rejected` : `${r.teamLeader.name}'s team restored`);
		} catch {
			notify('Unable to update status. Try again.', 'error');
		} finally {
			const { [r.id]: _, ...rest } = busy;
			busy = rest;
		}
	}

	async function confirmDelete() {
		if (!deleting) return;
		deleteBusy = true;
		try {
			await registrations.remove(deleting);
			notify(`Deleted ${deleting.teamLeader.name}'s team`);
			if (expanded === deleting.id) expanded = null;
			deleting = null;
		} catch {
			notify('Unable to delete this registration.', 'error');
		} finally {
			deleteBusy = false;
		}
	}

	function exportCsv() {
		const headers = [
			'Reference', 'Document ID', 'Status', 'Event', 'Leader name', 'Leader admission no.', 'Class & section',
			'Leader email', 'Team size', 'Members', 'Registered at'
		];
		const data = filtered.map((r) => [
			referenceId(r.id), r.id, r.status, EVENT_LABELS[r.event], r.teamLeader.name, r.teamLeader.admissionNumber,
			r.teamLeader.classSection, r.teamLeader.email, r.teamSize,
			r.members.map((m) => `${m.name} (${m.admissionNumber}) <${m.email}>`).join('; '),
			r.createdAt ? new Date(r.createdAt).toISOString() : ''
		]);
		const stamp = new Date().toISOString().slice(0, 10);
		downloadCsv(`zencode-${event ?? 'registrations'}-${statusFilter}-${stamp}.csv`, toCsv(headers, data));
		notify(`Exported ${data.length} registration${data.length === 1 ? '' : 's'}`);
	}

	const statusTabs: { id: StatusFilter; label: string }[] = [
		{ id: 'all', label: 'All' },
		{ id: 'approved', label: 'Approved' },
		{ id: 'rejected', label: 'Rejected' }
	];
	const eventTabs: { id: EventFilter; label: string }[] = [
		{ id: 'all', label: 'All events' },
		{ id: 'hackathon', label: 'Hackathon' },
		{ id: 'pitch-fest', label: 'Pitch Fest' }
	];
</script>

{#snippet sortHeader(key: SortKey, label: string, cls = '')}
	<th scope="col" class="px-3 py-2.5 text-left font-medium {cls}" aria-sort={sortKey === key ? (sortDir === 'asc' ? 'ascending' : 'descending') : 'none'}>
		<button type="button" class="inline-flex items-center gap-1 hover:text-foreground" onclick={() => sortBy(key)}>
			{label}
			{#if sortKey !== key}<ArrowUpDown class="size-3 opacity-50" />{:else if sortDir === 'asc'}<ArrowUp class="size-3" />{:else}<ArrowDown class="size-3" />{/if}
		</button>
	</th>
{/snippet}

{#snippet detailGroup(title: string, items: [string, string][])}
	<div>
		<p class="text-[11px] font-semibold tracking-[0.1em] text-muted-foreground uppercase">{title}</p>
		<dl class="mt-2 space-y-1.5">
			{#each items as [k, v] (k)}
				<div class="grid grid-cols-[7rem_1fr] gap-2 text-[13px]">
					<dt class="text-muted-foreground">{k}</dt>
					<dd class="break-words text-foreground">{v || '—'}</dd>
				</div>
			{/each}
		</dl>
	</div>
{/snippet}

<div class="rounded-lg border border-border bg-card">
	<!-- Toolbar -->
	<div class="flex flex-col gap-3 border-b border-border p-3 md:flex-row md:items-center">
		<div class="relative md:w-80">
			<Search class="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
			<label for="reg-search" class="sr-only">Search registrations</label>
			<input
				id="reg-search"
				type="search"
				bind:value={search}
				placeholder="Search name, admission no., email, class…"
				class="h-9 w-full rounded-md border border-input bg-muted pr-3 pl-9 text-sm outline-none transition-[border-color,box-shadow] duration-150 focus:border-ring focus:bg-card focus:ring-3 focus:ring-ring/20"
			/>
		</div>
		{#if !event}
			<div class="flex gap-1 rounded-md bg-muted p-1" role="group" aria-label="Filter by event">
				{#each eventTabs as t (t.id)}
					<button
						type="button"
						aria-pressed={eventFilter === t.id}
						onclick={() => (eventFilter = t.id)}
						class="h-7 rounded px-3 text-[13px] font-medium transition-colors duration-150 {eventFilter === t.id ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'}"
					>{t.label}</button>
				{/each}
			</div>
		{/if}
		<div class="md:ml-auto">
			<Button variant="outline" onclick={exportCsv} disabled={!filtered.length}>
				<Download class="size-4" /> Export CSV
			</Button>
		</div>
	</div>

	<!-- Status tabs -->
	<div class="flex gap-1 overflow-x-auto border-b border-border px-3" role="tablist" aria-label="Filter by status">
		{#each statusTabs as t (t.id)}
			<button
				type="button"
				role="tab"
				aria-selected={statusFilter === t.id}
				onclick={() => (statusFilter = t.id)}
				class="-mb-px flex h-10 items-center gap-2 border-b-2 px-3 text-[13px] font-medium whitespace-nowrap transition-colors duration-150
					{statusFilter === t.id ? 'border-primary text-foreground' : 'border-transparent text-muted-foreground hover:text-foreground'}"
			>
				{t.label}
				<span class="rounded bg-muted px-1.5 text-[11px] leading-5 tabular">{counts[t.id]}</span>
			</button>
		{/each}
	</div>

	{#if registrations.status === 'error'}
		<StateMessage tone="error" icon={CloudOff} title="Unable to load registrations." description="Check your connection or permissions, then retry.">
			<Button variant="outline" onclick={() => registrations.retry()}><RotateCcw class="size-4" /> Retry</Button>
		</StateMessage>
	{:else if registrations.status !== 'ready'}
		<div class="divide-y divide-border" aria-busy="true" aria-label="Loading participants">
			{#each Array(6) as _, i (i)}
				<div class="flex items-center gap-4 px-4 py-3.5">
					<Skeleton class="size-5" /><Skeleton class="h-4 w-40" /><Skeleton class="hidden h-4 w-24 md:block" /><Skeleton class="h-5 w-20" /><Skeleton class="ml-auto hidden h-4 w-16 md:block" />
				</div>
			{/each}
		</div>
	{:else if !scoped.length}
		<StateMessage icon={Inbox} title="No registrations yet" description="Teams registered on the public form will appear here in real time." />
	{:else if !filtered.length}
		<StateMessage icon={SearchX} title="No matches" description="Nothing matches these filters.">
			<Button variant="outline" onclick={() => { search = ''; statusFilter = 'all'; eventFilter = 'all'; }}>Clear filters</Button>
		</StateMessage>
	{:else}
		<div class="overflow-x-auto">
			<table class="w-full text-sm">
				<thead class="bg-secondary/60 text-[12px] text-muted-foreground">
					<tr>
						<th scope="col" class="w-10 px-3 py-2.5"><span class="sr-only">Expand</span></th>
						{@render sortHeader('name', 'Team leader')}
						{#if !event}{@render sortHeader('event', 'Event', 'hidden md:table-cell')}{/if}
						{@render sortHeader('class', 'Class & section', 'hidden lg:table-cell')}
						{@render sortHeader('status', 'Status')}
						{@render sortHeader('createdAt', 'Registered', 'hidden sm:table-cell')}
						<th scope="col" class="px-3 py-2.5 text-right font-medium"><span class="sr-only">Actions</span></th>
					</tr>
				</thead>
				<tbody>
					{#each rows as r (r.id)}
						{@const open = expanded === r.id}
						{@const rowBusy = busy[r.id]}
						<tr class="border-t border-border transition-colors duration-150 hover:bg-muted/50 {open ? 'bg-muted/40' : ''}">
							<td class="px-3 py-2.5">
								<button
									type="button"
									class="grid size-7 place-items-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
									aria-expanded={open}
									aria-controls="detail-{r.id}"
									aria-label="{open ? 'Collapse' : 'Expand'} {r.teamLeader.name}"
									onclick={() => (expanded = open ? null : r.id)}
								>
									<ChevronRight class="size-4 transition-transform duration-200 {open ? 'rotate-90' : ''}" />
								</button>
							</td>
							<td class="px-3 py-2.5">
								<button type="button" class="text-left" onclick={() => (expanded = open ? null : r.id)}>
									<span class="block font-medium text-foreground">{r.teamLeader.name || '—'}</span>
									<span class="block font-mono text-[11px] text-muted-foreground">{referenceId(r.id)} · {r.teamSize} members</span>
								</button>
							</td>
							{#if !event}<td class="hidden px-3 py-2.5 text-foreground md:table-cell">{EVENT_LABELS[r.event]}</td>{/if}
							<td class="hidden px-3 py-2.5 text-foreground lg:table-cell">{r.teamLeader.classSection || '—'}</td>
							<td class="px-3 py-2.5"><StatusBadge status={r.status} /></td>
							<td class="hidden px-3 py-2.5 text-muted-foreground tabular sm:table-cell">{formatTimestamp(r.createdAt)}</td>
							<td class="px-3 py-2.5">
								<div class="flex justify-end gap-1">
									{#if r.status === 'rejected'}
										<Button size="sm" variant="ghost" loading={rowBusy === 'approved'} disabled={!!rowBusy} onclick={() => setStatus(r, 'approved')} aria-label="Restore {r.teamLeader.name}'s team">
											{#if rowBusy !== 'approved'}<RotateCcw class="size-4" />{/if}<span class="hidden xl:inline">Restore</span>
										</Button>
									{:else}
										<Button size="sm" variant="ghost" class="text-destructive hover:bg-red-50" loading={rowBusy === 'rejected'} disabled={!!rowBusy} onclick={() => setStatus(r, 'rejected')} aria-label="Reject {r.teamLeader.name}'s team">
											{#if rowBusy !== 'rejected'}<X class="size-4" />{/if}<span class="hidden xl:inline">Reject</span>
										</Button>
									{/if}
								</div>
							</td>
						</tr>
						{#if open}
							<tr id="detail-{r.id}" class="bg-muted/40">
								<td colspan="7" class="p-0">
									<div transition:slide={{ duration: 200 }}>
										<div class="border-t border-dashed border-border px-4 py-5 md:pl-14">
											<p class="text-xs font-semibold tracking-[0.1em] text-foreground uppercase">Participant details</p>
											<div class="mt-4 grid gap-6 sm:grid-cols-2 xl:grid-cols-3">
												{@render detailGroup('Team leader', [['Name', r.teamLeader.name], ['Admission no.', r.teamLeader.admissionNumber], ['Class & section', r.teamLeader.classSection], ['Email', r.teamLeader.email]])}
												{@render detailGroup('Event', [['Event', EVENT_LABELS[r.event]], ['Team size', `${r.teamSize} members`]])}
												{@render detailGroup('Registration', [['Reference', referenceId(r.id)], ['Document ID', r.id], ['Registered', formatTimestamp(r.createdAt, true)], ['Status', r.status[0].toUpperCase() + r.status.slice(1)], ['Reviewed by', r.reviewedBy ?? '']])}
											</div>
											<div class="mt-6">
												<p class="text-[11px] font-semibold tracking-[0.1em] text-muted-foreground uppercase">Team members · {r.members.length}</p>
												<ul class="mt-2 grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
													{#each r.members as m, mi (mi)}
														<li class="rounded-md border border-border bg-card px-3 py-2 text-[13px]">
															<span class="font-mono text-[11px] text-muted-foreground">0{m.memberNumber}</span>
															<span class="font-medium">{m.name || '—'}</span>
															{#if m.memberNumber === 1}<span class="text-[11px] text-muted-foreground uppercase">Lead</span>{/if}
															<span class="block truncate text-muted-foreground">{m.admissionNumber}</span>
															<span class="block truncate text-muted-foreground">{m.email}</span>
														</li>
													{/each}
												</ul>
											</div>
											<div class="mt-6 flex flex-wrap items-center gap-2 border-t border-border pt-4">
												<Button size="sm" variant="outline" onclick={() => (editing = r)}><Pencil class="size-3.5" /> Edit</Button>
												{#if r.status === 'rejected'}
													<Button size="sm" variant="outline" loading={rowBusy === 'approved'} disabled={!!rowBusy} onclick={() => setStatus(r, 'approved')}><RotateCcw class="size-3.5" /> Restore</Button>
												{:else}
													<Button size="sm" variant="outline" class="text-destructive" loading={rowBusy === 'rejected'} disabled={!!rowBusy} onclick={() => setStatus(r, 'rejected')}><X class="size-3.5" /> Reject</Button>
												{/if}
												<Button size="sm" variant="ghost" class="ml-auto text-destructive hover:bg-red-50" onclick={() => (deleting = r)}><Trash2 class="size-3.5" /> Delete</Button>
											</div>
										</div>
									</div>
								</td>
							</tr>
						{/if}
					{/each}
				</tbody>
			</table>
		</div>

		<!-- Pagination -->
		<div class="flex flex-wrap items-center justify-between gap-3 border-t border-border px-4 py-3 text-[13px] text-muted-foreground">
			<span class="tabular">
				{pageIndex * pageSize + 1}–{Math.min(filtered.length, (pageIndex + 1) * pageSize)} of {filtered.length}
			</span>
			<div class="flex items-center gap-1">
				<Button size="sm" variant="outline" disabled={pageIndex === 0} onclick={() => pageIndex--} aria-label="Previous page"><ChevronLeft class="size-4" /></Button>
				<span class="px-2 tabular">Page {pageIndex + 1} / {pageCount}</span>
				<Button size="sm" variant="outline" disabled={pageIndex >= pageCount - 1} onclick={() => pageIndex++} aria-label="Next page"><ChevronRight class="size-4" /></Button>
			</div>
		</div>
	{/if}
</div>

<!-- Toast -->
<div class="pointer-events-none fixed right-4 bottom-4 z-50" aria-live="polite">
	{#if toast}
		<p
			class="pointer-events-auto rounded-md border px-4 py-2.5 text-sm shadow-lg {toast.tone === 'ok' ? 'border-border bg-forest-900 text-white' : 'border-red-200 bg-red-50 text-destructive'}"
			transition:fade={{ duration: 150 }}
		>{toast.text}</p>
	{/if}
</div>

<RegistrationEditModal registration={editing} onclose={() => (editing = null)} onsaved={(m) => notify(m)} />

<Modal open={!!deleting} title="Delete registration?" description={deleting ? referenceId(deleting.id) : ''} onclose={() => (deleting = null)}>
	<p class="text-sm text-muted-foreground">
		This permanently removes <span class="font-medium text-foreground">{deleting?.teamLeader.name}</span>'s team registration. It can't be undone.
		To keep a record, reject it instead.
	</p>
	{#snippet footer()}
		<Button variant="outline" onclick={() => (deleting = null)}>Cancel</Button>
		<Button variant="destructive" loading={deleteBusy} onclick={confirmDelete}>Delete</Button>
	{/snippet}
</Modal>
