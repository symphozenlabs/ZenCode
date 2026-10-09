<script lang="ts">
	import { untrack } from 'svelte';
	import { Plus, Trash2, CloudOff, RotateCcw } from '@lucide/svelte';
	import type { GeneralSettings, ScheduleItem } from '$lib/config/site';
	import { siteConfig } from '$lib/stores/site-config.svelte';
	import { adminAuth } from '$lib/stores/admin-auth.svelte';
	import PageHeader from '$lib/components/admin/PageHeader.svelte';
	import ListEditor from '$lib/components/admin/ListEditor.svelte';
	import SaveBar from '$lib/components/admin/SaveBar.svelte';
	import Button from '$lib/components/ui/Button.svelte';
	import Field from '$lib/components/ui/Field.svelte';
	import Skeleton from '$lib/components/ui/Skeleton.svelte';
	import StateMessage from '$lib/components/ui/StateMessage.svelte';

	$effect(() => siteConfig.subscribe());

	let draft = $state<GeneralSettings | null>(null);
	let saving = $state(false);
	let message = $state<{ text: string; tone: 'ok' | 'error' } | null>(null);
	let errors = $state<Record<string, string>>({});

	function pick(): GeneralSettings {
		const { events: _events, ...general } = $state.snapshot(siteConfig.value);
		return structuredClone(general);
	}

	function normalized(d: GeneralSettings): GeneralSettings {
		return {
			...d,
			name: d.name.trim(),
			tagline: d.tagline.trim(),
			organizers: d.organizers.map((o) => o.trim()).filter(Boolean),
			generalRules: d.generalRules.map((o) => o.trim()).filter(Boolean),
			sponsors: d.sponsors.map((s) => ({ name: s.name.trim(), url: s.url.trim() })).filter((s) => s.name),
			schedule: d.schedule.filter((s) => s.title.trim())
		};
	}

	const stored = $derived(pick());
	const dirty = $derived(!!draft && JSON.stringify(normalized(draft)) !== JSON.stringify(stored));

	function reset() {
		draft = pick();
		errors = {};
	}

	$effect(() => {
		if (siteConfig.status !== 'ready') return;
		const s = stored;
		untrack(() => {
			if (!draft || JSON.stringify(normalized($state.snapshot(draft) as GeneralSettings)) === JSON.stringify(s)) reset();
		});
	});

	function validate(d: GeneralSettings) {
		const e: Record<string, string> = {};
		if (!d.name) e.name = 'Enter the event name.';
		if (d.contactEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(d.contactEmail)) e.contactEmail = 'Enter a valid email.';
		d.sponsors.forEach((s, i) => {
			if (s.url && !/^https?:\/\//.test(s.url)) e[`sponsor.${i}`] = 'URL must start with http:// or https://';
		});
		return e;
	}

	async function save() {
		if (!draft) return;
		const data = normalized($state.snapshot(draft) as GeneralSettings);
		errors = validate(data);
		if (Object.keys(errors).length) {
			message = { text: 'Fix the highlighted fields before saving.', tone: 'error' };
			return;
		}
		saving = true;
		message = null;
		try {
			await siteConfig.saveGeneral(data);
			draft = structuredClone(data);
			message = { text: 'Saved. The public site updates within a minute.', tone: 'ok' };
			setTimeout(() => (message = null), 3000);
		} catch {
			message = { text: 'Unable to save settings. Try again.', tone: 'error' };
		} finally {
			saving = false;
		}
	}

	function addScheduleItem() {
		const last = draft?.schedule.at(-1);
		const item: ScheduleItem = {
			id: crypto.randomUUID().slice(0, 8),
			day: last?.day ?? 'Day 1',
			time: '',
			title: '',
			event: 'general',
			location: ''
		};
		draft?.schedule.push(item);
	}

	const inputCls =
		'h-9 w-full rounded-md border border-input bg-card px-3 text-sm outline-none focus:border-ring focus:ring-3 focus:ring-ring/20';
</script>

<svelte:head><title>Settings — ZenCode Admin</title></svelte:head>

<PageHeader title="Settings" description="Public event details shown across the website. Leave a field empty to show “To be announced”." />

{#if siteConfig.status === 'error'}
	<div class="rounded-lg border border-border bg-card">
		<StateMessage tone="error" icon={CloudOff} title="Unable to load settings.">
			<Button variant="outline" onclick={() => siteConfig.retry()}><RotateCcw class="size-4" /> Retry</Button>
		</StateMessage>
	</div>
{:else if !draft}
	<div class="space-y-3 rounded-lg border border-border bg-card p-6"><Skeleton class="h-9 w-1/2" /><Skeleton class="h-9" /><Skeleton class="h-9 w-1/3" /></div>
{:else}
	<div class="grid gap-6 xl:grid-cols-2">
		<section class="space-y-4 rounded-lg border border-border bg-card p-5">
			<h2 class="text-[15px] font-semibold">Identity</h2>
			<div class="grid gap-4 sm:grid-cols-2">
				<Field label="Event name" bind:value={draft.name} error={errors.name} />
				<Field label="Edition" bind:value={draft.edition} placeholder="e.g. 2026" />
			</div>
			<Field label="Tagline" bind:value={draft.tagline} />
		</section>

		<section class="space-y-4 rounded-lg border border-border bg-card p-5">
			<h2 class="text-[15px] font-semibold">Venue & contact</h2>
			<div class="grid gap-4 sm:grid-cols-2">
				<Field label="Venue" bind:value={draft.venue} />
				<Field label="City" bind:value={draft.city} />
			</div>
			<Field label="Contact email" type="email" bind:value={draft.contactEmail} error={errors.contactEmail} />
		</section>

		<section class="rounded-lg border border-border bg-card p-5">
			<ListEditor label="Organisers" bind:items={draft.organizers} placeholder="Organisation name" addLabel="Add organiser" />
		</section>

		<section class="rounded-lg border border-border bg-card p-5">
			<fieldset>
				<legend class="text-[13px] font-medium">Sponsors</legend>
				{#if draft.sponsors.length}
					<ul class="mt-2 space-y-2">
						{#each draft.sponsors as s, i (i)}
							<li>
								<div class="grid grid-cols-[1fr_1fr_auto] gap-2">
									<input bind:value={s.name} placeholder="Name" aria-label="Sponsor {i + 1} name" class={inputCls} />
									<input bind:value={s.url} placeholder="https://" aria-label="Sponsor {i + 1} URL" class={inputCls} />
									<Button variant="ghost" size="icon" aria-label="Remove sponsor" onclick={() => draft?.sponsors.splice(i, 1)}><Trash2 class="size-4" /></Button>
								</div>
								{#if errors[`sponsor.${i}`]}<p class="mt-1 text-[13px] text-destructive">{errors[`sponsor.${i}`]}</p>{/if}
							</li>
						{/each}
					</ul>
				{:else}
					<p class="mt-1 text-[13px] text-muted-foreground">No sponsors — the sponsor band stays hidden on the home page.</p>
				{/if}
				<Button variant="outline" size="sm" class="mt-2" onclick={() => draft?.sponsors.push({ name: '', url: '' })}><Plus class="size-3.5" /> Add sponsor</Button>
			</fieldset>
		</section>

		<section class="rounded-lg border border-border bg-card p-5 xl:col-span-2">
			<div class="flex items-center justify-between">
				<h2 class="text-[15px] font-semibold">Schedule</h2>
				<Button variant="outline" size="sm" onclick={addScheduleItem}><Plus class="size-3.5" /> Add session</Button>
			</div>
			{#if draft.schedule.length}
				<div class="mt-3 overflow-x-auto">
					<table class="w-full min-w-[720px] text-sm">
						<thead class="text-left text-[12px] text-muted-foreground">
							<tr><th class="pb-2 font-medium">Day</th><th class="pb-2 font-medium">Time</th><th class="pb-2 font-medium">Title</th><th class="pb-2 font-medium">Event</th><th class="pb-2 font-medium">Location</th><th></th></tr>
						</thead>
						<tbody>
							{#each draft.schedule as item, i (item.id)}
								<tr>
									<td class="w-32 py-1 pr-2"><input bind:value={item.day} aria-label="Day" class={inputCls} /></td>
									<td class="w-28 py-1 pr-2"><input bind:value={item.time} placeholder="09:00" aria-label="Time" class={inputCls} /></td>
									<td class="py-1 pr-2"><input bind:value={item.title} placeholder="Session title" aria-label="Title" class={inputCls} /></td>
									<td class="w-36 py-1 pr-2">
										<select bind:value={item.event} aria-label="Event" class={inputCls}>
											<option value="general">General</option>
											<option value="hackathon">Hackathon</option>
											<option value="pitch-fest">Pitch Fest</option>
										</select>
									</td>
									<td class="w-40 py-1 pr-2"><input bind:value={item.location} aria-label="Location" class={inputCls} /></td>
									<td class="w-10 py-1"><Button variant="ghost" size="icon" aria-label="Remove session" onclick={() => draft?.schedule.splice(i, 1)}><Trash2 class="size-4" /></Button></td>
								</tr>
							{/each}
						</tbody>
					</table>
				</div>
				<p class="mt-2 text-[13px] text-muted-foreground">Sessions are shown in this order, grouped by day.</p>
			{:else}
				<p class="mt-2 text-[13px] text-muted-foreground">No sessions yet — the public schedule shows “To be announced”.</p>
			{/if}
		</section>

		<section class="rounded-lg border border-border bg-card p-5 xl:col-span-2">
			<ListEditor label="General rules" bind:items={draft.generalRules} placeholder="Rule" addLabel="Add rule" multiline />
		</section>

		<section class="rounded-lg border border-border bg-card p-5 xl:col-span-2">
			<h2 class="text-[15px] font-semibold">Account</h2>
			<p class="mt-1 text-sm text-muted-foreground">
				Signed in as <span class="font-medium text-foreground">{adminAuth.user?.email}</span>. Organiser access is granted with
				<code class="rounded bg-muted px-1.5 py-0.5 font-mono text-[12px]">npm run grant-admin -- email@example.com</code>.
			</p>
		</section>
	</div>

	<SaveBar {dirty} {saving} {message} onsave={save} onreset={reset} />
{/if}
