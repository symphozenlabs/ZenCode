<script lang="ts">
	import { Users, CheckCircle2, AlertCircle, Clock, Award, ShieldAlert, ArrowRight } from '@lucide/svelte';
	import StatCard from '../StatCard.svelte';
	import type { AttendanceOverviewStats, AttendanceSession } from '$lib/attendance/model';
	import Button from '$lib/components/ui/Button.svelte';

	let {
		overview,
		session,
		onOpenScanner,
		onOpenNewSession
	}: {
		overview: AttendanceOverviewStats;
		session: AttendanceSession | null;
		onOpenScanner: () => void;
		onOpenNewSession: () => void;
	} = $props();

	const pct = $derived(overview.overallAttendancePercentage);
</script>

<div class="space-y-6">
	<!-- Active Session Banner -->
	{#if session}
		<div class="relative overflow-hidden rounded-xl border border-border bg-card p-5 shadow-xs">
			<div class="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
				<div>
					<div class="flex items-center gap-2">
						<span class="inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-semibold uppercase tracking-wider
							{session.status === 'open' ? 'bg-emerald-100 text-emerald-800' : 'bg-muted text-muted-foreground'}">
							<span class="size-2 rounded-full {session.status === 'open' ? 'animate-pulse bg-emerald-500' : 'bg-gray-400'}"></span>
							{session.status === 'open' ? 'Active Session' : 'Finalized Session'}
						</span>
						<span class="text-xs font-medium text-muted-foreground">• {session.eventName}</span>
						<span class="text-xs text-muted-foreground">• Date: {session.date}</span>
					</div>
					<h3 class="mt-1 text-xl font-bold tracking-tight text-foreground">{session.name}</h3>
					{#if session.notes}
						<p class="mt-0.5 text-xs text-muted-foreground">{session.notes}</p>
					{/if}
				</div>

				<div class="flex items-center gap-2">
					<Button onclick={onOpenScanner} variant="default">
						Open QR Scanner <ArrowRight class="size-4" />
					</Button>
				</div>
			</div>

			<!-- Progress Bar -->
			<div class="mt-4 pt-4 border-t border-border">
				<div class="flex items-center justify-between text-xs font-medium text-muted-foreground mb-1.5">
					<span>Attendance Completion Rate</span>
					<span class="font-bold text-foreground">{overview.totalPresentStudents} of {overview.totalRegisteredStudents} Students ({pct}%)</span>
				</div>
				<div class="h-2.5 w-full overflow-hidden rounded-full bg-muted">
					<div
						class="h-full rounded-full transition-all duration-500 {pct === 100 ? 'bg-emerald-500' : 'bg-primary'}"
						style="width: {pct}%"
					></div>
				</div>
			</div>
		</div>
	{:else}
		<div class="flex flex-col items-center justify-center rounded-xl border border-dashed border-border bg-card/60 p-8 text-center">
			<Clock class="size-10 text-muted-foreground/60 mb-2" />
			<h3 class="text-base font-semibold text-foreground">No Attendance Session Selected</h3>
			<p class="mt-1 max-w-md text-sm text-muted-foreground">
				Create an attendance session to start scanning team QR codes and marking student attendance.
			</p>
			<div class="mt-4">
				<Button onclick={onOpenNewSession} variant="default">Create Attendance Session</Button>
			</div>
		</div>
	{/if}

	<!-- KPI Stat Cards -->
	<div>
		<h4 class="mb-3 text-xs font-semibold tracking-wider text-muted-foreground uppercase">Student Check-in Stats</h4>
		<div class="grid grid-cols-2 gap-3 sm:grid-cols-2 lg:grid-cols-4">
			<StatCard
				label="Total Registered"
				value={overview.totalRegisteredStudents}
				helper="Students in approved teams"
			/>
			<StatCard
				label="Students Present"
				value={overview.totalPresentStudents}
				helper="{pct}% of total registered"
			/>
			{#if overview.isSessionFinalized}
				<StatCard
					label="Students Absent"
					value={overview.totalAbsentStudents}
					helper="Marked absent after finalization"
				/>
			{:else}
				<StatCard
					label="Not Checked In"
					value={overview.totalNotCheckedInStudents}
					helper="Pending check-in at desk"
				/>
			{/if}
			<StatCard
				label="Attendance Rate"
				value="{pct}%"
				helper="{overview.totalPresentStudents}/{overview.totalRegisteredStudents} present"
			/>
		</div>
	</div>

	<!-- Team Attendance Breakdown -->
	<div>
		<h4 class="mb-3 text-xs font-semibold tracking-wider text-muted-foreground uppercase">Team Check-in Stats</h4>
		<div class="grid grid-cols-2 gap-3 sm:grid-cols-2 lg:grid-cols-4">
			<StatCard
				label="Total Teams"
				value={overview.totalTeams}
				helper="Participating teams"
			/>
			<StatCard
				label="Fully Present"
				value={overview.teamsFullyPresent}
				helper="All members checked in"
			/>
			<StatCard
				label="Partially Present"
				value={overview.teamsPartiallyPresent}
				helper="Some members checked in"
			/>
			<StatCard
				label="No Check-ins"
				value={overview.teamsNoCheckIns}
				helper="0 members checked in"
			/>
		</div>
	</div>
</div>
