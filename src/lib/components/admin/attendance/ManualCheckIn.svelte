<script lang="ts">
	import { Keyboard, Search, CheckCircle2, Clock, UserCheck, AlertTriangle } from '@lucide/svelte';
	import type { StudentAttendanceRow } from '$lib/attendance/model';
	import { buildAttendanceMatrix, formatTimestamp } from '$lib/attendance/model';
	import { attendance } from '$lib/stores/attendance.svelte';
	import { registrations } from '$lib/stores/registrations.svelte';
	import Button from '$lib/components/ui/Button.svelte';

	// Fallback when a team QR pass can't be scanned: look a student up by
	// admission number, verify their profile, then check them in.

	let admissionInput = $state('');
	let searched = $state('');
	let verifiedKeys = $state<Set<string>>(new Set());
	let markingKey = $state<string | null>(null);
	let feedback = $state<{ text: string; tone: 'ok' | 'error' } | null>(null);

	const rowId = (r: StudentAttendanceRow) => `${r.teamId}__${r.participantKey}`;

	// Search across every event, regardless of the page's event filter.
	const allStudents = $derived(
		buildAttendanceMatrix(registrations.items, attendance.records, 'all').studentRows
	);

	const matches = $derived(
		searched
			? allStudents.filter((r) => r.admissionNumber.trim().toUpperCase() === searched)
			: []
	);

	function lookup(e: SubmitEvent) {
		e.preventDefault();
		searched = admissionInput.trim().toUpperCase();
		verifiedKeys = new Set();
		feedback = null;
	}

	function toggleVerified(row: StudentAttendanceRow, checked: boolean) {
		const next = new Set(verifiedKeys);
		if (checked) next.add(rowId(row));
		else next.delete(rowId(row));
		verifiedKeys = next;
	}

	async function checkIn(row: StudentAttendanceRow) {
		if (!verifiedKeys.has(rowId(row)) || markingKey) return;
		markingKey = rowId(row);
		feedback = null;
		try {
			await attendance.checkInStudent(row.teamId, row.participantKey);
			feedback = { text: `Checked in ${row.studentName}.`, tone: 'ok' };
			admissionInput = '';
		} catch (err: any) {
			feedback = { text: err.message || 'Check-in failed.', tone: 'error' };
		} finally {
			markingKey = null;
		}
	}
</script>

<div class="rounded-xl border border-border bg-card p-5 sm:p-6 shadow-xs">
	<div class="flex items-center gap-2 pb-4 border-b border-border">
		<Keyboard class="size-5 text-primary" />
		<div>
			<h3 class="text-base font-semibold text-foreground">Check in by admission number</h3>
			<p class="text-xs text-muted-foreground">Use when a QR pass can't be scanned. Verify the student's profile before checking in.</p>
		</div>
	</div>

	<form class="mt-4 flex flex-col gap-2 sm:flex-row" onsubmit={lookup}>
		<div class="relative flex-1">
			<Search class="absolute left-3 top-2.5 size-4 text-muted-foreground" />
			<input
				type="text"
				bind:value={admissionInput}
				placeholder="e.g. 25CAPMCA084"
				autocomplete="off"
				class="w-full rounded-md border border-input bg-background pl-9 pr-3 py-2 text-sm font-mono uppercase text-foreground placeholder:normal-case placeholder:font-sans placeholder:text-muted-foreground focus:ring-2 focus:ring-ring focus:outline-hidden"
			/>
		</div>
		<Button type="submit" disabled={!admissionInput.trim()}>Find student</Button>
	</form>

	{#if feedback}
		<div
			class="mt-4 flex items-center gap-2 rounded-lg border p-3 text-xs font-medium
				{feedback.tone === 'ok' ? 'border-emerald-200 bg-emerald-50 text-emerald-800' : 'border-destructive/20 bg-destructive/10 text-destructive'}"
		>
			{#if feedback.tone === 'ok'}<CheckCircle2 class="size-4 shrink-0" />{:else}<AlertTriangle class="size-4 shrink-0" />{/if}
			<span>{feedback.text}</span>
		</div>
	{/if}

	{#if searched && matches.length === 0}
		<p class="mt-4 rounded-lg border border-border bg-muted/40 p-3 text-xs text-muted-foreground">
			No registered student found with admission number <span class="font-mono font-semibold text-foreground">{searched}</span>.
		</p>
	{/if}

	{#each matches as row (rowId(row))}
		<div class="mt-4 rounded-lg border border-border p-4">
			<div class="flex flex-wrap items-start justify-between gap-2">
				<div>
					<div class="text-sm font-bold text-foreground">{row.studentName}</div>
					<div class="font-mono text-xs text-muted-foreground">{row.admissionNumber}</div>
				</div>
				{#if row.status === 'present'}
					<span class="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2.5 py-0.5 text-[11px] font-bold text-emerald-800">
						<CheckCircle2 class="size-3 text-emerald-600" /> Present
					</span>
				{:else}
					<span class="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2.5 py-0.5 text-[11px] font-bold text-amber-800">
						<Clock class="size-3" /> Not Checked In
					</span>
				{/if}
			</div>

			<dl class="mt-3 grid grid-cols-1 gap-x-6 gap-y-2 text-xs sm:grid-cols-2">
				<div><dt class="text-muted-foreground">Year / Class</dt><dd class="font-medium text-foreground">{row.yearOfStudy || '—'}</dd></div>
				<div><dt class="text-muted-foreground">Email</dt><dd class="font-medium text-foreground break-all">{row.email || '—'}</dd></div>
				<div><dt class="text-muted-foreground">Team</dt><dd class="font-medium text-foreground">{row.teamName}</dd></div>
				<div><dt class="text-muted-foreground">Event · Role</dt><dd class="font-medium text-foreground">{row.eventName} · {row.isLeader ? 'Team Leader' : 'Member'}</dd></div>
			</dl>

			{#if row.status === 'present'}
				<p class="mt-3 text-xs text-muted-foreground">
					Already checked in{row.checkedInAt ? ` at ${formatTimestamp(row.checkedInAt)}` : ''}.
				</p>
			{:else}
				<div class="mt-4 flex flex-col gap-3 border-t border-border pt-3 sm:flex-row sm:items-center sm:justify-between">
					<label class="flex items-center gap-2 text-xs text-foreground">
						<input
							type="checkbox"
							checked={verifiedKeys.has(rowId(row))}
							onchange={(e) => toggleVerified(row, e.currentTarget.checked)}
							class="size-4 rounded border-input accent-primary"
						/>
						I've verified this student's college ID card matches this profile
					</label>
					<Button
						size="sm"
						disabled={!verifiedKeys.has(rowId(row))}
						loading={markingKey === rowId(row)}
						onclick={() => checkIn(row)}
					>
						<UserCheck class="size-3.5" /> Check in
					</Button>
				</div>
			{/if}
		</div>
	{/each}
</div>
