<script lang="ts">
	import { Users, Code2, Presentation, Ban, BadgeCheck, CloudOff, RotateCcw, Inbox } from '@lucide/svelte';
	import { EVENT_IDS, EVENT_LABELS } from '$lib/config/site';
	import { registrations } from '$lib/stores/registrations.svelte';
	import { siteConfig } from '$lib/stores/site-config.svelte';
	import { formatTimestamp } from '$lib/utils/format';
	import PageHeader from '$lib/components/admin/PageHeader.svelte';
	import StatCard from '$lib/components/admin/StatCard.svelte';
	import StatusBadge from '$lib/components/ui/StatusBadge.svelte';
	import Button from '$lib/components/ui/Button.svelte';
	import Skeleton from '$lib/components/ui/Skeleton.svelte';
	import StateMessage from '$lib/components/ui/StateMessage.svelte';

	$effect(() => siteConfig.subscribe());

	const loading = $derived(registrations.status !== 'ready');
	const items = $derived(registrations.items);
	const byEvent = $derived(
		Object.fromEntries(
			EVENT_IDS.map((id) => {
				const list = items.filter((r) => r.event === id);
				return [
					id,
					{
						total: list.length,
						approved: list.filter((r) => r.status === 'approved').length,
						rejected: list.filter((r) => r.status === 'rejected').length,
						people: list.filter((r) => r.status !== 'rejected').reduce((n, r) => n + r.teamSize, 0)
					}
				];
			})
		) as Record<(typeof EVENT_IDS)[number], { total: number; approved: number; rejected: number; people: number }>
	);
	const rejected = $derived(items.filter((r) => r.status === 'rejected').length);
	const approved = $derived(items.filter((r) => r.status === 'approved').length);
	const last24h = $derived(items.filter((r) => Date.now() - r.createdAt < 86_400_000).length);
	const recent = $derived(items.slice(0, 8));

	const today = new Date().toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long' });
</script>

<svelte:head><title>Dashboard — ZenCode Admin</title></svelte:head>

<PageHeader eyebrow={today} title="Dashboard" description="Live registration activity across every event." />

{#if registrations.status === 'error'}
	<div class="rounded-lg border border-border bg-card">
		<StateMessage tone="error" icon={CloudOff} title="Unable to load dashboard data." description="Check your connection, then retry.">
			<Button variant="outline" onclick={() => registrations.retry()}><RotateCcw class="size-4" /> Retry</Button>
		</StateMessage>
	</div>
{:else}
	<div class="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
		<StatCard label="Total registrations" value={items.length} helper="{last24h} in the last 24 hours" icon={Users} {loading} />
		<StatCard label="Hackathon" value={byEvent.hackathon.total} helper="{byEvent.hackathon.people} people" icon={Code2} {loading} href="/admin/hackathon" />
		<StatCard label="Pitch Fest" value={byEvent['pitch-fest'].total} helper="{byEvent['pitch-fest'].people} people" icon={Presentation} {loading} href="/admin/pitch-fest" />
		<StatCard label="Active teams" value={approved} helper="Auto-approved on registration" icon={BadgeCheck} {loading} />
		<StatCard label="Rejected" value={rejected} helper="Removed by an organiser" icon={Ban} {loading} />
	</div>

	<div class="mt-6 grid gap-6 xl:grid-cols-[1.6fr_1fr]">
		<!-- Recent -->
		<section class="rounded-lg border border-border bg-card" aria-labelledby="recent-h">
			<header class="border-b border-border px-4 py-3">
				<h2 id="recent-h" class="text-[15px] font-semibold">Recent registrations</h2>
			</header>
			{#if loading}
				<ul class="divide-y divide-border">
					{#each Array(5) as _, i (i)}
						<li class="flex items-center gap-4 px-4 py-3"><Skeleton class="h-4 w-36" /><Skeleton class="h-4 w-20" /><Skeleton class="ml-auto h-5 w-20" /></li>
					{/each}
				</ul>
			{:else if !recent.length}
				<StateMessage icon={Inbox} title="No registrations yet" description="Share the registration page — new entries appear here instantly." />
			{:else}
				<ul class="divide-y divide-border">
					{#each recent as r (r.id)}
						<li class="grid grid-cols-[1fr_auto] items-center gap-x-4 gap-y-0.5 px-4 py-3 text-sm sm:grid-cols-[1fr_8rem_6rem_auto]">
							<span class="min-w-0">
								<span class="block truncate font-medium">{r.teamLeader.name || '—'}</span>
								<span class="block truncate text-xs text-muted-foreground">{r.teamLeader.classSection} · {r.teamSize} members</span>
							</span>
							<span class="hidden text-muted-foreground sm:block">{EVENT_LABELS[r.event]}</span>
							<span class="hidden text-xs text-muted-foreground tabular sm:block">{formatTimestamp(r.createdAt)}</span>
							<StatusBadge status={r.status} />
						</li>
					{/each}
				</ul>
			{/if}
		</section>

		<!-- Event breakdown -->
		<section class="rounded-lg border border-border bg-card" aria-labelledby="events-h">
			<header class="border-b border-border px-4 py-3">
				<h2 id="events-h" class="text-[15px] font-semibold">Events</h2>
			</header>
			<ul class="divide-y divide-border">
				{#each EVENT_IDS as id (id)}
					{@const s = byEvent[id]}
					{@const cfg = siteConfig.value.events[id]}
					<li class="p-4">
						<div class="flex items-center justify-between gap-3">
							<a href="/admin/{id}" class="font-medium hover:underline">{EVENT_LABELS[id]}</a>
							<span class="inline-flex items-center gap-1.5 text-xs font-medium {cfg.registrationOpen ? 'text-forest-700' : 'text-muted-foreground'}">
								<span class="size-1.5 rounded-full {cfg.registrationOpen ? 'bg-brand' : 'bg-muted-foreground/50'}"></span>
								{cfg.registrationOpen ? 'Registration open' : 'Registration closed'}
							</span>
						</div>
						<dl class="mt-3 grid grid-cols-3 gap-2 text-center">
							{#each [['Teams', s.total], ['Active', s.approved], ['Rejected', s.rejected]] as [k, v] (k)}
								<div class="rounded-md bg-muted px-2 py-2">
									<dt class="text-[11px] text-muted-foreground">{k}</dt>
									<dd class="text-lg font-semibold tabular">{loading ? '–' : v}</dd>
								</div>
							{/each}
						</dl>
					</li>
				{/each}
			</ul>
		</section>
	</div>
{/if}
