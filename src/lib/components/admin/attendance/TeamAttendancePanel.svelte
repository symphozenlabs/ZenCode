<script lang="ts">
	import { CheckCircle2, Clock, UserCheck, Users, Copy, Check, X } from '@lucide/svelte';
	import type { TeamAttendanceRow, StudentAttendanceRow } from '$lib/attendance/model';
	import { formatTimestamp } from '$lib/attendance/model';
	import Button from '$lib/components/ui/Button.svelte';
	import Modal from '$lib/components/ui/Modal.svelte';
	import Spinner from '$lib/components/ui/Spinner.svelte';

	let {
		teamRow,
		onMarkStudentPresent,
		onMarkAllPresent,
		onClose
	}: {
		teamRow: TeamAttendanceRow;
		onMarkStudentPresent: (member: StudentAttendanceRow) => Promise<void>;
		onMarkAllPresent: (members: StudentAttendanceRow[]) => Promise<void>;
		onClose: () => void;
	} = $props();

	let markingKeys = $state<Set<string>>(new Set());
	let markingAll = $state(false);
	let confirmAllOpen = $state(false);
	let copied = $state(false);
	let feedbackMessage = $state<{ text: string; tone: 'ok' | 'error' } | null>(null);

	const uncheckedMembers = $derived(teamRow.members.filter((m) => m.status !== 'present'));

	async function copyTeamId() {
		try {
			await navigator.clipboard.writeText(teamRow.teamId);
			copied = true;
			setTimeout(() => (copied = false), 2000);
		} catch {
			// ignore
		}
	}

	async function handleMarkOne(member: StudentAttendanceRow) {
		if (member.status === 'present' || markingKeys.has(member.participantKey)) return;

		markingKeys.add(member.participantKey);
		markingKeys = new Set(markingKeys);
		feedbackMessage = null;

		try {
			await onMarkStudentPresent(member);
			feedbackMessage = { text: `Marked ${member.studentName} as Present.`, tone: 'ok' };
			setTimeout(() => {
				if (feedbackMessage?.text.includes(member.studentName)) feedbackMessage = null;
			}, 3000);
		} catch (err: any) {
			feedbackMessage = { text: err.message || 'Failed to record check-in.', tone: 'error' };
		} finally {
			markingKeys.delete(member.participantKey);
			markingKeys = new Set(markingKeys);
		}
	}

	async function handleConfirmAll() {
		if (uncheckedMembers.length === 0 || markingAll) return;
		markingAll = true;
		feedbackMessage = null;

		try {
			await onMarkAllPresent(uncheckedMembers);
			confirmAllOpen = false;
			feedbackMessage = { text: `All ${teamRow.members.length} team members marked present.`, tone: 'ok' };
			setTimeout(() => (feedbackMessage = null), 4000);
		} catch (err: any) {
			feedbackMessage = { text: err.message || 'Failed to mark all present.', tone: 'error' };
		} finally {
			markingAll = false;
		}
	}
</script>

<div class="rounded-xl border border-border bg-card p-5 sm:p-6 shadow-md transition-all">
	<!-- Panel Header -->
	<div class="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between pb-5 border-b border-border">
		<div>
			<div class="flex flex-wrap items-center gap-2">
				<span class="rounded-md bg-forest-900/10 px-2.5 py-0.5 text-xs font-bold text-forest-900 border border-forest-900/20">
					{teamRow.eventName}
				</span>
				<div class="flex items-center gap-1.5 rounded-md bg-muted px-2 py-0.5 text-xs font-mono text-muted-foreground">
					<span>Team ID: {teamRow.teamId}</span>
					<button
						type="button"
						onclick={copyTeamId}
						class="text-muted-foreground hover:text-foreground"
						title="Copy Team ID"
					>
						{#if copied}
							<Check class="size-3.5 text-emerald-600" />
						{:else}
							<Copy class="size-3.5" />
						{/if}
					</button>
				</div>
			</div>

			<h2 class="mt-1.5 text-2xl font-extrabold tracking-tight text-foreground">{teamRow.teamName}</h2>
			<p class="text-xs text-muted-foreground mt-0.5">
				Leader: <span class="font-medium text-foreground">{teamRow.teamLeaderName}</span>
			</p>
		</div>

		<div class="flex items-center gap-2">
			{#if uncheckedMembers.length > 0}
				<Button
					variant="secondary"
					onclick={() => (confirmAllOpen = true)}
					disabled={markingAll}
				>
					<UserCheck class="size-4" /> Mark All Present ({uncheckedMembers.length})
				</Button>
			{/if}
			<Button variant="outline" onclick={onClose} title="Close Panel">
				<X class="size-4" /> Close
			</Button>
		</div>
	</div>

	<!-- Team Attendance Summary Bar -->
	<div class="my-4 grid grid-cols-2 gap-3 sm:grid-cols-4 rounded-lg bg-background p-3.5 border border-border">
		<div>
			<span class="block text-[11px] font-semibold text-muted-foreground uppercase">Registered</span>
			<span class="text-lg font-bold text-foreground">{teamRow.registeredMemberCount} Members</span>
		</div>
		<div>
			<span class="block text-[11px] font-semibold text-muted-foreground uppercase">Present</span>
			<span class="text-lg font-bold text-emerald-600">{teamRow.presentCount}</span>
		</div>
		<div>
			<span class="block text-[11px] font-semibold text-muted-foreground uppercase">Not Checked In</span>
			<span class="text-lg font-bold {teamRow.notCheckedInCount > 0 ? 'text-amber-600' : 'text-muted-foreground'}">
				{teamRow.notCheckedInCount}
			</span>
		</div>
		<div>
			<span class="block text-[11px] font-semibold text-muted-foreground uppercase">Team Attendance</span>
			<div class="mt-0.5">
				<span class="inline-flex items-center gap-1.5 text-sm font-bold
					{teamRow.status === 'Fully Present' ? 'text-emerald-700' : teamRow.status === 'Partially Present' ? 'text-amber-700' : 'text-muted-foreground'}">
					<span class="size-2 rounded-full
						{teamRow.status === 'Fully Present' ? 'bg-emerald-500' : teamRow.status === 'Partially Present' ? 'bg-amber-500' : 'bg-gray-400'}"></span>
					{teamRow.presentCount} of {teamRow.registeredMemberCount} present
				</span>
			</div>
		</div>
	</div>

	<!-- Feedback Alert -->
	{#if feedbackMessage}
		<div class="mb-4 flex items-center justify-between rounded-lg p-3 text-xs font-medium
			{feedbackMessage.tone === 'ok' ? 'bg-emerald-50 text-emerald-800 border border-emerald-200' : 'bg-destructive/10 text-destructive border border-destructive/20'}">
			<span>{feedbackMessage.text}</span>
			<button type="button" onclick={() => (feedbackMessage = null)} class="opacity-70 hover:opacity-100">×</button>
		</div>
	{/if}

	<!-- Individual Members List -->
	<div>
		<div class="mb-3 flex items-center justify-between">
			<h3 class="text-sm font-bold text-foreground">Registered Members ({teamRow.members.length})</h3>
			<span class="text-xs text-muted-foreground">Verify physical presence before checking in</span>
		</div>

		<div class="grid gap-3 sm:grid-cols-2">
			{#each teamRow.members as member (member.participantKey)}
				{@const isPresent = member.status === 'present'}
				{@const isMarking = markingKeys.has(member.participantKey)}

				<div class="flex flex-col justify-between rounded-lg border p-4 transition-all
					{isPresent ? 'border-emerald-200 bg-emerald-50/50' : 'border-border bg-card'}">
					<div>
						<div class="flex items-start justify-between gap-2">
							<div class="flex items-center gap-2">
								<span class="grid size-6 place-items-center rounded-full text-xs font-bold
									{member.isLeader ? 'bg-forest-900 text-cream' : 'bg-muted text-foreground'}">
									{member.memberNumber}
								</span>
								<div>
									<h4 class="font-bold text-foreground leading-tight">{member.studentName}</h4>
									<div class="flex items-center gap-1.5 mt-0.5 text-xs text-muted-foreground">
										{#if member.isLeader}
											<span class="font-semibold text-primary">Team Leader</span>
											<span>•</span>
										{/if}
										<span>{member.yearOfStudy || 'MCA'}</span>
									</div>
								</div>
							</div>

							{#if isPresent}
								<span class="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2.5 py-0.5 text-[11px] font-bold text-emerald-800">
									<CheckCircle2 class="size-3 text-emerald-600" /> Present
								</span>
							{:else}
								<span class="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2.5 py-0.5 text-[11px] font-bold text-amber-800">
									<Clock class="size-3" /> Not Checked In
								</span>
							{/if}
						</div>

						<div class="mt-3 grid grid-cols-2 gap-2 text-xs border-t border-border/60 pt-2.5">
							<div>
								<span class="text-muted-foreground block text-[10px] uppercase font-semibold">Admission No</span>
								<span class="font-mono font-medium text-foreground">{member.admissionNumber || '—'}</span>
							</div>
							<div>
								<span class="text-muted-foreground block text-[10px] uppercase font-semibold">Email</span>
								<span class="truncate block text-foreground" title={member.email}>{member.email || '—'}</span>
							</div>
						</div>

						{#if isPresent && member.checkedInAt}
							<div class="mt-2 text-[11px] text-emerald-700 bg-emerald-100/60 rounded px-2 py-1">
								Checked in at {formatTimestamp(member.checkedInAt)}
								{#if member.checkedInBy}
									<span class="text-emerald-800 font-medium">({member.checkedInBy})</span>
								{/if}
							</div>
						{/if}
					</div>

					<!-- Card Action -->
					<div class="mt-4 pt-3 border-t border-border flex items-center justify-between gap-2">
						{#if !isPresent}
							<Button
								variant="default"
								class="w-full"
								onclick={() => handleMarkOne(member)}
								disabled={isMarking}
							>
								{#if isMarking}
									<Spinner class="size-4" /> Recording…
								{:else}
									<CheckCircle2 class="size-4" /> Mark Present
								{/if}
							</Button>
						{:else}
							<div class="flex items-center justify-between w-full py-1">
								<span class="text-xs font-semibold text-emerald-700">✓ Already Checked In</span>
								<span class="text-[11px] text-muted-foreground font-mono">Recorded</span>
							</div>
						{/if}
					</div>
				</div>
			{/each}
		</div>
	</div>
</div>

<!-- Modal: Confirm Mark All Present -->
{#if confirmAllOpen}
	<Modal open={confirmAllOpen} title="Confirm Mark All Present" onclose={() => (confirmAllOpen = false)}>
		<div class="space-y-4">
			<p class="text-sm text-foreground">
				Are you sure you want to mark all <strong>{uncheckedMembers.length}</strong> remaining members of <strong>{teamRow.teamName}</strong> present?
			</p>

			<div class="rounded-lg border border-border bg-muted/50 p-3 max-h-48 overflow-y-auto space-y-2">
				{#each uncheckedMembers as m}
					<div class="flex items-center justify-between text-xs">
						<span class="font-medium text-foreground">{m.studentName} ({m.isLeader ? 'Leader' : `Member ${m.memberNumber}`})</span>
						<span class="font-mono text-muted-foreground">{m.admissionNumber}</span>
					</div>
				{/each}
			</div>

			<p class="text-xs text-muted-foreground">
				Please verify that all members listed above are physically present at the check-in desk.
			</p>

			<div class="flex items-center justify-end gap-2 pt-2">
				<Button variant="outline" onclick={() => (confirmAllOpen = false)} disabled={markingAll}>Cancel</Button>
				<Button variant="default" onclick={handleConfirmAll} disabled={markingAll}>
					{#if markingAll}
						<Spinner class="size-4" /> Recording…
					{:else}
						Confirm & Mark All Present
					{/if}
				</Button>
			</div>
		</div>
	</Modal>
{/if}
