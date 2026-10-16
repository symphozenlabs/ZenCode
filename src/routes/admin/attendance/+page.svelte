<script lang="ts">
	import { page } from '$app/state';
	import { goto } from '$app/navigation';
	import {
		LayoutDashboard,
		QrCode,
		Users,
		CheckCircle,
		AlertTriangle
	} from '@lucide/svelte';
	import PageHeader from '$lib/components/admin/PageHeader.svelte';

	import { attendance } from '$lib/stores/attendance.svelte';
	import { registrations } from '$lib/stores/registrations.svelte';
	import type { StudentAttendanceRow, TeamAttendanceRow } from '$lib/attendance/model';

	import AttendanceOverview from '$lib/components/admin/attendance/AttendanceOverview.svelte';
	import AttendanceQrScanner from '$lib/components/admin/attendance/AttendanceQrScanner.svelte';
	import TeamAttendancePanel from '$lib/components/admin/attendance/TeamAttendancePanel.svelte';
	import StudentRecordsTable from '$lib/components/admin/attendance/StudentRecordsTable.svelte';

	// Real-time subscriptions
	$effect(() => registrations.subscribe());
	$effect(() => attendance.subscribe());

	// Active Tab derived from query param (defaults to 'scanner' or 'overview')
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
	let actionError = $state<string | null>(null);
	let actionToast = $state<{ text: string; tone: 'ok' | 'error' } | null>(null);

	const matrix = $derived(attendance.matrix);

	// When team is found by QR Scanner
	function handleTeamFound(teamId: string) {
		const cleanId = teamId.trim();
		actionError = null;

		// 1. Look up in current calculated teamRows
		const found = matrix.teamRows.find(
			(t) => t.teamId.toLowerCase() === cleanId.toLowerCase() || t.teamId.slice(0, 6).toUpperCase() === cleanId.toUpperCase()
		);

		if (found) {
			selectedTeamRow = found;
			actionToast = { text: `Found team: "${found.teamName}" (${found.eventName})`, tone: 'ok' };
			setTimeout(() => {
				if (actionToast?.text.includes(found.teamName)) actionToast = null;
			}, 3000);
			return;
		}

		// 2. Check if team exists in registrations across all events
		const allRegs = registrations.items.find(
			(r) => r.id.toLowerCase() === cleanId.toLowerCase() || r.id.slice(0, 6).toUpperCase() === cleanId.toUpperCase()
		);

		if (allRegs) {
			if (attendance.eventFilter !== 'all' && allRegs.event !== attendance.eventFilter) {
				// Switch filter to match this team's event automatically
				attendance.eventFilter = 'all';
				const reFound = attendance.matrix.teamRows.find(
					(t) => t.teamId.toLowerCase() === cleanId.toLowerCase()
				);
				if (reFound) {
					selectedTeamRow = reFound;
					actionToast = { text: `Found team: "${reFound.teamName}" (${reFound.eventName})`, tone: 'ok' };
					setTimeout(() => (actionToast = null), 3000);
					return;
				}
			}
			if (allRegs.status === 'rejected') {
				actionError = `Team "${allRegs.teamName || allRegs.id}" is marked as rejected and is not eligible for attendance.`;
			} else {
				actionError = `Team found in registrations, but roster could not be loaded.`;
			}
		} else {
			actionError = `No registered team found with Team ID: "${cleanId}". Please check the scanned pass or team ID.`;
		}
	}

	// Keep selectedTeamRow synced with live matrix updates (e.g. when students are checked in)
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
</script>

<svelte:head>
	<title>Attendance & QR Check-in — ZenCode Admin</title>
</svelte:head>

<!-- Page Header -->
<PageHeader
	eyebrow="Operations"
	title="Attendance Management"
	description="Scan team QR passes to load the team roster, verify individual student details, and record live check-ins directly to Firestore."
/>

<!-- Control Bar: Event filter -->
<div class="mb-6 flex flex-col gap-3 rounded-xl border border-border bg-card p-3 sm:flex-row sm:items-center sm:justify-between shadow-xs">
	<div class="flex items-center gap-2">
		<span class="text-xs text-muted-foreground font-semibold uppercase tracking-wider">Filter by Event:</span>
		<select
			bind:value={attendance.eventFilter}
			class="h-8.5 rounded-md border border-input bg-background px-3 text-xs font-medium text-foreground focus:ring-1 focus:ring-ring"
		>
			<option value="all">All Events (Hackathon & Pitch Fest)</option>
			<option value="hackathon">Hackathon Only</option>
			<option value="pitch-fest">Pitch Fest Only</option>
		</select>
	</div>

	<div class="text-xs text-muted-foreground">
		<span class="font-medium text-foreground">{matrix.overview.totalPresentStudents}</span> of <span class="font-medium text-foreground">{matrix.overview.totalRegisteredStudents}</span> students present ({matrix.overview.overallAttendancePercentage}%)
	</div>
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

<!-- Navigation Tabs -->
<div class="mb-6 flex gap-1 border-b border-border" role="tablist">
	{#each [
		{ id: 'overview', label: 'Overview Dashboard', icon: LayoutDashboard },
		{ id: 'scanner', label: 'QR Scanner & Check-in', icon: QrCode },
		{ id: 'students', label: 'Student Records', icon: Users }
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
		teamRows={matrix.teamRows}
		eventFilter={attendance.eventFilter}
		onOpenScanner={() => setTab('scanner')}
		onSelectTeam={(team) => {
			selectedTeamRow = team;
			setTab('scanner');
		}}
	/>
{:else if activeTab === 'scanner'}
	<div class="space-y-6">
		<AttendanceQrScanner
			onTeamFound={handleTeamFound}
			onScanError={(err) => (actionError = err)}
		/>

		<!-- Scanned Team Attendance Panel displayed directly in the Scanner view -->
		{#if selectedTeamRow}
			<div class="pt-2">
				<TeamAttendancePanel
					teamRow={selectedTeamRow}
					onMarkStudentPresent={handleMarkStudentPresent}
					onMarkAllPresent={handleMarkAllPresent}
					onClose={() => (selectedTeamRow = null)}
				/>
			</div>
		{/if}
	</div>
{:else if activeTab === 'students'}
	<StudentRecordsTable
		rows={matrix.studentRows}
	/>
{/if}
