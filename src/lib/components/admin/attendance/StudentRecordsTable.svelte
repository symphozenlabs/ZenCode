<script lang="ts">
	import { Search, CheckCircle2, Clock, ArrowUpDown, Undo2 } from '@lucide/svelte';
	import type { StudentAttendanceRow } from '$lib/attendance/model';
	import { formatTimestamp } from '$lib/attendance/model';
	import { attendance } from '$lib/stores/attendance.svelte';
	import Modal from '$lib/components/ui/Modal.svelte';
	import Button from '$lib/components/ui/Button.svelte';

	let {
		rows = []
	}: {
		rows: StudentAttendanceRow[];
	} = $props();

	let searchQuery = $state('');
	let statusFilter = $state<string>('all');
	let roleFilter = $state<string>('all');
	let sortAsc = $state(false);

	// Revoke (false attendance) dialog
	let revokeTarget = $state<StudentAttendanceRow | null>(null);
	let revokeCode = $state('');
	let revokeError = $state<string | null>(null);
	let revoking = $state(false);

	function openRevoke(row: StudentAttendanceRow) {
		revokeTarget = row;
		revokeCode = '';
		revokeError = null;
	}

	function closeRevoke() {
		if (revoking) return;
		revokeTarget = null;
	}

	async function confirmRevoke() {
		if (!revokeTarget) return;
		if (!revokeCode.trim()) {
			revokeError = 'Enter the revoke code.';
			return;
		}
		revoking = true;
		revokeError = null;
		try {
			await attendance.revokeStudent(revokeTarget.teamId, revokeTarget.participantKey, revokeCode.trim());
			revokeTarget = null;
		} catch (err: any) {
			revokeError = err.message || 'Revoke failed.';
		} finally {
			revoking = false;
		}
	}

	const filteredRows = $derived.by(() => {
		const q = searchQuery.trim().toLowerCase();

		return rows
			.filter((r) => {
				// Status filter
				if (statusFilter !== 'all' && r.status !== statusFilter) return false;

				// Role filter
				if (roleFilter === 'leader' && !r.isLeader) return false;
				if (roleFilter === 'member' && r.isLeader) return false;

				// Search query
				if (!q) return true;
				return (
					r.studentName.toLowerCase().includes(q) ||
					r.admissionNumber.toLowerCase().includes(q) ||
					r.teamName.toLowerCase().includes(q) ||
					r.teamId.toLowerCase().includes(q) ||
					r.email.toLowerCase().includes(q)
				);
			})
			.sort((a, b) => {
				// Present first or sort by check-in time
				if (a.status === 'present' && b.status !== 'present') return sortAsc ? 1 : -1;
				if (a.status !== 'present' && b.status === 'present') return sortAsc ? -1 : 1;
				return (b.checkedInAt || 0) - (a.checkedInAt || 0);
			});
	});
</script>

<div class="space-y-4">
	<!-- Filter bar -->
	<div class="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
		<div class="relative flex-1 max-w-md">
			<Search class="absolute left-3 top-2.5 size-4 text-muted-foreground" />
			<input
				type="text"
				placeholder="Search by student name, admission no, or team…"
				bind:value={searchQuery}
				class="w-full rounded-md border border-input bg-background pl-9 pr-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:ring-2 focus:ring-ring focus:outline-hidden"
			/>
		</div>

		<div class="flex flex-wrap items-center gap-2">
			<select
				bind:value={statusFilter}
				class="h-9 rounded-md border border-input bg-background px-3 text-xs font-medium text-foreground focus:ring-1 focus:ring-ring"
			>
				<option value="all">All Statuses</option>
				<option value="present">Present Only</option>
				<option value="not-checked-in">Not Checked In</option>
			</select>

			<select
				bind:value={roleFilter}
				class="h-9 rounded-md border border-input bg-background px-3 text-xs font-medium text-foreground focus:ring-1 focus:ring-ring"
			>
				<option value="all">All Roles</option>
				<option value="leader">Team Leaders</option>
				<option value="member">Members</option>
			</select>

			<button
				type="button"
				onclick={() => (sortAsc = !sortAsc)}
				class="inline-flex h-9 items-center gap-1.5 rounded-md border border-input bg-background px-3 text-xs font-medium text-muted-foreground hover:text-foreground"
			>
				<ArrowUpDown class="size-3.5" /> Sort
			</button>
		</div>
	</div>

	<!-- Table Container -->
	<div class="overflow-x-auto rounded-xl border border-border bg-card shadow-xs">
		<table class="w-full text-left text-xs">
			<thead class="border-b border-border bg-muted/50 text-[11px] font-semibold tracking-wider text-muted-foreground uppercase">
				<tr>
					<th class="px-4 py-3">Student Name</th>
					<th class="px-4 py-3">Admission No</th>
					<th class="px-4 py-3">Team & Event</th>
					<th class="px-4 py-3">Status</th>
					<th class="px-4 py-3">Check-in Time</th>
					<th class="px-4 py-3 text-right">Action</th>
				</tr>
			</thead>
			<tbody class="divide-y divide-border">
				{#each filteredRows as row (row.participantKey + row.teamId)}
					<tr class="transition-colors hover:bg-muted/30">
						<td class="px-4 py-3">
							<div class="font-bold text-foreground">{row.studentName}</div>
						</td>
						<td class="px-4 py-3 font-mono font-medium text-foreground">
							{row.admissionNumber || '—'}
						</td>
						<td class="px-4 py-3">
							<div class="font-medium text-foreground truncate max-w-xs">{row.teamName}</div>
							<div class="text-[11px] text-muted-foreground">{row.eventName}</div>
						</td>
						<td class="px-4 py-3">
							{#if row.status === 'present'}
								<span class="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2.5 py-0.5 text-[11px] font-bold text-emerald-800">
									<CheckCircle2 class="size-3 text-emerald-600" /> Present
								</span>
							{:else}
								<span class="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2.5 py-0.5 text-[11px] font-bold text-amber-800">
									<Clock class="size-3" /> Not Checked In
								</span>
							{/if}
						</td>
						<td class="px-4 py-3 text-muted-foreground whitespace-nowrap">
							{row.checkedInAt ? formatTimestamp(row.checkedInAt) : '—'}
						</td>
						<td class="px-4 py-3 text-right">
							{#if row.status === 'present'}
								<button
									type="button"
									onclick={() => openRevoke(row)}
									class="inline-flex h-7 items-center gap-1 rounded-md border border-destructive/30 px-2.5 text-[11px] font-semibold text-destructive hover:bg-destructive/10"
								>
									<Undo2 class="size-3" /> Revoke
								</button>
							{/if}
						</td>
					</tr>
				{:else}
					<tr>
						<td colspan="6" class="px-4 py-12 text-center text-sm text-muted-foreground">
							No student records found matching the current filters.
						</td>
					</tr>
				{/each}
			</tbody>
		</table>
	</div>

	<div class="text-xs text-muted-foreground text-right">
		Showing {filteredRows.length} of {rows.length} total students
	</div>
</div>

<Modal
	open={!!revokeTarget}
	title="Revoke attendance"
	description={revokeTarget ? `Mark ${revokeTarget.studentName} (${revokeTarget.teamName}) as not checked in.` : ''}
	onclose={closeRevoke}
>
	<form
		id="revoke-attendance"
		class="space-y-2"
		onsubmit={(e) => {
			e.preventDefault();
			confirmRevoke();
		}}
	>
		<label for="revoke-code" class="text-sm font-medium text-foreground">Revoke code</label>
		<input
			id="revoke-code"
			type="password"
			autocomplete="off"
			bind:value={revokeCode}
			placeholder="Enter the organiser revoke code"
			class="w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:ring-2 focus:ring-ring focus:outline-hidden"
		/>
		{#if revokeError}
			<p class="text-xs text-destructive">{revokeError}</p>
		{/if}
	</form>
	{#snippet footer()}
		<Button variant="outline" onclick={closeRevoke} disabled={revoking}>Cancel</Button>
		<Button variant="destructive" type="submit" form="revoke-attendance" loading={revoking}>Revoke</Button>
	{/snippet}
</Modal>
