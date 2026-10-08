<script lang="ts">
	import { EVENT_IDS } from '$lib/config/site';
	import { reveal } from '$lib/actions/reveal';
	import PageHero from '$lib/components/site/PageHero.svelte';

	let { data } = $props();
	const config = $derived(data.config);

	const sections = $derived([
		{ id: 'general', title: 'General', rules: config.generalRules },
		...EVENT_IDS.map((id) => ({ id, title: config.events[id].title, rules: config.events[id].rules }))
	]);
</script>

<svelte:head><title>Rules — {config.name}</title></svelte:head>

<PageHero eyebrow="Rules" title="Play fair. Build boldly." description="The ground rules for every participant and team." />

<section class="py-16 md:py-20">
	<div class="shell grid gap-12 lg:grid-cols-[14rem_1fr]">
		<nav aria-label="Rule sections" class="hidden lg:block">
			<ul class="sticky top-24 space-y-1 border-l border-line">
				{#each sections as s (s.id)}
					<li>
						<a href="#{s.id}" class="-ml-px block border-l-2 border-transparent py-1.5 pl-4 text-sm text-muted-foreground hover:border-forest-700 hover:text-forest-950">{s.title}</a>
					</li>
				{/each}
			</ul>
		</nav>
		<div class="space-y-16">
			{#each sections as s (s.id)}
				<section id={s.id} use:reveal class="scroll-mt-24">
					<h2 class="font-display text-3xl font-semibold tracking-tight text-forest-950">{s.title}</h2>
					{#if s.rules.length}
						<ol class="mt-6 divide-y divide-line border-y border-line">
							{#each s.rules as rule, i (i)}
								<li class="grid grid-cols-[3rem_1fr] py-4 text-[16px] leading-relaxed text-ink">
									<span class="font-mono text-sm leading-7 text-forest-700">{String(i + 1).padStart(2, '0')}</span>
									<span>{rule}</span>
								</li>
							{/each}
						</ol>
					{:else}
						<p class="mt-4 text-muted-foreground">Rules for this section will be published before the event.</p>
					{/if}
				</section>
			{/each}
		</div>
	</div>
</section>
