<script lang="ts">
	import { Plus, Trash2 } from '@lucide/svelte';
	import type { EventConfig } from '$lib/config/site';
	import {
		ACADEMIC_YEARS,
		validateAcademic,
		validatePersonal,
		validateTeam,
		type Errors,
		type Registration
	} from '$lib/validation/registration';
	import { registrations } from '$lib/stores/registrations.svelte';
	import Modal from '$lib/components/ui/Modal.svelte';
	import Button from '$lib/components/ui/Button.svelte';
	import Field from '$lib/components/ui/Field.svelte';
	import SelectField from '$lib/components/ui/SelectField.svelte';

	interface Props {
		registration: Registration | null;
		eventConfig: EventConfig | null;
		onclose: () => void;
		onsaved: (message: string) => void;
	}
	let { registration, eventConfig, onclose, onsaved }: Props = $props();

	let draft = $state<Pick<Registration, 'personal' | 'academic' | 'team'> | null>(null);
	let errors = $state<Errors>({});
	let saving = $state(false);
	let saveError = $state('');

	$effect(() => {
		if (registration) {
			draft = structuredClone({
				personal: { ...registration.personal },
				academic: { ...registration.academic },
				team: { ...registration.team, members: registration.team.members.map((m) => ({ ...m })) }
			});
			errors = {};
			saveError = '';
		}
	});

	const trackOptions = $derived.by(() => {
		const tracks = eventConfig?.tracks ?? [];
		const current = draft?.team.track;
		return current && !tracks.includes(current) ? [current, ...tracks] : tracks;
	});

	async function save() {
		if (!registration || !draft) return;
		const input = { event: registration.event, ...draft };
		// Admins may adjust team size beyond the public limits; field formats still apply.
		const relaxed = eventConfig ? { ...eventConfig, teamMin: 1, teamMax: Math.max(eventConfig.teamMax, 1 + draft.team.members.length) } : null;
		errors = { ...validatePersonal(input), ...validateAcademic(input), ...validateTeam(input, relaxed) };
		if (Object.keys(errors).length) return;
		saving = true;
		saveError = '';
		try {
			await registrations.update(registration.registrationId, $state.snapshot(draft));
			onsaved(`Saved changes to ${registration.registrationId}`);
			onclose();
		} catch {
			saveError = 'Unable to save changes. Check your connection and try again.';
		} finally {
			saving = false;
		}
	}
</script>

<Modal
	open={!!registration && !!draft}
	title="Edit registration"
	description={registration?.registrationId}
	size="lg"
	{onclose}
>
	{#if draft}
		<form id="edit-registration" class="space-y-8" onsubmit={(e) => { e.preventDefault(); save(); }} novalidate>
			<fieldset class="grid gap-4 sm:grid-cols-2">
				<legend class="mb-3 text-xs font-semibold tracking-[0.08em] text-muted-foreground uppercase">Personal</legend>
				<Field class="sm:col-span-2" label="Name" bind:value={draft.personal.name} error={errors['personal.name']} />
				<Field label="Email" type="email" bind:value={draft.personal.email} error={errors['personal.email']} />
				<Field label="Phone" type="tel" bind:value={draft.personal.phone} error={errors['personal.phone']} />
			</fieldset>
			<fieldset class="grid gap-4 sm:grid-cols-3">
				<legend class="mb-3 text-xs font-semibold tracking-[0.08em] text-muted-foreground uppercase">Academic</legend>
				<Field label="College" bind:value={draft.academic.college} error={errors['academic.college']} />
				<Field label="Department" bind:value={draft.academic.department} error={errors['academic.department']} />
				<SelectField label="Year" bind:value={draft.academic.year} options={ACADEMIC_YEARS} error={errors['academic.year']} />
			</fieldset>
			<fieldset class="grid gap-4 sm:grid-cols-2">
				<legend class="mb-3 text-xs font-semibold tracking-[0.08em] text-muted-foreground uppercase">Team</legend>
				<Field label="Team name" bind:value={draft.team.name} error={errors['team.name']} />
				{#if trackOptions.length}
					<SelectField label="Track" bind:value={draft.team.track} options={trackOptions} placeholder="No track" />
				{:else}
					<Field label="Track" bind:value={draft.team.track} />
				{/if}
				<div class="sm:col-span-2">
					<p class="text-[13px] font-medium">Members <span class="font-normal text-muted-foreground">(excluding lead)</span></p>
					<ul class="mt-2 space-y-2">
						{#each draft.team.members as m, i (i)}
							<li class="grid grid-cols-[1fr_1fr_auto] items-start gap-2">
								<Field label="Name" bind:value={m.name} error={errors[`team.members.${i}.name`]} class="[&_label]:sr-only" placeholder="Name" />
								<Field label="Email" type="email" bind:value={m.email} error={errors[`team.members.${i}.email`]} class="[&_label]:sr-only" placeholder="Email" />
								<Button variant="ghost" size="icon" aria-label="Remove member" onclick={() => draft?.team.members.splice(i, 1)}><Trash2 class="size-4" /></Button>
							</li>
						{/each}
					</ul>
					<Button variant="outline" size="sm" class="mt-2" onclick={() => draft?.team.members.push({ name: '', email: '' })}>
						<Plus class="size-3.5" /> Add member
					</Button>
				</div>
			</fieldset>
			{#if saveError}<p class="text-sm text-destructive" role="alert">{saveError}</p>{/if}
		</form>
	{/if}
	{#snippet footer()}
		<Button variant="outline" onclick={onclose}>Cancel</Button>
		<Button type="submit" form="edit-registration" loading={saving}>{saving ? 'Saving…' : 'Save changes'}</Button>
	{/snippet}
</Modal>
