<script lang="ts">
	import { ArrowRight, ArrowUpRight, UserPlus, BadgeCheck, Hammer, Mic } from '@lucide/svelte';
	import { EVENT_IDS, type EventId } from '$lib/config/site';
	import { formatDateRange, TBA } from '$lib/utils/format';
	import { reveal } from '$lib/actions/reveal';
	import Button from '$lib/components/ui/Button.svelte';
	import AnimatedGrid from '$lib/components/motion/AnimatedGrid.svelte';
	import GlowBackground from '$lib/components/motion/GlowBackground.svelte';
	import NoiseOverlay from '$lib/components/motion/NoiseOverlay.svelte';
	import ParticleField from '$lib/components/motion/ParticleField.svelte';
	import FloatingShapes from '$lib/components/motion/FloatingShapes.svelte';
	import GradientOrb from '$lib/components/motion/GradientOrb.svelte';

	let { data } = $props();
	const config = $derived(data.config);

	const words = ['CODE.', 'CREATE.', 'COMPETE.'];

	const eventHref: Record<EventId, string> = { hackathon: '/hackathon', 'pitch-fest': '/pitch-fest' };
	const teamLabel = (min: number, max: number) =>
		max <= 1 ? 'Solo' : min === max ? `${min} per team` : `${min}–${max} per team`;

	const steps = [
		{ icon: UserPlus, title: 'Register', body: 'Pick an event and sign up with your team in a few minutes.' },
		{ icon: BadgeCheck, title: "You're in", body: 'Your team is confirmed as soon as the form is submitted.' },
		{ icon: Hammer, title: 'Build', body: 'Show up, plug in and turn the idea into something that works.' },
		{ icon: Mic, title: 'Demo & pitch', body: 'Take the stage, show what you made and answer the panel.' }
	];

	const venue = $derived([config.venue, config.city].filter(Boolean).join(', ') || TBA);
	const regStatus = $derived(
		EVENT_IDS.some((id) => config.events[id].registrationOpen) ? 'Open now' : 'Closed'
	);
</script>

<svelte:head>
	<title>{config.name} — {config.tagline}</title>
	<meta name="description" content="{config.name}: Hackathon and Pitch Fest. {config.tagline}" />
</svelte:head>

<!-- HERO -->
<section class="relative isolate overflow-hidden bg-stage pt-16 text-cream">
	<AnimatedGrid />
	<GlowBackground />
	<ParticleField count={40} />
	<FloatingShapes />
	<NoiseOverlay />

	<div class="shell relative grid min-h-[calc(100dvh-4rem)] items-center gap-14 py-16 lg:grid-cols-[1.35fr_1fr]">
		<div>
			<p class="eyebrow rise flex items-center gap-2 text-sun">
				<span class="size-1.5 animate-pulse-dot rounded-full bg-sun"></span>
				{config.name}{config.edition ? ` ${config.edition}` : ''}
			</p>
			<h1
				class="mt-6 font-display text-[clamp(3.4rem,11vw,8.5rem)] leading-[0.88] font-bold tracking-[-0.03em]"
				aria-label="Code. Create. Compete."
			>
				{#each words as w, i (w)}
					<span
						class="rise block {i === 2 ? 'text-sun' : ''}"
						style="--rise-delay: {120 + i * 130}ms"
						aria-hidden="true">{w}</span
					>
				{/each}
			</h1>
			<p class="rise mt-8 font-mono text-sm tracking-[0.2em] text-cream/60 uppercase" style="--rise-delay: 560ms">
				Hackathon <span class="text-green-300">•</span> Pitch Fest
			</p>
			<div class="rise mt-10 flex flex-wrap gap-3" style="--rise-delay: 680ms">
				<Button href="/register" variant="sun" size="xl">Register now <ArrowRight class="size-4" /></Button>
				<Button href="#events" variant="stage" size="xl">Explore events</Button>
			</div>
		</div>

		<!-- Terminal card: live facts from config, never invented -->
		<div class="rise hidden lg:block" style="--rise-delay: 820ms">
			<div class="overflow-hidden rounded-lg border border-stage-line bg-stage-raised/80 shadow-2xl shadow-black/40">
				<div class="flex items-center gap-2 border-b border-stage-line px-4 py-3">
					<span class="size-2.5 rounded-full bg-cream/15"></span>
					<span class="size-2.5 rounded-full bg-cream/15"></span>
					<span class="size-2.5 rounded-full bg-cream/15"></span>
					<span class="ml-3 font-mono text-xs text-cream/40">zencode — events</span>
				</div>
				<div class="space-y-4 p-5 font-mono text-[13px] leading-relaxed">
					<p class="text-cream/50"><span class="text-green-300">$</span> zencode --list-events</p>
					{#each EVENT_IDS as id (id)}
						{@const ev = config.events[id]}
						<div class="border-l-2 border-green-300/40 pl-3">
							<p class="text-cream">{ev.title}</p>
							<p class="text-cream/50">date&nbsp;&nbsp;&nbsp;{formatDateRange(ev.startDate, ev.endDate)}</p>
							<p class="text-cream/50">team&nbsp;&nbsp;&nbsp;{teamLabel(ev.teamMin, ev.teamMax)}</p>
							<p class={ev.registrationOpen ? 'text-green-300' : 'text-attention'}>
								status {ev.registrationOpen ? 'registration open' : 'registration closed'}
							</p>
						</div>
					{/each}
					<p class="text-cream/50">
						<span class="text-green-300">$</span> venue: <span class="text-cream/80">{venue}</span><span
							class="ml-1 inline-block h-4 w-2 translate-y-0.5 animate-pulse-dot bg-sun"
						></span>
					</p>
				</div>
			</div>
		</div>
	</div>
</section>

<!-- FACT STRIP -->
<section class="border-b border-line bg-cream-dark">
	<dl class="shell grid grid-cols-2 divide-line md:grid-cols-4 md:divide-x">
		{#each [{ k: 'Hackathon', v: formatDateRange(config.events.hackathon.startDate, config.events.hackathon.endDate) }, { k: 'Pitch Fest', v: formatDateRange(config.events['pitch-fest'].startDate, config.events['pitch-fest'].endDate) }, { k: 'Venue', v: venue }, { k: 'Registration', v: regStatus }] as f (f.k)}
			<div class="px-0 py-6 md:px-6 md:first:pl-0">
				<dt class="eyebrow text-muted-foreground">{f.k}</dt>
				<dd class="mt-1.5 font-display text-lg font-medium text-forest-950">{f.v}</dd>
			</div>
		{/each}
	</dl>
</section>

<!-- EVENTS -->
<section id="events" class="scroll-mt-16 py-24 md:py-28">
	<div class="shell">
		<div use:reveal class="flex flex-wrap items-end justify-between gap-6">
			<div>
				<p class="eyebrow text-forest-700">The events</p>
				<h2 class="mt-3 max-w-xl font-display text-4xl font-semibold tracking-tight text-forest-950 md:text-6xl">
					Two stages. Build it, then pitch it.
				</h2>
			</div>
		</div>

		<div class="mt-14 grid gap-px overflow-hidden rounded-lg border border-line bg-line md:grid-cols-2">
			{#each EVENT_IDS as id, i (id)}
				{@const ev = config.events[id]}
				<a
					href={eventHref[id]}
					use:reveal={{ delay: i * 100 }}
					class="group relative flex flex-col bg-cream p-8 transition-colors duration-200 hover:bg-white md:p-10"
				>
					<div class="flex items-start justify-between">
						<span class="font-mono text-sm text-forest-700">0{i + 1}</span>
						<ArrowUpRight
							class="size-6 text-forest-700 transition-transform duration-200 group-hover:translate-x-1 group-hover:-translate-y-1"
						/>
					</div>
					<h3 class="mt-16 font-display text-4xl font-semibold tracking-tight text-forest-950 md:text-5xl">
						{ev.title}
					</h3>
					<p class="mt-4 max-w-md text-[17px] leading-relaxed text-muted-foreground">{ev.summary}</p>
					<dl class="mt-10 grid grid-cols-3 gap-4 border-t border-line pt-6 text-sm">
						<div>
							<dt class="eyebrow text-muted-foreground">Date</dt>
							<dd class="mt-1 font-medium text-forest-950">{formatDateRange(ev.startDate, ev.endDate)}</dd>
						</div>
						<div>
							<dt class="eyebrow text-muted-foreground">Team</dt>
							<dd class="mt-1 font-medium text-forest-950">{teamLabel(ev.teamMin, ev.teamMax)}</dd>
						</div>
						<div>
							<dt class="eyebrow text-muted-foreground">Entry</dt>
							<dd class="mt-1 font-medium {ev.registrationOpen ? 'text-forest-700' : 'text-destructive'}">
								{ev.registrationOpen ? 'Open' : 'Closed'}
							</dd>
						</div>
					</dl>
				</a>
			{/each}
		</div>
	</div>
</section>

<!-- HOW IT WORKS -->
<section class="relative overflow-hidden bg-forest-950 py-24 text-cream md:py-28">
	<AnimatedGrid animated={false} masked />
	<GradientOrb tone="sun" class="-bottom-40 -left-32" />
	<div class="shell relative">
		<div use:reveal>
			<p class="eyebrow text-sun">How it works</p>
			<h2 class="mt-3 max-w-xl font-display text-4xl font-semibold tracking-tight md:text-5xl">
				From sign-up to stage in four steps.
			</h2>
		</div>
		<ol class="mt-14 grid gap-10 sm:grid-cols-2 lg:grid-cols-4 lg:gap-8">
			{#each steps as s, i (s.title)}
				<li use:reveal={{ delay: i * 90 }} class="relative border-t border-green-300/25 pt-6">
					<span class="absolute -top-px left-0 h-px w-12 bg-sun"></span>
					<div class="flex items-center gap-3">
						<span class="font-mono text-xs text-sun">0{i + 1}</span>
						<s.icon class="size-5 text-green-300" />
					</div>
					<h3 class="mt-5 font-display text-2xl font-semibold">{s.title}</h3>
					<p class="mt-2 text-[15px] leading-relaxed text-cream/65">{s.body}</p>
				</li>
			{/each}
		</ol>
	</div>
</section>

<!-- SCHEDULE PREVIEW -->
<section class="py-24 md:py-28">
	<div class="shell grid gap-12 lg:grid-cols-[1fr_1.6fr]">
		<div use:reveal>
			<p class="eyebrow text-forest-700">Schedule</p>
			<h2 class="mt-3 font-display text-4xl font-semibold tracking-tight text-forest-950 md:text-5xl">
				What happens when.
			</h2>
			<Button href="/schedule" variant="outline" size="lg" class="mt-8">Full schedule <ArrowRight class="size-4" /></Button>
		</div>
		<div use:reveal={{ delay: 100 }}>
			{#if config.schedule.length}
				<ul class="divide-y divide-line border-y border-line">
					{#each config.schedule.slice(0, 5) as item (item.id)}
						<li class="grid grid-cols-[6.5rem_1fr] gap-4 py-5 sm:grid-cols-[9rem_1fr_auto]">
							<span class="font-mono text-sm text-forest-700 tabular">{item.day}<br />{item.time}</span>
							<span class="font-display text-lg font-medium text-forest-950">{item.title}</span>
							<span class="hidden text-sm text-muted-foreground sm:block">{item.location}</span>
						</li>
					{/each}
				</ul>
			{:else}
				<div class="rounded-lg border border-dashed border-forest-700/30 p-10 text-center">
					<p class="font-display text-xl text-forest-950">The schedule will be announced soon.</p>
					<p class="mt-2 text-muted-foreground">Register now and we'll share timings with registered teams.</p>
				</div>
			{/if}
		</div>
	</div>
</section>

{#if config.sponsors.length}
	<section class="border-t border-line bg-cream-dark py-16">
		<div class="shell">
			<p class="eyebrow text-center text-muted-foreground">Supported by</p>
			<ul class="mt-8 flex flex-wrap items-center justify-center gap-x-12 gap-y-6">
				{#each config.sponsors as s (s.name)}
					<li>
						{#if s.url}
							<a href={s.url} rel="noopener" target="_blank" class="font-display text-xl font-semibold text-forest-900/70 hover:text-forest-950">{s.name}</a>
						{:else}
							<span class="font-display text-xl font-semibold text-forest-900/70">{s.name}</span>
						{/if}
					</li>
				{/each}
			</ul>
		</div>
	</section>
{/if}
