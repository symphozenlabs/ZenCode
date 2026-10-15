<script lang="ts">
	import type { EventId } from '$lib/config/site';
	import Button from '$lib/components/ui/Button.svelte';
	import Field from '$lib/components/ui/Field.svelte';
	import Modal from '$lib/components/ui/Modal.svelte';
	import Spinner from '$lib/components/ui/Spinner.svelte';

	let {
		defaultEventId = 'hackathon',
		onSave,
		onClose
	}: {
		defaultEventId?: EventId;
		onSave: (session: { name: string; eventId: EventId; date: string; notes?: string }) => Promise<void>;
		onClose: () => void;
	} = $props();

	let eventId = $state<EventId>('hackathon');
	let name = $state('');
	let date = $state(new Date().toISOString().split('T')[0]);
	let notes = $state('');
	let nameError = $state('');
	let saving = $state(false);
	let error = $state('');

	$effect(() => {
		eventId = defaultEventId;
	});

	async function handleSubmit(e: SubmitEvent) {
		e.preventDefault();
		nameError = '';
		error = '';

		if (!name.trim() || name.trim().length < 2) {
			nameError = 'Session name is required (e.g. "Morning Desk Check-in").';
			return;
		}

		saving = true;
		try {
			await onSave({
				eventId,
				name: name.trim(),
				date: date.trim(),
				notes: notes.trim()
			});
			onClose();
		} catch (err: any) {
			error = err.message || 'Failed to create session.';
		} finally {
			saving = false;
		}
	}
</script>

<Modal open={true} title="Create Attendance Session" onclose={onClose}>
	<form onsubmit={handleSubmit} class="space-y-4">
		{#if error}
			<div class="rounded-lg bg-destructive/10 p-3 text-xs font-medium text-destructive border border-destructive/20">
				{error}
			</div>
		{/if}

		<div>
			<label for="event-select" class="block text-xs font-semibold text-foreground mb-1.5">Event</label>
			<select
				id="event-select"
				bind:value={eventId}
				class="w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground focus:ring-2 focus:ring-ring focus:outline-hidden"
			>
				<option value="hackathon">Hackathon</option>
				<option value="pitch-fest">Pitch Fest</option>
			</select>
		</div>

		<Field
			label="Session Name"
			bind:value={name}
			error={nameError}
			placeholder="e.g. Day 1 Morning Registration Desk"
		/>

		<Field
			label="Session Date"
			bind:value={date}
			type="date"
		/>

		<div class="flex flex-col gap-1.5">
			<label for="session-notes" class="text-[13px] font-medium text-foreground">Notes (Optional)</label>
			<textarea
				id="session-notes"
				rows="2"
				placeholder="e.g. Opening check-in desk at Main Auditorium entrance."
				bind:value={notes}
				class="w-full rounded-md border border-input bg-background p-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:ring-2 focus:ring-ring focus:outline-hidden"
			></textarea>
		</div>

		<div class="flex items-center justify-end gap-2 pt-2 border-t border-border">
			<Button variant="outline" type="button" onclick={onClose} disabled={saving}>Cancel</Button>
			<Button variant="default" type="submit" disabled={saving}>
				{#if saving}
					<Spinner class="size-4" /> Creating…
				{:else}
					Create Session
				{/if}
			</Button>
		</div>
	</form>
</Modal>
