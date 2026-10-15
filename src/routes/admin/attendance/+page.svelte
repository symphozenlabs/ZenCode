<script lang="ts">
	import { onMount } from 'svelte';
	import { page } from '$app/state';
	import { goto } from '$app/navigation';
	import {
		LayoutDashboard,
		QrCode,
		Users,
		Award,
		Download,
		History,
		Plus,
		CheckCircle,
		AlertTriangle,
		Lock,
		Unlock,
		RefreshCw
	} from '@lucide/svelte';
	import PageHeader from '$lib/components/admin/PageHeader.svelte';
	import Button from '$lib/components/ui/Button.svelte';
	import Modal from '$lib/components/ui/Modal.svelte';
	import Spinner from '$lib/components/ui/Spinner.svelte';

	import { attendance } from '$lib/stores/attendance.svelte';
	import { registrations } from '$lib/stores/registrations.svelte';
	import type { EventId } from '$lib/config/site';
	import type {
		AttendanceSession,
		StudentAttendanceRow,
		TeamAttendanceRow
	} from '$lib/attendance/model';

	import AttendanceOverview from '$lib/components/admin/attendance/AttendanceOverview.svelte';
	import AttendanceQrScanner from '$lib/components/admin/attendance/AttendanceQrScanner.svelte';
	import TeamAttendancePanel from '$lib/components/admin/attendance/TeamAttendancePanel.svelte';
	import StudentRecordsTable from '$lib/components/admin/attendance/StudentRecordsTable.svelte';
	import TeamSummaryTable from '$lib/components/admin/attendance/TeamSummaryTable.svelte';
	import CorrectionModal from '$lib/components/admin/attendance/CorrectionModal.svelte';
	import SessionModal from '$lib/components/admin/attendance/SessionModal.svelte';
	import AuditLogModal from '$lib/components/admin/attendance/AuditLogModal.svelte';

	// Real-time subscriptions
	$effect(() => registrations.subscribe());
	$effect(() => attendance.subscribe());

	// Active Tab derived from query param
	const activeTab = $derived(
		page.url.searchParams.get('tab') || 'overview'
	);

	function setTab(t: string) {
		const url = new URL(page.url);
		url.searchParams.set('tab', t);
		goto(url, { replaceState: true, noScroll: true, keepFocus: true });
	}

	// Local State
	let selectedTeamRow = $state<TeamAttendanceRow | null>(null);
	let correctingMember = $state<StudentAttendanceRow | null>(null);
	let sessionModalOpen = $state(false);
	let auditModalOpen = $state(false);
	let finalizeModalOpen = $state(false);
	let exportDropdownOpen = $state(false);
	let actionError = $state<string | null>(null);
	let actionToast = $state<{ text: string; tone: 'ok' | 'error' } | null>(null);

	const activeSession = $derived(attendance.activeSession);
	const matrix = $derived(attendance.matrix);

	// Filtered sessions for dropdown based on eventFilter
	const availableSessions = $derived(
		attendance.eventFilter === 'all'
			? attendance.sessions
			: attendance.sessions.filter((s) => s.eventId === attendance.eventFilter)
	);

	// When team is found by QR Scanner or Manual Search
	function handleTeamFound(teamId: string) {
		const cleanId = teamId.trim();
		actionError = null;

		// Find in matrix
		const found = matrix.teamRows.find(
			(t) => t.teamId.toLowerCase() === cleanId.toLowerCase() || t.teamId.slice(0, 6).toUpperCase() === cleanId.toUpperCase()
		);

		if (found) {
			selectedTeamRow = found;
			actionToast = { text: `Found team: "${found.teamName}"`, tone: 'ok' };
			setTimeout(() => {
				if (actionToast?.text.includes(found.teamName)) actionToast = null;
			}, 3000);
		} else {
			// Check if exists in registrations but different event or session
			const allRegs = registrations.items.find(
				(r) => r.id.toLowerCase() === cleanId.toLowerCase() || r.id.slice(0, 6).toUpperCase() === cleanId.toUpperCase()
			);

			if (allRegs) {
				if (activeSession && allRegs.event !== activeSession.eventId) {
					actionError = `Team "${allRegs.teamName || allRegs.id}" is registered for ${allRegs.event === 'pitch-fest' ? 'Pitch Fest' : 'Hackathon'}, but current session is for ${activeSession.eventName}. Please switch event/session.`;
				} else {
					actionError = `Team found in registrations, but is rejected or not eligible for attendance in this session.`;
				}
			} else {
				actionError = `No registered team found with Team ID: "${cleanId}". Unregistered passes cannot be checked in.`;
			}
		}
	}

	// Keep selectedTeamRow synced with live matrix updates
	$effect(() => {
		if (selectedTeamRow) {
			const updated = matrix.teamRows.find((t) => t.teamId === selectedTeamRow?.teamId);
			if (updated) {
				selectedTeamRow = updated;
			}
		}
	});

	async function handleMarkStudentPresent(member: StudentAttendanceRow) {
		try {
			await attendance.checkInStudent(member.teamId, member.participantKey);
		} catch (err: any) {
			throw err;
		}
	}

	async function handleMarkAllPresent(members: StudentAttendanceRow[]) {
		if (!selectedTeamRow) return;
		const keys = members.map((m) => m.participantKey);
		await attendance.checkInAll(selectedTeamRow.teamId, keys);
	}

	async function handleSaveCorrection(recordId: string, newStatus: 'present' | 'not-checked-in' | 'absent', reason: string) {
		await attendance.correctRecord(recordId, newStatus, reason);
		actionToast = { text: 'Audited correction saved successfully.', tone: 'ok' };
		setTimeout(() => (actionToast = null), 3000);
	}

	async function handleCreateSession(params: { name: string; eventId: EventId; date: string; notes?: string }) {
		await attendance.createSession(params);
		actionToast = { text: `Session "${params.name}" created.`, tone: 'ok' };
		setTimeout(() => (actionToast = null), 3000);
	}

	async function handleToggleFinalizeSession() {
		if (!activeSession) return;
		const newStatus = activeSession.status === 'open' ? 'finalized' : 'open';
		try {
			await attendance.updateSessionStatus(activeSession.id, newStatus);
			finalizeModalOpen = false;
			actionToast = {
				text: `Session "${activeSession.name}" has been ${newStatus === 'finalized' ? 'finalized' : 'reopened'}.`,
				tone: 'ok'
			};
			setTimeout(() => (actionToast = null), 4000);
		} catch (err: any) {
			actionError = err.message || 'Failed to update session status.';
		}
	}

	async function triggerExport(type: 'students' | 'teams' | 'event') {
		exportDropdownOpen = false;
		try {
			await attendance.downloadExport(type);
		} catch (err: any) {
			actionError = err.message || 'Failed to export CSV.';
		}
	}
</script>

<svelte:head>
	<title>Attendance & QR Check-in — ZenCode Admin</title>
</svelte:head>

<!-- Page Header -->
<PageHeader
	eyebrow="Operations"
	title="Attendance Management"
	description="Scan team QR passes, verify individual student rosters, record live check-ins, and manage attendance sessions."
>
	{#snippet actions()}
		<div class="flex flex-wrap items-center gap-2">
			<!-- Audit Log button -->
			<Button variant="outline" onclick={() => (auditModalOpen = true)}>
				<History class="size-4" /> Audit Log
				{#if attendance.auditLogs.length > 0}
					<span class="ml-1 rounded-full bg-muted px-1.5 py-0.2 text-[10px] font-bold">
						{attendance.auditLogs.length}
					</span>
				{/if}
			</Button>

			<!-- Export CSV dropdown -->
			<div class="relative">
				<Button
					variant="outline"
					onclick={() => (exportDropdownOpen = !exportDropdownOpen)}
					disabled={!activeSession}
				>
					<Download class="size-4" /> Export CSV
				</Button>

				{#if exportDropdownOpen}
					<div
						class="absolute right-0 top-full mt-1.5 z-50 w-56 rounded-lg border border-border bg-card p-1 shadow-lg"
					>
						<button
							type="button"
							onclick={() => triggerExport('students')}
							class="w-full text-left rounded-md px-3 py-2 text-xs font-medium text-foreground hover:bg-muted"
						>
							📄 Individual Student Records
						</button>
						<button
							type="button"
							onclick={() => triggerExport('teams')}
							class="w-full text-left rounded-md px-3 py-2 text-xs font-medium text-foreground hover:bg-muted"
						>
							👥 Team Attendance Summary
						</button>
						<button
							type="button"
							onclick={() => triggerExport('event')}
							class="w-full text-left rounded-md px-3 py-2 text-xs font-medium text-foreground hover:bg-muted"
						>
							📊 Overall Event Report
						</button>
					</div>
				{/if}
			</div>

			<!-- New Session button -->
			<Button variant="default" onclick={() => (sessionModalOpen = true)}>
				<Plus class="size-4" /> New Session
			</Button>
		</div>
	{/snippet}
</PageHeader>

<!-- Control Bar: Event filter & Session selector -->
<div class="mb-6 flex flex-col gap-3 rounded-xl border border-border bg-card p-3 sm:flex-row sm:items-center sm:justify-between shadow-xs">
	<div class="flex flex-wrap items-center gap-2.5">
		<!-- Event Filter -->
		<div class="flex items-center gap-1.5 text-xs text-muted-foreground font-semibold uppercase tracking-wider">
			<span>Event:</span>
			<select
				bind:value={attendance.eventFilter}
				class="h-8.5 rounded-md border border-input bg-background px-2.5 text-xs font-medium text-foreground focus:ring-1 focus:ring-ring"
			>
				<option value="all">All Events</option>
				<option value="hackathon">Hackathon</option>
				<option value="pitch-fest">Pitch Fest</option>
			</select>
		</div>

		<!-- Session Selector -->
		<div class="flex items-center gap-1.5 text-xs text-muted-foreground font-semibold uppercase tracking-wider">
			<span>Session:</span>
			{#if availableSessions.length > 0}
				<select
					value={activeSession?.id || ''}
					onchange={(e) => attendance.selectSession((e.target as HTMLSelectElement).value)}
					class="h-8.5 max-w-xs truncate rounded-md border border-input bg-background px-2.5 text-xs font-medium text-foreground focus:ring-1 focus:ring-ring"
				>
					{#each availableSessions as s}
						<option value={s.id}>
							{s.eventName}: {s.name} ({s.date}) — {s.status.toUpperCase()}
						</option>
					{/each}
				</select>
			{:else}
				<span class="text-xs italic text-muted-foreground">No sessions created</span>
			{/if}
		</div>
	</div>

	<!-- Session Finalization Controls -->
	{#if activeSession}
		<div class="flex items-center gap-2">
			{#if activeSession.status === 'open'}
				<Button
					variant="outline"
					onclick={() => (finalizeModalOpen = true)}
					class="h-8 text-xs font-semibold text-amber-700 hover:bg-amber-50 border-amber-200"
				>
					<Lock class="size-3.5" /> Finalize Session
				</Button>
			{:else}
				<Button
					variant="outline"
					onclick={() => (finalizeModalOpen = true)}
					class="h-8 text-xs font-semibold text-emerald-700 hover:bg-emerald-50 border-emerald-200"
				>
					<Unlock class="size-3.5" /> Reopen Session
				</Button>
			{/if}
		</div>
	{/if}
</div>

<!-- Alerts / Error Banners -->
{#if actionError}
	<div class="mb-6 flex items-start justify-between rounded-lg border border-destructive/20 bg-destructive/10 p-3.5 text-xs text-destructive">
		<div class="flex items-center gap-2">
			<AlertTriangle class="size-4 shrink-0" />
			<span>{actionError}</span>
		</div>
		<button type="button" onclick={() => (actionError = null)} class="opacity-70 hover:opacity-100 font-bold ml-2">×</button>
	</div>
{/if}

{#if actionToast}
	<div class="mb-6 flex items-center justify-between rounded-lg border border-emerald-200 bg-emerald-50 p-3.5 text-xs font-medium text-emerald-800">
		<div class="flex items-center gap-2">
			<CheckCircle class="size-4 text-emerald-600 shrink-0" />
			<span>{actionToast.text}</span>
		</div>
		<button type="button" onclick={() => (actionToast = null)} class="opacity-70 hover:opacity-100 font-bold ml-2">×</button>
	</div>
{/if}

<!-- Active Team Roster Drawer / Panel (if selected or scanned) -->
{#if selectedTeamRow}
	<div class="mb-8">
		<TeamAttendancePanel
			teamRow={selectedTeamRow}
			session={activeSession}
			onMarkStudentPresent={handleMarkStudentPresent}
			onMarkAllPresent={handleMarkAllPresent}
			onCorrectStudent={(member) => (correctingMember = member)}
			onClose={() => (selectedTeamRow = null)}
		/>
	</div>
{/if}

<!-- Navigation Tabs -->
<div class="mb-6 flex gap-1 border-b border-border" role="tablist">
	{#each [
		{ id: 'overview', label: 'Overview Dashboard', icon: LayoutDashboard },
		{ id: 'scanner', label: 'QR Scanner & Check-in', icon: QrCode },
		{ id: 'students', label: 'Student Records', icon: Users },
		{ id: 'teams', label: 'Team Summary', icon: Award }
	] as tab (tab.id)}
		<button
			type="button"
			role="tab"
			aria-selected={activeTab === tab.id}
			onclick={() => setTab(tab.id)}
			class="-mb-px flex h-10 items-center gap-2 border-b-2 px-3.5 text-sm font-medium transition-colors duration-150
				{activeTab === tab.id ? 'border-primary text-foreground' : 'border-transparent text-muted-foreground hover:text-foreground'}"
		>
			<tab.icon class="size-4 {activeTab === tab.id ? 'text-primary' : ''}" />
			<span>{tab.label}</span>
		</button>
	{/each}
</div>

<!-- Tab Contents -->
{#if activeTab === 'overview'}
	<AttendanceOverview
		overview={matrix.overview}
		session={activeSession}
		onOpenScanner={() => setTab('scanner')}
		onOpenNewSession={() => (sessionModalOpen = true)}
	/>
{:else if activeTab === 'scanner'}
	<div class="space-y-6">
		<AttendanceQrScanner
			onTeamFound={handleTeamFound}
			onScanError={(err) => (actionError = err)}
		/>
	</div>
{:else if activeTab === 'students'}
	<StudentRecordsTable
		rows={matrix.studentRows}
		onCorrect={(member) => (correctingMember = member)}
	/>
{:else if activeTab === 'teams'}
	<TeamSummaryTable
		teams={matrix.teamRows}
		onSelectTeam={(team) => {
			selectedTeamRow = team;
			window.scrollTo({ top: 120, behavior: 'smooth' });
		}}
	/>
{/if}

<!-- Modals -->
{#if sessionModalOpen}
	<SessionModal
		defaultEventId={attendance.eventFilter === 'pitch-fest' ? 'pitch-fest' : 'hackathon'}
		onSave={handleCreateSession}
		onClose={() => (sessionModalOpen = false)}
	/>
{/if}

{#if correctingMember}
	<CorrectionModal
		member={correctingMember}
		onSave={handleSaveCorrection}
		onClose={() => (correctingMember = null)}
	/>
{/if}

{#if auditModalOpen}
	<AuditLogModal
		logs={attendance.auditLogs}
		onClose={() => (auditModalOpen = false)}
	/>
{/if}

<!-- Finalize / Reopen Confirmation Modal -->
{#if finalizeModalOpen && activeSession}
	<Modal
		open={finalizeModalOpen}
		title={activeSession.status === 'open' ? 'Finalize Attendance Session' : 'Reopen Attendance Session'}
		onclose={() => (finalizeModalOpen = false)}
	>
		<div class="space-y-4">
			{#if activeSession.status === 'open'}
				<p class="text-sm text-foreground">
					Are you sure you want to finalize <strong>"{activeSession.name}"</strong>?
				</p>
				<div class="rounded-lg bg-amber-50 border border-amber-200 p-3 text-xs text-amber-900 space-y-1">
					<p class="font-semibold">⚠️ Finalization Impact:</p>
					<p>• All remaining unchecked students ({matrix.overview.totalNotCheckedInStudents}) will be marked as <strong>Absent</strong>.</p>
					<p>• Ordinary desk check-ins will be locked unless an administrator reopens the session or makes an audited correction.</p>
				</div>
			{:else}
				<p class="text-sm text-foreground">
					Reopen <strong>"{activeSession.name}"</strong> for desk check-ins?
				</p>
				<p class="text-xs text-muted-foreground">
					Students currently marked absent who have not checked in will revert to "Not Checked In (Pending)".
				</p>
			{/if}

			<div class="flex items-center justify-end gap-2 pt-2 border-t border-border">
				<Button variant="outline" onclick={() => (finalizeModalOpen = false)}>Cancel</Button>
				<Button
					variant="default"
					onclick={handleToggleFinalizeSession}
				>
					{activeSession.status === 'open' ? 'Confirm Finalize' : 'Confirm Reopen'}
				</Button>
			</div>
		</div>
	</Modal>
{/if}
