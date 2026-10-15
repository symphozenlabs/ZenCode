<script lang="ts">
	import type { AttendanceAuditLog } from '$lib/attendance/model';
	import { formatTimestamp } from '$lib/attendance/model';
	import Modal from '$lib/components/ui/Modal.svelte';
	import Button from '$lib/components/ui/Button.svelte';
	import { History, ShieldCheck } from '@lucide/svelte';

	let {
		logs,
		onClose
	}: {
		logs: AttendanceAuditLog[];
		onClose: () => void;
	} = $props();
</script>

<Modal open={true} title="Attendance Correction Audit Log" onclose={onClose}>
	<div class="space-y-4">
		<p class="text-xs text-muted-foreground">
			Every manual adjustment or status override is logged with the organizer's email, timestamp, and mandatory justification.
		</p>

		{#if logs.length === 0}
			<div class="rounded-lg border border-dashed border-border p-8 text-center text-xs text-muted-foreground">
				No manual attendance corrections have been recorded yet.
			</div>
		{:else}
			<div class="max-h-[60vh] overflow-y-auto space-y-3 pr-1">
				{#each logs as log (log.id)}
					<div class="rounded-lg border border-border bg-card p-3.5 text-xs space-y-2">
						<div class="flex items-center justify-between border-b border-border/60 pb-2">
							<div class="flex items-center gap-1.5 font-bold text-foreground">
								<span>{log.studentName}</span>
								<span class="font-mono text-[11px] text-muted-foreground font-normal">({log.admissionNumber})</span>
							</div>
							<span class="text-[11px] text-muted-foreground font-mono">{formatTimestamp(log.timestamp)}</span>
						</div>

						<div class="grid grid-cols-2 gap-2 text-[11px]">
							<div>
								<span class="text-muted-foreground">Previous Status:</span>
								<span class="font-semibold uppercase text-muted-foreground ml-1">{log.previousStatus}</span>
							</div>
							<div>
								<span class="text-muted-foreground">Corrected To:</span>
								<span class="font-bold uppercase text-primary ml-1">{log.newStatus}</span>
							</div>
						</div>

						<div class="rounded bg-muted/60 p-2 text-[11px]">
							<span class="font-semibold text-foreground">Reason:</span>
							<p class="mt-0.5 text-foreground italic">"{log.reason}"</p>
						</div>

						<div class="text-[10px] text-muted-foreground flex items-center justify-between pt-1">
							<span>Changed by: <strong>{log.changedBy}</strong></span>
							<span>Team ID: <code class="font-mono">{log.teamId}</code></span>
						</div>
					</div>
				{/each}
			</div>
		{/if}

		<div class="flex justify-end pt-2 border-t border-border">
			<Button variant="outline" onclick={onClose}>Close</Button>
		</div>
	</div>
</Modal>
