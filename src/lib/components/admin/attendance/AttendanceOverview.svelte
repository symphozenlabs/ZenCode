<script lang="ts">
	import { Users, CheckCircle2, Clock, Award, ArrowRight, QrCode } from '@lucide/svelte';
	import StatCard from '../StatCard.svelte';
	import type { AttendanceOverviewStats } from '$lib/attendance/model';
	import Button from '$lib/components/ui/Button.svelte';

	let {
		overview,
		eventFilter = 'all',
		onOpenScanner
	}: {
		overview: AttendanceOverviewStats;
		eventFilter?: 'all' | 'hackathon' | 'pitch-fest';
		onOpenScanner: () => void;
	} = $props();

	const pct = $derived(overview.overallAttendancePercentage);
	const eventLabel = $derived(
		eventFilter === 'hackathon'
			? 'Hackathon'
			: eventFilter === 'pitch-fest'
				? 'Pitch Fest'
				: 'All Events'
	);
</script>

<div class="space-y-6">
	<!-- Overview Status Banner -->
	<div class="relative overflow-hidden rounded-xl border border-border bg-card p-5 shadow-xs">
		<div class="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
			<div>
				<div class="flex items-center gap-2">
					<span class="inline-flex items-center gap-1.5 rounded-full bg-emerald-100 px-2.5 py-0.5 text-xs font-semibold uppercase tracking-wider text-emerald-800">
						<span class="size-2 rounded-full animate-pulse bg-emerald-500"></span>
						Live Attendance
					</span>
					<span class="text-xs font-medium text-muted-foreground">• {eventLabel}</span>
				</div>
				<h3 class="mt-1 text-xl font-bold tracking-tight text-foreground">
					{overview.totalPresentStudents} of {overview.totalRegisteredStudents} Students Present ({pct}%)
				</h3>
				<p class="mt-0.5 text-xs text-muted-foreground">
					Scanning team QR passes records individual student check-ins immediately to Firestore.
				</p>
			</div>

			<div class="flex items-center gap-2">
				<Button onclick={onOpenScanner} variant="default">
					<QrCode class="size-4" /> Open QR Scanner <ArrowRight class="size-4" />
				</Button>
			</div>
		</div>

		<!-- Progress Bar -->
		<div class="mt-4 pt-4 border-t border-border">
			<div class="flex items-center justify-between text-xs font-medium text-muted-foreground mb-1.5">
				<span>Overall Attendance Completion</span>
				<span class="font-bold text-foreground">{pct}%</span>
			</div>
			<div class="h-2.5 w-full overflow-hidden rounded-full bg-muted">
				<div
					class="h-full rounded-full transition-all duration-500 {pct === 100 ? 'bg-emerald-500' : 'bg-primary'}"
					style="width: {pct}%"
				></div>
			</div>
		</div>
	</div>

	<!-- KPI Stat Cards -->
	<div>
		<h4 class="mb-3 text-xs font-semibold tracking-wider text-muted-foreground uppercase">Student Check-in Stats</h4>
		<div class="grid grid-cols-2 gap-3 sm:grid-cols-2 lg:grid-cols-4">
			<StatCard
				label="Total Registered"
				value={overview.totalRegisteredStudents}
				helper="Students in eligible teams"
			/>
			<StatCard
				label="Students Present"
				value={overview.totalPresentStudents}
				helper="{pct}% of registered students"
			/>
			<StatCard
				label="Not Checked In"
				value={overview.totalNotCheckedInStudents}
				helper="Awaiting check-in at desk"
			/>
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
