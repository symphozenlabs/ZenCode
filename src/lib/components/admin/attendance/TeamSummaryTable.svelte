<script lang="ts">
	import { Search, Users, ExternalLink, CheckCircle2, Clock, AlertCircle } from '@lucide/svelte';
	import type { TeamAttendanceRow } from '$lib/attendance/model';
	import Button from '$lib/components/ui/Button.svelte';

	let {
		teams,
		onSelectTeam
	}: {
		teams: TeamAttendanceRow[];
		onSelectTeam: (team: TeamAttendanceRow) => void;
	} = $props();

	let searchQuery = $state('');
	let statusFilter = $state<string>('all');

	const filteredTeams = $derived.by(() => {
		const q = searchQuery.trim().toLowerCase();
		return teams.filter((t) => {
			if (statusFilter !== 'all' && t.status !== statusFilter) return false;
			if (!q) return true;
			return (
				t.teamName.toLowerCase().includes(q) ||
				t.teamId.toLowerCase().includes(q) ||
				t.teamLeaderName.toLowerCase().includes(q)
			);
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
				placeholder="Search teams by name, ID, or leader…"
				bind:value={searchQuery}
				class="w-full rounded-md border border-input bg-background pl-9 pr-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:ring-2 focus:ring-ring focus:outline-hidden"
			/>
		</div>

		<div class="flex items-center gap-2">
			<select
				bind:value={statusFilter}
				class="h-9 rounded-md border border-input bg-background px-3 text-xs font-medium text-foreground focus:ring-1 focus:ring-ring"
			>
				<option value="all">All Team States</option>
				<option value="Fully Present">Fully Present</option>
				<option value="Partially Present">Partially Present</option>
				<option value="No Check-ins">No Check-ins</option>
				<option value="Attendance Pending">Attendance Pending</option>
			</select>
		</div>
	</div>

	<!-- Table Container -->
	<div class="overflow-x-auto rounded-xl border border-border bg-card shadow-xs">
		<table class="w-full text-left text-xs">
			<thead class="border-b border-border bg-muted/50 text-[11px] font-semibold tracking-wider text-muted-foreground uppercase">
				<tr>
					<th class="px-4 py-3">Team Name & Leader</th>
					<th class="px-4 py-3">Event</th>
					<th class="px-4 py-3">Team ID</th>
					<th class="px-4 py-3">Registered</th>
					<th class="px-4 py-3">Present</th>
					<th class="px-4 py-3">Not Checked In</th>
					<th class="px-4 py-3">Attendance %</th>
					<th class="px-4 py-3">Team Status</th>
					<th class="px-4 py-3 text-right">Action</th>
				</tr>
			</thead>
			<tbody class="divide-y divide-border">
				{#each filteredTeams as team (team.teamId)}
					<tr class="transition-colors hover:bg-muted/30">
						<td class="px-4 py-3">
							<div class="font-bold text-foreground">{team.teamName}</div>
							<div class="text-[11px] text-muted-foreground">Leader: {team.teamLeaderName}</div>
						</td>
						<td class="px-4 py-3">
							<span class="rounded bg-muted px-1.5 py-0.5 text-[11px] font-semibold text-muted-foreground">
								{team.eventName}
							</span>
						</td>
						<td class="px-4 py-3 font-mono font-medium text-foreground">
							{team.teamId}
						</td>
						<td class="px-4 py-3 font-semibold text-foreground">
							{team.registeredMemberCount}
						</td>
						<td class="px-4 py-3 font-bold text-emerald-600">
							{team.presentCount}
						</td>
						<td class="px-4 py-3 font-bold {team.notCheckedInCount > 0 ? 'text-amber-600' : 'text-muted-foreground'}">
							{team.notCheckedInCount + team.absentCount}
						</td>
						<td class="px-4 py-3">
							<div class="flex items-center gap-2">
								<div class="h-2 w-16 overflow-hidden rounded-full bg-muted">
									<div
										class="h-full rounded-full {team.attendancePercentage === 100 ? 'bg-emerald-500' : 'bg-primary'}"
										style="width: {team.attendancePercentage}%"
									></div>
								</div>
								<span class="font-medium">{team.attendancePercentage}%</span>
							</div>
						</td>
						<td class="px-4 py-3">
							<span class="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-bold
								{team.status === 'Fully Present' ? 'bg-emerald-100 text-emerald-800' : team.status === 'Partially Present' ? 'bg-amber-100 text-amber-800' : 'bg-muted text-muted-foreground'}">
								<span class="size-1.5 rounded-full {team.status === 'Fully Present' ? 'bg-emerald-500' : team.status === 'Partially Present' ? 'bg-amber-500' : 'bg-gray-400'}"></span>
								{team.status}
							</span>
						</td>
						<td class="px-4 py-3 text-right">
							<Button variant="outline" onclick={() => onSelectTeam(team)} class="h-7 text-xs px-2.5">
								View Roster
							</Button>
						</td>
					</tr>
				{:else}
					<tr>
						<td colspan="9" class="px-4 py-12 text-center text-sm text-muted-foreground">
							No teams found matching your search.
						</td>
					</tr>
				{/each}
			</tbody>
		</table>
	</div>

	<div class="text-xs text-muted-foreground text-right">
		Showing {filteredTeams.length} of {teams.length} teams
	</div>
</div>
