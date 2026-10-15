<script lang="ts">
	import type { StudentAttendanceRow } from '$lib/attendance/model';
	import Button from '$lib/components/ui/Button.svelte';
	import Modal from '$lib/components/ui/Modal.svelte';
	import Spinner from '$lib/components/ui/Spinner.svelte';

	let {
		member,
		onSave,
		onClose
	}: {
		member: StudentAttendanceRow;
		onSave: (recordId: string, newStatus: 'present' | 'not-checked-in' | 'absent', reason: string) => Promise<void>;
		onClose: () => void;
	} = $props();

	let newStatus = $state<'present' | 'not-checked-in' | 'absent'>('not-checked-in');
	let reason = $state('');
	let reasonError = $state('');
	let saving = $state(false);
	let error = $state('');

	$effect(() => {
		newStatus = member.status === 'present' ? 'not-checked-in' : 'present';
	});

	async function handleSubmit(e: SubmitEvent) {
		e.preventDefault();
		reasonError = '';
		error = '';

		if (!reason.trim() || reason.trim().length < 3) {
			reasonError = 'A detailed reason is required for the audit log.';
			return;
		}

		saving = true;
		try {
			const recordId = `${member.sessionId}__${member.teamId}__${member.participantKey}`;
			await onSave(recordId, newStatus, reason.trim());
			onClose();
		} catch (err: any) {
			error = err.message || 'Failed to save attendance correction.';
		} finally {
			saving = false;
		}
	}
</script>

<Modal open={true} title="Audited Attendance Correction" onclose={onClose}>
	<form onsubmit={handleSubmit} class="space-y-4">
		<div class="rounded-lg bg-muted/50 p-3 text-xs space-y-1 border border-border">
			<div class="flex justify-between">
				<span class="text-muted-foreground font-semibold">Student:</span>
				<span class="font-bold text-foreground">{member.studentName}</span>
			</div>
			<div class="flex justify-between">
				<span class="text-muted-foreground font-semibold">Admission No:</span>
				<span class="font-mono text-foreground">{member.admissionNumber}</span>
			</div>
			<div class="flex justify-between">
				<span class="text-muted-foreground font-semibold">Team:</span>
				<span class="text-foreground">{member.teamName} ({member.teamId})</span>
			</div>
			<div class="flex justify-between">
				<span class="text-muted-foreground font-semibold">Current Status:</span>
				<span class="font-bold uppercase text-foreground">{member.status}</span>
			</div>
		</div>

		{#if error}
			<div class="rounded-lg bg-destructive/10 p-3 text-xs font-medium text-destructive border border-destructive/20">
				{error}
			</div>
		{/if}

		<div>
			<label for="new-status-select" class="block text-xs font-semibold text-foreground mb-1.5">New Attendance Status</label>
			<select
				id="new-status-select"
				bind:value={newStatus}
				class="w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground focus:ring-2 focus:ring-ring focus:outline-hidden"
			>
				<option value="present">Present (Checked In)</option>
				<option value="not-checked-in">Not Checked In (Pending)</option>
				<option value="absent">Absent</option>
			</select>
		</div>

		<div class="flex flex-col gap-1.5">
			<label for="reason-input" class="text-[13px] font-medium text-foreground">Reason for Correction</label>
			<textarea
				id="reason-input"
				rows="3"
				placeholder="e.g. Student arrived late with special permission, or accidental click."
				bind:value={reason}
				class="w-full rounded-md border border-input bg-background p-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:ring-2 focus:ring-ring focus:outline-hidden"
			></textarea>
			{#if reasonError}
				<p class="text-[13px] text-destructive">{reasonError}</p>
			{/if}
		</div>

		<p class="text-[11px] text-muted-foreground">
			This change, your identity, previous status, and reason will be permanently recorded in the attendance audit log.
		</p>

		<div class="flex items-center justify-end gap-2 pt-2 border-t border-border">
			<Button variant="outline" type="button" onclick={onClose} disabled={saving}>Cancel</Button>
			<Button variant="default" type="submit" disabled={saving}>
				{#if saving}
					<Spinner class="size-4" /> Saving Audit Log…
				{:else}
					Apply Correction
				{/if}
			</Button>
		</div>
	</form>
</Modal>
