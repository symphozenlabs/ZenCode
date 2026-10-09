<script lang="ts">
	import type { SessionStatus } from '$lib/live/types';

	let { status }: { status: SessionStatus } = $props();

	const styles: Record<SessionStatus, { label: string; cls: string; dot: string }> = {
		draft: { label: 'Draft', cls: 'border-border bg-muted text-muted-foreground', dot: 'bg-muted-foreground/60' },
		lobby: { label: 'Lobby open', cls: 'border-sun/50 bg-sun-light/40 text-forest-900', dot: 'bg-sun animate-pulse-dot' },
		live: { label: 'Live', cls: 'border-brand/30 bg-green-100 text-forest-800', dot: 'bg-brand animate-pulse-dot' },
		ended: { label: 'Ended', cls: 'border-border bg-card text-muted-foreground', dot: 'bg-input' }
	};
	const s = $derived(styles[status]);
</script>

<span class="inline-flex min-h-6 shrink-0 items-center gap-1.5 rounded-md border px-2 text-xs font-medium {s.cls}">
	<span class="size-1.5 rounded-full {s.dot}" aria-hidden="true"></span>
	{s.label}
</span>
