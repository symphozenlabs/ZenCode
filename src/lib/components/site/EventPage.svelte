<script lang="ts">
	import { ArrowRight, Trophy, Layers, ScrollText } from '@lucide/svelte';
	import type { EventId, SiteConfig } from '$lib/config/site';
	import { formatDate, formatDateRange, TBA } from '$lib/utils/format';
	import { reveal } from '$lib/actions/reveal';
	import Button from '$lib/components/ui/Button.svelte';
	import PageHero from './PageHero.svelte';

	let { config, eventId }: { config: SiteConfig; eventId: EventId } = $props();
	const ev = $derived(config.events[eventId]);
	const deadlinePassed = $derived(
		!!ev.registrationDeadline && Date.now() > new Date(`${ev.registrationDeadline}T23:59:59`).getTime()
	);
	const open = $derived(ev.registrationOpen && !deadlinePassed);

	const facts = $derived([
		{ k: 'Date', v: formatDateRange(ev.startDate, ev.endDate) },
		{ k: 'Duration', v: ev.duration || TBA },
		{
			k: 'Team size',
			v: ev.teamMax <= 1 ? 'Solo' : ev.teamMin === ev.teamMax ? `${ev.teamMin} people` : `${ev.teamMin}–${ev.teamMax} people`
		},
		{ k: 'Register by', v: formatDate(ev.registrationDeadline) || TBA },
		{ k: 'Venue', v: [config.venue, config.city].filter(Boolean).join(', ') || TBA }
	]);
</script>

<svelte:head>
	<title>{ev.title} — {config.name}</title>
	<meta name="description" content={ev.summary} />
</svelte:head>

<PageHero eyebrow="{config.name} · {ev.title}" title={ev.title} description={ev.summary}>
	{#if open}
		<Button href="/register?event={eventId}" variant="sun" size="xl">Register for {ev.title} <ArrowRight class="size-4" /></Button>
	{:else}
		<span class="inline-flex h-13 items-center rounded-md border border-attention/40 px-6 font-mono text-sm text-attention">
			Registration closed
		</span>
	{/if}
	<Button href="/rules" variant="stage" size="xl">Read the rules</Button>

	{#snippet aside()}
		<dl class="rise divide-y divide-stage-line rounded-lg border border-stage-line bg-stage-raised/70" style="--rise-delay: 200ms">
			{#each facts as f (f.k)}
				<div class="flex items-baseline justify-between gap-4 px-5 py-3.5">
					<dt class="eyebrow text-cream/45">{f.k}</dt>
					<dd class="text-right font-display text-[15px] font-medium text-cream">{f.v}</dd>
				</div>
			{/each}
		</dl>
	{/snippet}
</PageHero>

<section class="py-20 md:py-24">
	<div class="shell grid gap-12 lg:grid-cols-[1fr_1.5fr]">
		<p use:reveal class="eyebrow text-forest-700">About</p>
		<p use:reveal={{ delay: 80 }} class="font-display text-2xl leading-snug text-forest-950 md:text-3xl">{ev.description}</p>
	</div>
</section>

<section class="border-y border-line bg-cream-dark py-20 md:py-24">
	<div class="shell grid gap-px overflow-hidden rounded-lg border border-line bg-line lg:grid-cols-3">
		<div use:reveal class="bg-cream p-8">
			<Layers class="size-5 text-forest-700" />
			<h2 class="mt-5 font-display text-2xl font-semibold text-forest-950">Tracks</h2>
			{#if ev.tracks.length}
				<ul class="mt-5 space-y-2.5">
					{#each ev.tracks as t, i (t)}
						<li class="flex gap-3 text-[15px] text-ink">
							<span class="font-mono text-xs leading-6 text-forest-700">{String(i + 1).padStart(2, '0')}</span>{t}
						</li>
					{/each}
				</ul>
			{:else}
				<p class="mt-3 text-muted-foreground">Tracks will be announced.</p>
			{/if}
		</div>
		<div use:reveal={{ delay: 80 }} class="bg-cream p-8">
			<Trophy class="size-5 text-forest-700" />
			<h2 class="mt-5 font-display text-2xl font-semibold text-forest-950">Prizes</h2>
			{#if ev.prizes.length}
				<ul class="mt-5 divide-y divide-line">
					{#each ev.prizes as p (p.place)}
						<li class="flex items-baseline justify-between gap-4 py-2.5">
							<span class="eyebrow text-muted-foreground">{p.place}</span>
							<span class="text-right font-display font-medium text-forest-950">{p.reward}</span>
						</li>
					{/each}
				</ul>
			{:else}
				<p class="mt-3 text-muted-foreground">Prizes will be announced.</p>
			{/if}
		</div>
		<div use:reveal={{ delay: 160 }} class="bg-cream p-8">
			<ScrollText class="size-5 text-forest-700" />
			<h2 class="mt-5 font-display text-2xl font-semibold text-forest-950">Event rules</h2>
			{#if ev.rules.length}
				<ul class="mt-5 space-y-2.5 text-[15px] text-ink">
					{#each ev.rules.slice(0, 5) as r (r)}
						<li class="flex gap-3"><span class="mt-2.5 size-1 shrink-0 bg-forest-700"></span>{r}</li>
					{/each}
				</ul>
				<a href="/rules" class="mt-5 inline-flex items-center gap-1 text-sm font-medium text-forest-700 hover:underline"
					>All rules <ArrowRight class="size-3.5" /></a
				>
			{:else}
				<p class="mt-3 text-muted-foreground">Rules will be published before the event.</p>
			{/if}
		</div>
	</div>
</section>
