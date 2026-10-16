<script lang="ts">
	import { Users, CheckCircle2, Clock, Award, ArrowRight, QrCode } from '@lucide/svelte';
	import StatCard from '../StatCard.svelte';
	import type { AttendanceOverviewStats, TeamAttendanceRow } from '$lib/attendance/model';
	import Button from '$lib/components/ui/Button.svelte';

	let {
		overview,
		teamRows = [],
		eventFilter = 'all',
		onOpenScanner,
		onSelectTeam
	}: {
		overview: AttendanceOverviewStats;
		teamRows?: TeamAttendanceRow[];
		eventFilter?: 'all' | 'hackathon' | 'pitch-fest';
		onOpenScanner: () => void;
		onSelectTeam?: (team: TeamAttendanceRow) => void;
	} = $props();

	const pct = $derived(overview.overallAttendancePercentage);
	const eventLabel = $derived(
		eventFilter === 'hackathon'
			? 'Hackathon'
			: eventFilter === 'pitch-fest'
				? 'Pitch Fest'
				: 'All Events'
	);

	// Only teams that currently have at least one present member and at least one member who has not checked in
	const partiallyAttendedTeams = $derived(
		teamRows.filter((t) => t.presentCount > 0 && t.notCheckedInCount > 0)
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

	<!-- Partially Attended Teams Section -->
	<div class="space-y-3">
		<div class="flex items-center justify-between">
			<div class="flex items-center gap-2">
				<h4 class="text-xs font-semibold tracking-wider text-muted-foreground uppercase">
					Partially Attended Teams
				</h4>
				{#if partiallyAttendedTeams.length > 0}
					<span class="inline-flex items-center justify-center rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-bold text-amber-800">
						{partiallyAttendedTeams.length}
					</span>
				{/if}
			</div>
		</div>

		{#if partiallyAttendedTeams.length === 0}
			<div class="rounded-xl border border-dashed border-border bg-card/60 p-6 text-center text-xs text-muted-foreground">
				No partially attended teams.
			</div>
		{:else}
			<div class="grid gap-3 sm:grid-cols-1 lg:grid-cols-2">
				{#each partiallyAttendedTeams as team (team.teamId)}
					<div class="flex flex-col justify-between rounded-xl border border-border bg-card p-4 shadow-xs transition-colors hover:border-primary/40">
						<div>
							<!-- Header -->
							<div class="flex items-start justify-between gap-3 border-b border-border pb-3">
								<div class="space-y-0.5">
									<div class="flex items-center gap-2 flex-wrap">
										<h5 class="font-bold text-sm text-foreground">{team.teamName}</h5>
										<code class="rounded bg-muted px-1.5 py-0.5 text-[10px] font-mono text-muted-foreground">
											{team.teamId}
										</code>
									</div>
									<p class="text-xs text-muted-foreground">
										{team.eventName} · <span class="font-semibold text-foreground">{team.presentCount} of {team.registeredMemberCount} members present</span>
									</p>
								</div>

								{#if onSelectTeam}
									<Button
										size="sm"
										variant="outline"
										onclick={() => onSelectTeam(team)}
										class="shrink-0 h-8 px-2.5 text-xs"
									>
										View Team <ArrowRight class="size-3.5 ml-1" />
									</Button>
								{/if}
							</div>

							<!-- Compact Member List -->
							<ul class="mt-3 space-y-1.5">
								{#each team.members as member (member.participantKey)}
									<li class="flex items-center justify-between rounded-md bg-muted/40 px-2.5 py-1.5 text-xs">
										<div class="flex items-center gap-1.5 truncate mr-2">
											<span class="font-medium text-foreground truncate">{member.studentName}</span>
											{#if member.isLeader}
												<span class="rounded bg-muted px-1 py-0.2 text-[10px] font-semibold text-muted-foreground uppercase">
													Lead
												</span>
											{/if}
										</div>

										{#if member.status === 'present'}
											<span class="inline-flex shrink-0 items-center gap-1 rounded-full bg-emerald-100 px-2.5 py-0.5 text-[10px] font-bold text-emerald-800">
												<CheckCircle2 class="size-2.5 text-emerald-600" /> Present
											</span>
										{:else}
											<span class="inline-flex shrink-0 items-center gap-1 rounded-full bg-amber-100 px-2.5 py-0.5 text-[10px] font-bold text-amber-800">
												<Clock class="size-2.5 text-amber-600" /> Not Checked In
											</span>
										{/if}
									</li>
								{/each}
							</ul>
						</div>
					</div>
				{/each}
			</div>
		{/if}
	</div>
</div>
