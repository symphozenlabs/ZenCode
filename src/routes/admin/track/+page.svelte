<script lang="ts">
	import { onMount } from 'svelte';
	import { fade } from 'svelte/transition';
	import {
		Search,
		Send,
		RefreshCw,
		ChevronLeft,
		ChevronRight,
		CloudOff,
		RotateCcw,
		Inbox,
		SearchX,
		Info
	} from '@lucide/svelte';
	import { EVENT_LABELS, type EventId } from '$lib/config/site';
	import { EVENT_NAME, passRecipients, referenceId, teamLabel, type Registration } from '$lib/registrations/model';
	import { registrations } from '$lib/stores/registrations.svelte';
	import { idToken } from '$lib/live/admin-api';
	import { formatTimestamp } from '$lib/utils/format';
	import PageHeader from '$lib/components/admin/PageHeader.svelte';
	import StatCard from '$lib/components/admin/StatCard.svelte';
	import Button from '$lib/components/ui/Button.svelte';
	import Skeleton from '$lib/components/ui/Skeleton.svelte';
	import StateMessage from '$lib/components/ui/StateMessage.svelte';
	import Modal from '$lib/components/ui/Modal.svelte';

	type MailStatus = 'delivered' | 'sent' | 'failed' | 'not-sent';
	type StatusFilter = MailStatus | 'all';
	type EventFilter = EventId | 'all';

	interface ResendEmail {
		email: string;
		event: string;
		id: string;
		lastEvent: string;
		createdAt: string;
	}

	interface Row {
		key: string;
		team: Registration;
		email: string;
		name: string;
		status: MailStatus;
		detail: string;
		lastAt: number;
	}

	const pageSize = 25;

	let search = $state('');
	let eventFilter = $state<EventFilter>('all');
	let statusFilter = $state<StatusFilter>('all');
	let pageIndex = $state(0);
	let busy = $state<Record<string, boolean>>({});
	let toast = $state<{ text: string; tone: 'ok' | 'error' } | null>(null);

	// Delivery state from Resend's log (may be unavailable with a send-only key).
	let resend = $state<{ status: 'loading' | 'ready' | 'error'; available: boolean; message: string; byKey: Map<string, ResendEmail> }>({
		status: 'loading',
		available: false,
		message: '',
		byKey: new Map()
	});

	let bulkOpen = $state(false);
	let bulk = $state<{ done: number; total: number } | null>(null);

	async function api<T>(method: 'GET' | 'POST', body?: unknown): Promise<T> {
		const res = await fetch('/api/admin/registrations/email', {
			method,
			headers: {
				authorization: `Bearer ${await idToken()}`,
				...(body !== undefined ? { 'content-type': 'application/json' } : {})
			},
			body: body !== undefined ? JSON.stringify(body) : undefined
		});
		const data = await res.json().catch(() => null);
		if (!res.ok) throw new Error(data?.message ?? 'Something went wrong. Please try again.');
		return data as T;
	}

	async function loadResend() {
		resend.status = 'loading';
		try {
			const data = await api<{ available: boolean; message?: string; emails: ResendEmail[] }>('GET');
			resend = {
				status: 'ready',
				available: data.available,
				message: data.message ?? '',
				byKey: new Map(data.emails.map((e) => [`${e.event}|${e.email}`, e]))
			};
		} catch (err) {
			resend = { status: 'error', available: false, message: (err as Error).message, byKey: new Map() };
		}
	}

	onMount(loadResend);

	const DELIVERED = new Set(['delivered', 'opened', 'clicked']);
	const BOUNCED = new Set(['bounced', 'failed', 'suppressed', 'complained', 'canceled']);
	const resendTime = (s: string) => {
		const ms = Date.parse(s.replace(' ', 'T').replace(/\+00$/, 'Z'));
		return Number.isNaN(ms) ? 0 : ms;
	};

	function classify(team: Registration, email: string): Pick<Row, 'status' | 'detail' | 'lastAt'> {
		const log = resend.byKey.get(`${EVENT_NAME[team.event]}|${email}`);
		const recorded = team.emailDelivery.find((e) => e.email === email);
		const logAt = log ? resendTime(log.createdAt) : 0;

		// A send attempt that failed after Resend's latest email is the newer news.
		if (recorded?.status === 'failed' && (!log || recorded.lastAttemptAt > logAt)) {
			return { status: 'failed', detail: recorded.error || 'Send failed', lastAt: recorded.lastAttemptAt };
		}
		if (log) {
			if (DELIVERED.has(log.lastEvent)) return { status: 'delivered', detail: log.lastEvent === 'delivered' ? 'Delivered' : `Delivered · ${log.lastEvent}`, lastAt: logAt };
			if (BOUNCED.has(log.lastEvent)) return { status: 'failed', detail: `Email ${log.lastEvent}`, lastAt: logAt };
			return { status: 'sent', detail: log.lastEvent === 'delivery_delayed' ? 'Delivery delayed' : 'Accepted by Resend', lastAt: logAt };
		}
		if (recorded?.status === 'sent') return { status: 'sent', detail: 'Accepted by Resend', lastAt: recorded.lastAttemptAt };
		return { status: 'not-sent', detail: 'No email on record', lastAt: 0 };
	}

	// One row per recipient of every active team.
	const allRows = $derived.by(() => {
		const out: Row[] = [];
		for (const team of registrations.items) {
			if (team.status === 'rejected') continue;
			for (const p of passRecipients(team)) {
				out.push({ key: `${team.id}|${p.email}`, team, email: p.email, name: p.name, ...classify(team, p.email) });
			}
		}
		return out;
	});

	const scoped = $derived(allRows.filter((r) => eventFilter === 'all' || r.team.event === eventFilter));

	const counts = $derived({
		all: scoped.length,
		delivered: scoped.filter((r) => r.status === 'delivered').length,
		sent: scoped.filter((r) => r.status === 'sent').length,
		failed: scoped.filter((r) => r.status === 'failed').length,
		'not-sent': scoped.filter((r) => r.status === 'not-sent').length
	});

	const filtered = $derived.by(() => {
		const q = search.trim().toLowerCase();
		const order: Record<MailStatus, number> = { failed: 0, 'not-sent': 1, sent: 2, delivered: 3 };
		return scoped
			.filter((r) => statusFilter === 'all' || r.status === statusFilter)
			.filter((r) => !q || [r.name, r.email, r.team.teamName, r.team.teamLeader.name, referenceId(r.team.id)].join(' ').toLowerCase().includes(q))
			.sort((a, b) => order[a.status] - order[b.status] || b.team.createdAt - a.team.createdAt);
	});

	const pageCount = $derived(Math.max(1, Math.ceil(filtered.length / pageSize)));
	const rows = $derived(filtered.slice(pageIndex * pageSize, pageIndex * pageSize + pageSize));

	$effect(() => {
		search;
		eventFilter;
		statusFilter;
		pageIndex = 0;
	});
	$effect(() => {
		if (pageIndex > pageCount - 1) pageIndex = pageCount - 1;
	});

	/** Everyone in the current event filter who still needs their pass. */
	const pending = $derived(scoped.filter((r) => r.status === 'failed' || r.status === 'not-sent'));

	function notify(text: string, tone: 'ok' | 'error' = 'ok') {
		toast = { text, tone };
		const current = toast;
		setTimeout(() => {
			if (toast === current) toast = null;
		}, 3600);
	}

	interface SendResult {
		results: { memberEmail: string; status: 'sent' | 'failed'; error: string | null }[];
	}

	async function sendTo(team: Registration, emails: string[]) {
		const res = await api<SendResult>('POST', { event: team.event, teamId: team.id, emails });
		return res.results;
	}

	async function resendOne(r: Row) {
		busy = { ...busy, [r.key]: true };
		try {
			const [result] = await sendTo(r.team, [r.email]);
			if (result?.status === 'sent') notify(`Pass sent to ${r.email}`);
			else notify(`Couldn't send to ${r.email}: ${result?.error ?? 'unknown error'}`, 'error');
		} catch (err) {
			notify((err as Error).message, 'error');
		} finally {
			const { [r.key]: _, ...rest } = busy;
			busy = rest;
		}
	}

	async function resendPending() {
		const byTeam = new Map<string, { team: Registration; emails: string[] }>();
		for (const r of pending) {
			const entry = byTeam.get(r.team.id) ?? { team: r.team, emails: [] };
			entry.emails.push(r.email);
			byTeam.set(r.team.id, entry);
		}
		bulk = { done: 0, total: pending.length };
		let sent = 0;
		let failed = 0;
		try {
			// One team at a time; the server paces the individual emails.
			for (const { team, emails } of byTeam.values()) {
				try {
					const results = await sendTo(team, emails);
					sent += results.filter((x) => x.status === 'sent').length;
					failed += results.filter((x) => x.status !== 'sent').length;
				} catch {
					failed += emails.length;
				}
				bulk = { done: bulk!.done + emails.length, total: bulk!.total };
			}
		} finally {
			bulk = null;
			bulkOpen = false;
		}
		notify(failed ? `Sent ${sent}, ${failed} still failing.` : `Sent ${sent} pass${sent === 1 ? '' : 'es'}.`, failed ? 'error' : 'ok');
		loadResend();
	}

	const statusStyles: Record<MailStatus, { label: string; cls: string; dot: string }> = {
		delivered: { label: 'Delivered', cls: 'border-emerald-200 bg-emerald-50 text-emerald-800', dot: 'bg-emerald-500' },
		sent: { label: 'Sent', cls: 'border-sky-200 bg-sky-50 text-sky-800', dot: 'bg-sky-500' },
		failed: { label: 'Failed', cls: 'border-red-200 bg-red-50 text-red-800', dot: 'bg-red-500' },
		'not-sent': { label: 'Not sent', cls: 'border-amber-200 bg-amber-50 text-amber-800', dot: 'bg-amber-500' }
	};

	const statusTabs: { id: StatusFilter; label: string }[] = [
		{ id: 'all', label: 'All' },
		{ id: 'failed', label: 'Failed' },
		{ id: 'not-sent', label: 'Not sent' },
		{ id: 'sent', label: 'Sent' },
		{ id: 'delivered', label: 'Delivered' }
	];
	const eventTabs: { id: EventFilter; label: string }[] = [
		{ id: 'all', label: 'All events' },
		{ id: 'hackathon', label: 'Hackathon' },
		{ id: 'pitch-fest', label: 'Pitch Fest' }
	];

	const loading = $derived(registrations.status !== 'ready');
</script>

<svelte:head><title>Track — ZenCode Admin</title></svelte:head>

<PageHeader eyebrow="Registrations" title="Track" description="See who received their check-in pass email, and resend to anyone who didn't.">
	{#snippet actions()}
		<Button variant="outline" onclick={loadResend} loading={resend.status === 'loading'}>
			{#if resend.status !== 'loading'}<RefreshCw class="size-4" />{/if} Refresh status
		</Button>
		<Button onclick={() => (bulkOpen = true)} disabled={!pending.length || !!bulk || loading}>
			<Send class="size-4" /> Resend to {pending.length} pending
		</Button>
	{/snippet}
</PageHeader>

<div class="mb-6 grid grid-cols-2 gap-3 md:grid-cols-4">
	<StatCard label="Recipients" value={counts.all} helper="Members of active teams" {loading} />
	<StatCard label="Delivered" value={counts.delivered + counts.sent} helper="{counts.sent} accepted, awaiting delivery" {loading} />
	<StatCard label="Failed" value={counts.failed} {loading} />
	<StatCard label="Not sent" value={counts['not-sent']} {loading} />
</div>

{#if resend.status !== 'loading' && !resend.available}
	<div class="mb-4 flex gap-3 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
		<Info class="mt-0.5 size-4 shrink-0" />
		<p>
			Couldn't read delivery status from Resend: {resend.message || 'unknown error'}
			Showing the send results this site recorded instead. Teams registered before tracking was added show as "Not sent".
		</p>
	</div>
{/if}

<div class="rounded-lg border border-border bg-card">
	<div class="flex flex-col gap-3 border-b border-border p-3 md:flex-row md:items-center">
		<div class="relative md:w-80">
			<Search class="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
			<label for="track-search" class="sr-only">Search recipients</label>
			<input
				id="track-search"
				type="search"
				bind:value={search}
				placeholder="Search name, email, team…"
				class="h-9 w-full rounded-md border border-input bg-muted pr-3 pl-9 text-sm outline-none transition-[border-color,box-shadow] duration-150 focus:border-ring focus:bg-card focus:ring-3 focus:ring-ring/20"
			/>
		</div>
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
	</div>

	<div class="flex gap-1 overflow-x-auto border-b border-border px-3" role="tablist" aria-label="Filter by email status">
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
	{:else if loading}
		<div class="divide-y divide-border" aria-busy="true" aria-label="Loading recipients">
			{#each Array(6) as _, i (i)}
				<div class="flex items-center gap-4 px-4 py-3.5">
					<Skeleton class="h-4 w-48" /><Skeleton class="hidden h-4 w-32 md:block" /><Skeleton class="h-5 w-20" /><Skeleton class="ml-auto h-8 w-20" />
				</div>
			{/each}
		</div>
	{:else if !scoped.length}
		<StateMessage icon={Inbox} title="No recipients yet" description="Members of registered teams will appear here." />
	{:else if !filtered.length}
		<StateMessage icon={SearchX} title="No matches" description="Nothing matches these filters.">
			<Button variant="outline" onclick={() => { search = ''; statusFilter = 'all'; eventFilter = 'all'; }}>Clear filters</Button>
		</StateMessage>
	{:else}
		<div class="overflow-x-auto">
			<table class="w-full text-sm">
				<thead class="bg-secondary/60 text-[12px] text-muted-foreground">
					<tr>
						<th scope="col" class="px-4 py-2.5 text-left font-medium">Participant</th>
						<th scope="col" class="hidden px-3 py-2.5 text-left font-medium md:table-cell">Team</th>
						<th scope="col" class="hidden px-3 py-2.5 text-left font-medium lg:table-cell">Event</th>
						<th scope="col" class="px-3 py-2.5 text-left font-medium">Email status</th>
						<th scope="col" class="hidden px-3 py-2.5 text-left font-medium sm:table-cell">Last sent</th>
						<th scope="col" class="px-3 py-2.5 text-right font-medium"><span class="sr-only">Actions</span></th>
					</tr>
				</thead>
				<tbody>
					{#each rows as r (r.key)}
						{@const s = statusStyles[r.status]}
						<tr class="border-t border-border transition-colors duration-150 hover:bg-muted/50">
							<td class="px-4 py-2.5">
								<span class="block font-medium text-foreground">{r.name || '—'}</span>
								<span class="block break-all text-xs text-muted-foreground">{r.email}</span>
							</td>
							<td class="hidden px-3 py-2.5 md:table-cell">
								<span class="block text-foreground">{teamLabel(r.team)}</span>
								<span class="block font-mono text-[11px] text-muted-foreground">{referenceId(r.team.id)}</span>
							</td>
							<td class="hidden px-3 py-2.5 text-foreground lg:table-cell">{EVENT_LABELS[r.team.event]}</td>
							<td class="px-3 py-2.5">
								<span class="inline-flex min-h-6 items-center gap-1.5 rounded-md border px-2 text-xs font-medium {s.cls}">
									<span class="size-1.5 rounded-full {s.dot}" aria-hidden="true"></span>{s.label}
								</span>
								<span class="mt-0.5 block max-w-64 truncate text-[11px] text-muted-foreground" title={r.detail}>{r.detail}</span>
							</td>
							<td class="hidden px-3 py-2.5 text-muted-foreground tabular sm:table-cell">{formatTimestamp(r.lastAt, true)}</td>
							<td class="px-3 py-2.5">
								<div class="flex justify-end">
									<Button
										size="sm"
										variant={r.status === 'failed' || r.status === 'not-sent' ? 'outline' : 'ghost'}
										loading={busy[r.key]}
										disabled={busy[r.key] || !!bulk}
										onclick={() => resendOne(r)}
										aria-label="Resend pass to {r.email}"
									>
										{#if !busy[r.key]}<Send class="size-3.5" />{/if}
										<span class="hidden sm:inline">{r.status === 'failed' || r.status === 'not-sent' ? 'Send' : 'Resend'}</span>
									</Button>
								</div>
							</td>
						</tr>
					{/each}
				</tbody>
			</table>
		</div>

		<div class="flex flex-wrap items-center justify-between gap-3 border-t border-border px-4 py-3 text-[13px] text-muted-foreground">
			<span class="tabular">{pageIndex * pageSize + 1}–{Math.min(filtered.length, (pageIndex + 1) * pageSize)} of {filtered.length}</span>
			<div class="flex items-center gap-1">
				<Button size="sm" variant="outline" disabled={pageIndex === 0} onclick={() => pageIndex--} aria-label="Previous page"><ChevronLeft class="size-4" /></Button>
				<span class="px-2 tabular">Page {pageIndex + 1} / {pageCount}</span>
				<Button size="sm" variant="outline" disabled={pageIndex >= pageCount - 1} onclick={() => pageIndex++} aria-label="Next page"><ChevronRight class="size-4" /></Button>
			</div>
		</div>
	{/if}
</div>

<div class="pointer-events-none fixed right-4 bottom-4 z-50" aria-live="polite">
	{#if toast}
		<p
			class="pointer-events-auto max-w-md rounded-md border px-4 py-2.5 text-sm shadow-lg {toast.tone === 'ok' ? 'border-border bg-forest-900 text-white' : 'border-red-200 bg-red-50 text-destructive'}"
			transition:fade={{ duration: 150 }}
		>{toast.text}</p>
	{/if}
</div>

<Modal
	open={bulkOpen}
	title="Resend pending passes?"
	description="{pending.length} recipient{pending.length === 1 ? '' : 's'}{eventFilter === 'all' ? '' : ` · ${EVENT_LABELS[eventFilter]}`}"
	onclose={() => { if (!bulk) bulkOpen = false; }}
>
	<p class="text-sm text-muted-foreground">
		Everyone marked Failed or Not sent gets their check-in pass again{eventFilter !== 'pitch-fest' ? ', with the hackathon template for hackathon teams' : ''}.
		Emails go out a couple per second, so a long list takes a while. Keep this page open until it finishes.
	</p>
	{#if bulk}
		<div class="mt-4">
			<div class="h-2 overflow-hidden rounded-full bg-muted">
				<div class="h-full bg-primary transition-[width] duration-300" style="width: {(bulk.done / Math.max(1, bulk.total)) * 100}%"></div>
			</div>
			<p class="mt-2 text-xs text-muted-foreground tabular">{bulk.done} of {bulk.total} processed…</p>
		</div>
	{/if}
	{#snippet footer()}
		<Button variant="outline" disabled={!!bulk} onclick={() => (bulkOpen = false)}>Cancel</Button>
		<Button loading={!!bulk} onclick={resendPending}>Send {pending.length}</Button>
	{/snippet}
</Modal>
