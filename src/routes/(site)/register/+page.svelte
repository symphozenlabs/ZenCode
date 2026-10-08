<script lang="ts">
	import { page } from '$app/state';
	import { onMount, tick } from 'svelte';
	import { fly, fade, scale, slide } from 'svelte/transition';
	import { ArrowLeft, ArrowRight, Check, Copy, Plus, Trash2, Pencil, Lock } from '@lucide/svelte';
	import { EVENT_IDS, isEventId, type EventId } from '$lib/config/site';
	import {
		ACADEMIC_YEARS,
		emptyRegistration,
		isSoloEvent,
		validateAcademic,
		validateEvent,
		validatePersonal,
		validateTeam,
		type Errors,
		type RegistrationInput
	} from '$lib/validation/registration';
	import { formatDateRange, formatTimestamp } from '$lib/utils/format';
	import Button from '$lib/components/ui/Button.svelte';
	import Field from '$lib/components/ui/Field.svelte';
	import SelectField from '$lib/components/ui/SelectField.svelte';
	import AnimatedGrid from '$lib/components/motion/AnimatedGrid.svelte';
	import GlowBackground from '$lib/components/motion/GlowBackground.svelte';
	import Spotlight from '$lib/components/motion/Spotlight.svelte';
	import ParticleField from '$lib/components/motion/ParticleField.svelte';

	let { data } = $props();
	const config = $derived(data.config);

	const STEPS = ['Personal', 'Academic', 'Event', 'Team', 'Review'] as const;
	const DRAFT_KEY = 'zencode:registration-draft';

	let form = $state<RegistrationInput>(emptyRegistration());
	let step = $state(0);
	let direction = $state(1);
	let errors = $state<Errors>({});
	let submitting = $state(false);
	let submitError = $state('');
	let result = $state<{ registrationId: string; createdAt: number; snapshot: RegistrationInput } | null>(null);
	let showDetails = $state(false);
	let copied = $state(false);
	let formEl = $state<HTMLElement>();

	const eventConfig = $derived(form.event ? config.events[form.event] : null);
	const solo = $derived(isSoloEvent(eventConfig));
	const maxMembers = $derived(eventConfig ? Math.max(0, eventConfig.teamMax - 1) : 0);

	onMount(() => {
		try {
			const saved = sessionStorage.getItem(DRAFT_KEY);
			if (saved) form = { ...emptyRegistration(), ...JSON.parse(saved) };
		} catch {
			/* storage unavailable — start fresh */
		}
		const pre = page.url.searchParams.get('event');
		if (isEventId(pre) && config.events[pre].registrationOpen) form.event = pre;
	});

	$effect(() => {
		const snapshot = JSON.stringify(form);
		if (result) return;
		try {
			sessionStorage.setItem(DRAFT_KEY, snapshot);
		} catch {
			/* ignore */
		}
	});

	// Keep the member list within the event's limits when the event changes.
	$effect(() => {
		if (!eventConfig) return;
		const minMembers = Math.max(0, eventConfig.teamMin - 1);
		if (form.team.members.length > maxMembers) form.team.members = form.team.members.slice(0, maxMembers);
		while (form.team.members.length < minMembers) form.team.members.push({ name: '', email: '' });
		if (eventConfig.tracks.length && !eventConfig.tracks.includes(form.team.track)) form.team.track = '';
	});

	function validateStep(i: number): Errors {
		switch (i) {
			case 0:
				return validatePersonal(form);
			case 1:
				return validateAcademic(form);
			case 2:
				return validateEvent(form, eventConfig);
			case 3:
				return validateTeam(form, eventConfig);
			default:
				return {};
		}
	}

	async function go(to: number) {
		direction = to > step ? 1 : -1;
		step = to;
		errors = {};
		submitError = '';
		await tick();
		formEl?.scrollIntoView({ behavior: 'smooth', block: 'start' });
	}

	async function next() {
		const e = validateStep(step);
		errors = e;
		if (Object.keys(e).length) {
			await tick();
			formEl?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus();
			return;
		}
		go(step + 1);
	}

	function stepForError(key: string) {
		if (key.startsWith('personal')) return 0;
		if (key.startsWith('academic')) return 1;
		if (key === 'event' || key === 'team.track') return 2;
		return 3;
	}

	async function submit() {
		submitting = true;
		submitError = '';
		try {
			const res = await fetch('/api/register', {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify(form)
			});
			const body = await res.json().catch(() => ({}));
			if (!res.ok || !body.ok) {
				if (body.errors && Object.keys(body.errors).length) {
					const first = Object.keys(body.errors)[0];
					await go(stepForError(first));
					errors = body.errors;
				}
				submitError = body.message ?? 'We could not save your registration. Please try again.';
				return;
			}
			result = { registrationId: body.registrationId, createdAt: body.createdAt, snapshot: $state.snapshot(form) };
			try {
				sessionStorage.removeItem(DRAFT_KEY);
			} catch {
				/* ignore */
			}
			window.scrollTo({ top: 0, behavior: 'smooth' });
		} catch {
			submitError = 'Network problem — check your connection and try again.';
		} finally {
			submitting = false;
		}
	}

	async function copyId() {
		if (!result) return;
		try {
			await navigator.clipboard.writeText(result.registrationId);
			copied = true;
			setTimeout(() => (copied = false), 1600);
		} catch {
			/* clipboard blocked */
		}
	}

	function selectEvent(id: EventId) {
		if (!config.events[id].registrationOpen) return;
		form.event = id;
		delete errors.event;
	}
</script>

<svelte:head><title>Register — {config.name}</title></svelte:head>

{#snippet summary(r: RegistrationInput)}
	{@const ev = r.event ? config.events[r.event] : null}
	<dl class="divide-y divide-line">
		{#each [{ title: 'Personal', step: 0, rows: [['Name', r.personal.name], ['Email', r.personal.email], ['Phone', r.personal.phone]] }, { title: 'Academic', step: 1, rows: [['College', r.academic.college], ['Department', r.academic.department], ['Year', r.academic.year]] }, { title: 'Event', step: 2, rows: [['Event', ev?.title ?? ''], ...(r.team.track ? [['Track', r.team.track]] : [])] }, { title: 'Team', step: 3, rows: [...(r.team.name ? [['Team name', r.team.name]] : []), ['Members', r.team.members.length ? r.team.members.map((m) => `${m.name} (${m.email})`).join('\n') : 'Solo']] }] as group (group.title)}
			<div class="grid gap-3 py-5 sm:grid-cols-[9rem_1fr_auto]">
				<dt class="eyebrow pt-0.5 text-forest-700">{group.title}</dt>
				<dd class="space-y-1.5">
					{#each group.rows as [k, v] (k)}
						<div class="grid grid-cols-[7rem_1fr] gap-3 text-[15px]">
							<span class="text-muted-foreground">{k}</span>
							<span class="break-words whitespace-pre-line text-ink">{v}</span>
						</div>
					{/each}
				</dd>
				{#if !result}
					<button
						type="button"
						class="inline-flex h-9 items-center gap-1.5 self-start rounded-md px-2 text-sm font-medium text-forest-700 hover:bg-cream-dark"
						onclick={() => go(group.step)}><Pencil class="size-3.5" /> Edit</button
					>
				{/if}
			</div>
		{/each}
	</dl>
{/snippet}

{#if result}
	<!-- COMPLETE -->
	<section class="relative isolate flex min-h-dvh items-center overflow-hidden bg-stage pt-16 text-cream" in:fade={{ duration: 200 }}>
		<AnimatedGrid />
		<Spotlight />
		<ParticleField count={28} links={false} />
		<div class="shell relative py-20 text-center">
			<div
				class="mx-auto grid size-20 place-items-center rounded-full border border-sun/50 bg-sun/10 text-sun shadow-[0_0_60px_-10px] shadow-sun/50"
				in:scale={{ duration: 420, start: 0.6, delay: 100 }}
			>
				<Check class="size-9" strokeWidth={2.5} />
			</div>
			<p class="eyebrow mt-10 text-sun" in:fly={{ y: 10, delay: 250, duration: 300 }}>Step 06 · Complete</p>
			<h1 class="mt-4 font-display text-5xl font-bold tracking-tight md:text-7xl" in:fly={{ y: 14, delay: 320, duration: 360 }}>
				Registration complete
			</h1>
			<p class="mt-5 text-lg text-cream/70" in:fly={{ y: 10, delay: 400, duration: 300 }}>
				Welcome to {config.name}, {result.snapshot.personal.name.split(' ')[0]}.
			</p>

			<div class="mx-auto mt-12 w-fit" in:fly={{ y: 10, delay: 500, duration: 300 }}>
				<p class="eyebrow text-cream/45">Registration ID</p>
				<div class="mt-3 flex items-center gap-2 rounded-lg border border-stage-line bg-stage-raised px-5 py-4">
					<span class="font-mono text-3xl font-semibold tracking-[0.12em] text-cream md:text-4xl">{result.registrationId}</span>
					<button
						type="button"
						onclick={copyId}
						class="ml-2 grid size-10 place-items-center rounded-md text-cream/60 hover:bg-white/5 hover:text-cream"
						aria-label="Copy registration ID"
					>
						{#if copied}<Check class="size-4 text-green-300" />{:else}<Copy class="size-4" />{/if}
					</button>
				</div>
				<p class="mt-3 text-sm text-cream/50" aria-live="polite">
					{copied ? 'Copied to clipboard' : 'Save this ID — organisers use it to find your entry.'}
				</p>
			</div>

			<div class="mt-10 flex flex-wrap justify-center gap-3" in:fly={{ y: 10, delay: 600, duration: 300 }}>
				<Button variant="sun" size="xl" onclick={() => (showDetails = !showDetails)} aria-expanded={showDetails}>
					{showDetails ? 'Hide details' : 'View details'}
				</Button>
				<Button href="/" variant="stage" size="xl">Back to home</Button>
			</div>

			{#if showDetails}
				<div class="mx-auto mt-10 max-w-2xl rounded-lg bg-cream p-6 text-left text-ink" transition:slide={{ duration: 220 }}>
					<div class="flex flex-wrap items-baseline justify-between gap-2 border-b border-line pb-4">
						<p class="font-display text-lg font-semibold text-forest-950">Your registration</p>
						<p class="font-mono text-xs text-muted-foreground">
							Submitted {formatTimestamp(result.createdAt, true)} · Status: Pending review
						</p>
					</div>
					{@render summary(result.snapshot)}
				</div>
			{/if}
		</div>
	</section>
{:else}
	<section class="relative overflow-hidden bg-stage pt-16 text-cream">
		<AnimatedGrid />
		<GlowBackground class="opacity-50" />
		<div class="shell relative py-14 md:py-16">
			<p class="eyebrow text-sun">Registration</p>
			<h1 class="mt-3 font-display text-4xl font-semibold tracking-tight md:text-6xl">Join {config.name}.</h1>
			<p class="mt-3 max-w-xl text-cream/65">No account needed — fill in the form and you'll get a registration ID.</p>
		</div>
	</section>

	<section class="py-12 md:py-16" bind:this={formEl} style="scroll-margin-top: 5rem">
		<div class="shell grid gap-10 lg:grid-cols-[15rem_1fr]">
			<!-- Step rail -->
			<nav aria-label="Registration progress">
				<ol class="flex gap-1 overflow-x-auto pb-2 lg:sticky lg:top-24 lg:flex-col lg:gap-0 lg:overflow-visible">
					{#each STEPS as label, i (label)}
						{@const done = i < step}
						{@const current = i === step}
						<li class="flex-1 lg:flex-none">
							<button
								type="button"
								disabled={i > step}
								onclick={() => go(i)}
								aria-current={current ? 'step' : undefined}
								class="group flex w-full min-w-[4.5rem] flex-col items-start gap-1 border-t-2 pt-2 text-left transition-colors duration-200
									lg:flex-row lg:items-center lg:gap-3 lg:border-t-0 lg:border-l-2 lg:py-3 lg:pl-4
									{current ? 'border-forest-700' : done ? 'border-forest-700/40' : 'border-line'}"
							>
								<span class="font-mono text-xs {current ? 'text-forest-700' : 'text-muted-foreground'}">
									{#if done}<Check class="inline size-3.5 text-forest-700" />{:else}0{i + 1}{/if}
								</span>
								<span class="text-[13px] font-medium lg:text-[15px] {current ? 'text-forest-950' : 'text-muted-foreground'}">{label}</span>
							</button>
						</li>
					{/each}
				</ol>
			</nav>

			<div class="min-w-0 overflow-hidden rounded-lg border border-line bg-white">
				{#key step}
					<form
						class="p-6 md:p-10"
						in:fly={{ x: 28 * direction, duration: 240, opacity: 0 }}
						onsubmit={(e) => {
							e.preventDefault();
							if (step === 4) submit();
							else next();
						}}
						novalidate
					>
						<p class="font-mono text-xs text-forest-700">Step 0{step + 1} / 05</p>
						<h2 class="mt-2 font-display text-3xl font-semibold tracking-tight text-forest-950">{STEPS[step]}</h2>

						<div class="mt-8">
							{#if step === 0}
								<div class="grid gap-5 md:grid-cols-2">
									<Field tone="site" class="md:col-span-2" label="Full name" bind:value={form.personal.name} error={errors['personal.name']} autocomplete="name" maxlength={80} />
									<Field tone="site" label="Email" type="email" bind:value={form.personal.email} error={errors['personal.email']} autocomplete="email" inputmode="email" />
									<Field tone="site" label="Phone" type="tel" bind:value={form.personal.phone} error={errors['personal.phone']} autocomplete="tel" inputmode="tel" />
								</div>
							{:else if step === 1}
								<div class="grid gap-5 md:grid-cols-2">
									<Field tone="site" class="md:col-span-2" label="College" bind:value={form.academic.college} error={errors['academic.college']} autocomplete="organization" />
									<Field tone="site" label="Department" bind:value={form.academic.department} error={errors['academic.department']} />
									<SelectField tone="site" label="Year" bind:value={form.academic.year} options={ACADEMIC_YEARS} placeholder="Select year" error={errors['academic.year']} />
								</div>
							{:else if step === 2}
								<div role="radiogroup" aria-label="Event" class="grid gap-3 md:grid-cols-2">
									{#each EVENT_IDS as id (id)}
										{@const ev = config.events[id]}
										{@const selected = form.event === id}
										<button
											type="button"
											role="radio"
											aria-checked={selected}
											disabled={!ev.registrationOpen}
											onclick={() => selectEvent(id)}
											class="relative flex min-h-40 flex-col rounded-lg border-2 p-5 text-left transition-[border-color,background-color] duration-150
												disabled:cursor-not-allowed disabled:opacity-55
												{selected ? 'border-forest-700 bg-green-100/60' : 'border-line hover:border-forest-700/40'}"
										>
											<span class="flex items-center justify-between">
												<span class="font-display text-2xl font-semibold text-forest-950">{ev.title}</span>
												<span class="grid size-6 place-items-center rounded-full border-2 {selected ? 'border-forest-700 bg-forest-700 text-white' : 'border-line'}">
													{#if selected}<Check class="size-3.5" strokeWidth={3} />{/if}
												</span>
											</span>
											<span class="mt-2 text-sm text-muted-foreground">{ev.summary}</span>
											<span class="mt-auto pt-4 font-mono text-xs text-forest-700">
												{#if ev.registrationOpen}
													{formatDateRange(ev.startDate, ev.endDate)} · {ev.teamMax <= 1 ? 'Solo' : `${ev.teamMin}–${ev.teamMax} per team`}
												{:else}
													<span class="inline-flex items-center gap-1 text-destructive"><Lock class="size-3" /> Registration closed</span>
												{/if}
											</span>
										</button>
									{/each}
								</div>
								{#if errors.event}<p class="mt-3 text-[13px] text-destructive" role="alert">{errors.event}</p>{/if}

								{#if eventConfig && eventConfig.tracks.length}
									<div transition:slide={{ duration: 200 }}>
										<SelectField tone="site" class="mt-6 md:max-w-md" label="Track" bind:value={form.team.track} options={eventConfig.tracks} placeholder="Select a track" error={errors['team.track']} />
									</div>
								{/if}
							{:else if step === 3}
								{#if !eventConfig}
									<p class="text-muted-foreground">Choose an event first.</p>
								{:else if solo}
									<div class="rounded-lg border border-dashed border-line p-6">
										<p class="font-display text-lg text-forest-950">Solo entry</p>
										<p class="mt-1 text-sm text-muted-foreground">{eventConfig.title} entries are individual — no team details needed.</p>
									</div>
								{:else}
									<Field tone="site" class="md:max-w-md" label="Team name" bind:value={form.team.name} error={errors['team.name']} maxlength={60} />

									<div class="mt-8 flex items-baseline justify-between gap-4">
										<p class="font-mono text-[11px] font-medium tracking-[0.16em] text-muted-foreground uppercase">Team members</p>
										<p class="font-mono text-xs text-muted-foreground tabular">
											{1 + form.team.members.length} / {eventConfig.teamMax} incl. you
										</p>
									</div>
									<ul class="mt-3 space-y-3">
										<li class="flex items-center gap-3 rounded-md border border-line bg-cream px-4 py-3 text-[15px]">
											<span class="font-mono text-xs text-forest-700">01</span>
											<span class="font-medium text-ink">{form.personal.name || 'You'}</span>
											<span class="ml-auto eyebrow text-muted-foreground">Lead</span>
										</li>
										{#each form.team.members as member, i (i)}
											<li class="grid gap-3 rounded-md border border-line p-4 md:grid-cols-[2rem_1fr_1fr_auto] md:items-start" transition:slide={{ duration: 180 }}>
												<span class="font-mono text-xs leading-12 text-forest-700">0{i + 2}</span>
												<Field tone="site" label="Name" bind:value={member.name} error={errors[`team.members.${i}.name`]} />
												<Field tone="site" label="Email" type="email" bind:value={member.email} error={errors[`team.members.${i}.email`]} />
												<button
													type="button"
													class="inline-flex h-12 items-center justify-center gap-2 self-end rounded-md px-3 text-sm text-muted-foreground hover:bg-red-50 hover:text-destructive md:mt-6 md:self-start"
													aria-label="Remove member {i + 2}"
													disabled={form.team.members.length <= eventConfig.teamMin - 1}
													onclick={() => form.team.members.splice(i, 1)}
												>
													<Trash2 class="size-4" /><span class="md:sr-only">Remove</span>
												</button>
											</li>
										{/each}
									</ul>
									{#if errors['team.members']}<p class="mt-3 text-[13px] text-destructive" role="alert">{errors['team.members']}</p>{/if}
									{#if form.team.members.length < maxMembers}
										<Button variant="outline" size="lg" class="mt-4" onclick={() => form.team.members.push({ name: '', email: '' })}>
											<Plus class="size-4" /> Add member
										</Button>
									{/if}
								{/if}
							{:else}
								<p class="text-muted-foreground">Check everything before you submit.</p>
								<div class="mt-2">{@render summary(form)}</div>
							{/if}
						</div>

						{#if submitError}
							<p class="mt-6 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-destructive" role="alert" transition:fade={{ duration: 150 }}>
								{submitError}
							</p>
						{/if}

						<div class="mt-10 flex items-center justify-between gap-3 border-t border-line pt-6">
							{#if step > 0}
								<Button variant="ghost" size="lg" onclick={() => go(step - 1)}><ArrowLeft class="size-4" /> Back</Button>
							{:else}
								<span></span>
							{/if}
							{#if step < 4}
								<Button type="submit" variant="default" size="lg" class="min-w-32">Continue <ArrowRight class="size-4" /></Button>
							{:else}
								<Button type="submit" variant="default" size="lg" class="min-w-40" loading={submitting}>
									{submitting ? 'Submitting…' : 'Submit registration'}
								</Button>
							{/if}
						</div>
					</form>
				{/key}
			</div>
		</div>
	</section>
{/if}
