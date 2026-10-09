<script lang="ts">
	import type { SiteConfig } from '$lib/config/site';
	import Logo from './Logo.svelte';
	import Button from '$lib/components/ui/Button.svelte';
	import AnimatedGrid from '$lib/components/motion/AnimatedGrid.svelte';

	let { config }: { config: SiteConfig } = $props();
	const year = new Date().getFullYear();
</script>

<footer class="relative overflow-hidden bg-stage text-cream">
	<section class="relative border-b border-stage-line">
		<AnimatedGrid animated={false} />
		<div class="shell relative flex flex-col items-start justify-between gap-8 py-16 md:flex-row md:items-end">
			<div>
				<p class="eyebrow text-sun">Registrations</p>
				<h2 class="mt-3 font-display text-3xl font-semibold tracking-tight md:text-4xl">
					Your team. Your idea.<br />Your stage.
				</h2>
			</div>
			<Button href="/register" variant="sun" size="xl">Register for {config.name}</Button>
		</div>
	</section>

	<div class="shell grid gap-10 py-12 md:grid-cols-[1.4fr_1fr_1fr]">
		<div>
			<Logo variant="full" class="w-40" />
			<p class="mt-4 max-w-xs text-sm text-cream/60">{config.tagline}</p>
		</div>
		<nav aria-label="Footer">
			<p class="eyebrow text-cream/40">Explore</p>
			<ul class="mt-4 space-y-2.5 text-sm text-cream/75">
				<li><a class="hover:text-sun" href="/hackathon">Hackathon</a></li>
				<li><a class="hover:text-sun" href="/pitch-fest">Pitch Fest</a></li>
				<li><a class="hover:text-sun" href="/schedule">Schedule</a></li>
				<li><a class="hover:text-sun" href="/rules">Rules</a></li>
			</ul>
		</nav>
		<div>
			<p class="eyebrow text-cream/40">Contact</p>
			<ul class="mt-4 space-y-2.5 text-sm text-cream/75">
				{#if config.contactEmail}
					<li><a class="hover:text-sun" href="mailto:{config.contactEmail}">{config.contactEmail}</a></li>
				{/if}
				{#if config.venue || config.city}
					<li>{[config.venue, config.city].filter(Boolean).join(', ')}</li>
				{/if}
				{#if config.organizers.length}
					<li class="text-cream/50">Organised by {config.organizers.join(', ')}</li>
				{/if}
				{#if !config.contactEmail && !config.venue && !config.organizers.length}
					<li class="text-cream/50">Details to be announced</li>
				{/if}
			</ul>
		</div>
	</div>

	<div class="border-t border-stage-line">
		<div class="shell flex flex-wrap items-center justify-between gap-3 py-5 font-mono text-xs text-cream/40">
			<span>© {year} {config.name}</span>
			<a href="/admin/login" class="hover:text-cream/70">Organiser login</a>
		</div>
	</div>
</footer>
