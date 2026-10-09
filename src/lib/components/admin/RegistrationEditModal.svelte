<script lang="ts">
	import { Plus, Trash2 } from '@lucide/svelte';
	import { TEAM_SIZES, type Registration, type TeamLeader, type TeamMember } from '$lib/registrations/model';
	import { registrations } from '$lib/stores/registrations.svelte';
	import Modal from '$lib/components/ui/Modal.svelte';
	import Button from '$lib/components/ui/Button.svelte';
	import Field from '$lib/components/ui/Field.svelte';
	import { ADMISSION_HINT, isValidAdmission, normalizeAdmission } from '$lib/admission.js';

	interface Props {
		registration: Registration | null;
		onclose: () => void;
		onsaved: (message: string) => void;
	}
	let { registration, onclose, onsaved }: Props = $props();

	type MemberDraft = Omit<TeamMember, 'memberNumber'>;
	let teamName = $state('');
	let leader = $state<TeamLeader>({ name: '', admissionNumber: '', classSection: '', email: '', mobileNumber: '' });
	/** Members 2..n (member 1 is always the leader) */
	let others = $state<MemberDraft[]>([]);
	let errors = $state<Record<string, string>>({});
	let saving = $state(false);
	let saveError = $state('');

	$effect(() => {
		if (!registration) return;
		teamName = registration.teamName;
		leader = { ...registration.teamLeader };
		others = registration.members.slice(1).map(({ name, admissionNumber, email }) => ({ name, admissionNumber, email }));
		errors = {};
		saveError = '';
	});

	const sizes = $derived(registration ? TEAM_SIZES[registration.event] : [2]);
	const maxOthers = $derived(Math.max(...sizes) - 1);
	const minOthers = $derived(Math.min(...sizes) - 1);

	const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
	const MOBILE = /^[6-9]\d{9}$/;

	/** Older registrations may predate the format rule; only block new or changed values. */
	function badAdmission(value: string) {
		const existing = new Set(registration?.members.map((m) => normalizeAdmission(m.admissionNumber)) ?? []);
		return !isValidAdmission(value) && !existing.has(normalizeAdmission(value));
	}

	function validate() {
		const e: Record<string, string> = {};
		if (!leader.name.trim()) e['leader.name'] = 'Required.';
		if (!leader.admissionNumber.trim()) e['leader.admissionNumber'] = 'Required.';
		else if (badAdmission(leader.admissionNumber)) e['leader.admissionNumber'] = ADMISSION_HINT;
		if (!leader.classSection.trim()) e['leader.classSection'] = 'Required.';
		if (!EMAIL.test(leader.email.trim())) e['leader.email'] = 'Enter a valid email.';
		// Older registrations have no team name or mobile; only validate what's filled in.
		const tn = teamName.trim();
		if (tn && (tn.length < 2 || tn.length > 35)) e.teamName = 'Use 2–35 characters.';
		const mobile = leader.mobileNumber.replace(/[\s-]/g, '');
		if (mobile && !MOBILE.test(mobile)) e['leader.mobileNumber'] = 'Enter a 10-digit mobile number.';
		const adm = new Set([leader.admissionNumber.trim().toUpperCase()]);
		const mail = new Set([leader.email.trim().toLowerCase()]);
		others.forEach((m, i) => {
			if (!m.name.trim()) e[`m.${i}.name`] = 'Required.';
			const a = m.admissionNumber.trim().toUpperCase();
			if (!a) e[`m.${i}.admissionNumber`] = 'Required.';
			else if (badAdmission(a)) e[`m.${i}.admissionNumber`] = ADMISSION_HINT;
			else if (adm.has(a)) e[`m.${i}.admissionNumber`] = 'Duplicate in team.';
			adm.add(a);
			const em = m.email.trim().toLowerCase();
			if (!EMAIL.test(em)) e[`m.${i}.email`] = 'Enter a valid email.';
			else if (mail.has(em)) e[`m.${i}.email`] = 'Duplicate in team.';
			mail.add(em);
		});
		return e;
	}

	async function save() {
		if (!registration) return;
		errors = validate();
		if (Object.keys(errors).length) return;
		saving = true;
		saveError = '';
		const l = { ...$state.snapshot(leader) };
		for (const k of Object.keys(l) as (keyof TeamLeader)[]) l[k] = l[k].trim();
		l.mobileNumber = l.mobileNumber.replace(/[\s-]/g, '');
		l.admissionNumber = normalizeAdmission(l.admissionNumber);
		const members: TeamMember[] = [
			{ memberNumber: 1, name: l.name, admissionNumber: l.admissionNumber, email: l.email },
			...$state.snapshot(others).map((m, i) => ({
				memberNumber: i + 2,
				name: m.name.trim(),
				admissionNumber: normalizeAdmission(m.admissionNumber),
				email: m.email.trim()
			}))
		];
		try {
			await registrations.update(registration, { teamName: teamName.trim(), teamLeader: l, members });
			onsaved(`Saved changes to ${teamName.trim() || `${l.name}'s team`}`);
			onclose();
		} catch {
			saveError = 'Unable to save changes. Check your connection and try again.';
		} finally {
			saving = false;
		}
	}
</script>

<Modal open={!!registration} title="Edit registration" description={registration ? `Team of ${registration.teamLeader.name}` : ''} size="lg" {onclose}>
	<form id="edit-registration" class="space-y-8" onsubmit={(e) => { e.preventDefault(); save(); }} novalidate>
		{#if registration?.event === 'hackathon'}
			<Field label="Team name" bind:value={teamName} error={errors.teamName} />
		{/if}

		<fieldset class="grid gap-4 sm:grid-cols-2">
			<legend class="mb-3 text-xs font-semibold tracking-[0.08em] text-muted-foreground uppercase">Team leader</legend>
			<Field label="Name" bind:value={leader.name} error={errors['leader.name']} />
			<Field label="Admission number" bind:value={leader.admissionNumber} error={errors['leader.admissionNumber']} />
			<Field label="Class & section" bind:value={leader.classSection} error={errors['leader.classSection']} />
			<Field label="Email" type="email" bind:value={leader.email} error={errors['leader.email']} />
			<Field label="Mobile number" type="tel" bind:value={leader.mobileNumber} error={errors['leader.mobileNumber']} />
		</fieldset>

		<fieldset>
			<legend class="mb-3 text-xs font-semibold tracking-[0.08em] text-muted-foreground uppercase">
				Members · {1 + others.length} total
			</legend>
			<ul class="space-y-3">
				{#each others as m, i (i)}
					<li class="grid items-start gap-2 sm:grid-cols-[2rem_1fr_1fr_1fr_auto]">
						<span class="pt-2 font-mono text-xs text-muted-foreground">0{i + 2}</span>
						<Field label="Name" bind:value={m.name} error={errors[`m.${i}.name`]} placeholder="Name" class="[&_label]:sr-only" />
						<Field label="Admission number" bind:value={m.admissionNumber} error={errors[`m.${i}.admissionNumber`]} placeholder="Admission no." class="[&_label]:sr-only" />
						<Field label="Email" type="email" bind:value={m.email} error={errors[`m.${i}.email`]} placeholder="Email" class="[&_label]:sr-only" />
						<Button variant="ghost" size="icon" aria-label="Remove member {i + 2}" disabled={others.length <= minOthers} onclick={() => others.splice(i, 1)}><Trash2 class="size-4" /></Button>
					</li>
				{/each}
			</ul>
			{#if others.length < maxOthers}
				<Button variant="outline" size="sm" class="mt-3" onclick={() => others.push({ name: '', admissionNumber: '', email: '' })}>
					<Plus class="size-3.5" /> Add member
				</Button>
			{/if}
		</fieldset>
		{#if saveError}<p class="text-sm text-destructive" role="alert">{saveError}</p>{/if}
	</form>
	{#snippet footer()}
		<Button variant="outline" onclick={onclose}>Cancel</Button>
		<Button type="submit" form="edit-registration" loading={saving}>{saving ? 'Saving…' : 'Save changes'}</Button>
	{/snippet}
</Modal>
