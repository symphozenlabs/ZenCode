<script lang="ts">
	import { EVENT_LABELS, type ScheduleItem } from '$lib/config/site';
	import { reveal } from '$lib/actions/reveal';
	import PageHero from '$lib/components/site/PageHero.svelte';

	let { data } = $props();
	const config = $derived(data.config);

	type Filter = 'all' | ScheduleItem['event'];
	let filter = $state<Filter>('all');

	const filters: { id: Filter; label: string }[] = [
		{ id: 'all', label: 'All' },
		{ id: 'hackathon', label: 'Hackathon' },
		{ id: 'pitch-fest', label: 'Pitch Fest' },
		{ id: 'general', label: 'General' }
	];

	const days = $derived.by(() => {
		const items = config.schedule.filter((s) => filter === 'all' || s.event === filter);
		const map = new Map<string, ScheduleItem[]>();
		for (const item of items) map.set(item.day, [...(map.get(item.day) ?? []), item]);
		return [...map.entries()];
	});

	const tag = (e: ScheduleItem['event']) => (e === 'general' ? 'General' : EVENT_LABELS[e]);
</script>

<svelte:head><title>Schedule — {config.name}</title></svelte:head>

<PageHero
	eyebrow="Schedule"
	title="The run of show."
	description="Every session, check-in and deadline across {config.name} in one place."
/>

<section class="py-16 md:py-20">
	<div class="shell">
		{#if config.schedule.length}
			<div class="flex flex-wrap gap-2" role="group" aria-label="Filter schedule">
				{#each filters as f (f.id)}
					<button
						type="button"
						aria-pressed={filter === f.id}
						onclick={() => (filter = f.id)}
						class="h-10 rounded-md border px-4 text-sm font-medium transition-colors duration-150
							{filter === f.id
							? 'border-forest-900 bg-forest-900 text-cream'
							: 'border-line bg-white text-ink hover:border-forest-700/40'}">{f.label}</button
					>
				{/each}
			</div>

			<div class="mt-12 space-y-14">
				{#each days as [day, items] (day)}
					<div use:reveal class="grid gap-6 lg:grid-cols-[14rem_1fr]">
						<h2 class="font-display text-2xl font-semibold text-forest-950 lg:sticky lg:top-24 lg:self-start">{day}</h2>
						<ol class="divide-y divide-line border-y border-line">
							{#each items as item (item.id)}
								<li class="grid gap-x-6 gap-y-1 py-5 sm:grid-cols-[7rem_1fr_auto] sm:items-baseline">
									<span class="font-mono text-sm text-forest-700 tabular">{item.time}</span>
									<span>
										<span class="block font-display text-lg font-medium text-forest-950">{item.title}</span>
										{#if item.location}<span class="text-sm text-muted-foreground">{item.location}</span>{/if}
									</span>
									<span class="eyebrow w-fit rounded-sm border border-line bg-cream-dark px-2 py-1 text-forest-800">{tag(item.event)}</span>
								</li>
							{/each}
						</ol>
					</div>
				{:else}
					<p class="text-muted-foreground">Nothing scheduled for this event yet.</p>
				{/each}
			</div>
		{:else}
			<div class="rounded-lg border border-dashed border-forest-700/30 p-12 text-center">
				<p class="font-display text-2xl text-forest-950">The schedule will be announced soon.</p>
				<p class="mt-2 text-muted-foreground">Approved teams will receive timings ahead of the event.</p>
			</div>
		{/if}
	</div>
</section>
