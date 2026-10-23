<script lang="ts">
	import type { SessionStatus } from '$lib/games/tech-word-rush/types';
	import type { FlapStatus } from '$lib/games/flappy/types';
	import type { HeistStatus } from '$lib/games/word-heist/types';
	import type { DrawStatus } from '$lib/games/scribble/types';

	let { status }: { status: SessionStatus | FlapStatus | HeistStatus | DrawStatus } = $props();

	const styles: Record<SessionStatus | FlapStatus | HeistStatus | DrawStatus, { label: string; cls: string; dot: string; live?: boolean }> = {
		lobby: { label: 'Lobby open', cls: 'border-emerald-200 bg-emerald-50 text-emerald-800', dot: 'bg-emerald-500', live: true },
		playing: { label: 'Flights live', cls: 'border-amber-200 bg-amber-50 text-amber-800', dot: 'bg-amber-500', live: true },
		question: { label: 'Word live', cls: 'border-amber-200 bg-amber-50 text-amber-800', dot: 'bg-amber-500', live: true },
		result: { label: 'Showing result', cls: 'border-emerald-200 bg-emerald-50 text-emerald-800', dot: 'bg-emerald-500', live: true },
		choosing: { label: 'Picking a word', cls: 'border-amber-200 bg-amber-50 text-amber-800', dot: 'bg-amber-500', live: true },
		drawing: { label: 'Drawing live', cls: 'border-amber-200 bg-amber-50 text-amber-800', dot: 'bg-amber-500', live: true },
		reveal: { label: 'Showing word', cls: 'border-emerald-200 bg-emerald-50 text-emerald-800', dot: 'bg-emerald-500', live: true },
		leaderboard: { label: 'Leaderboard', cls: 'border-emerald-200 bg-emerald-50 text-emerald-800', dot: 'bg-emerald-500', live: true },
		ready: { label: 'Round ready', cls: 'border-emerald-200 bg-emerald-50 text-emerald-800', dot: 'bg-emerald-500', live: true },
		paused: { label: 'Paused', cls: 'border-zinc-200 bg-zinc-50 text-zinc-700', dot: 'bg-zinc-400' },
		scoring: { label: 'Scoring', cls: 'border-amber-200 bg-amber-50 text-amber-800', dot: 'bg-amber-500', live: true },
		review: { label: 'Round results', cls: 'border-emerald-200 bg-emerald-50 text-emerald-800', dot: 'bg-emerald-500', live: true },
		finished: { label: 'Finished', cls: 'border-zinc-200 bg-zinc-50 text-zinc-700', dot: 'bg-zinc-400' }
	};
	const s = $derived(styles[status] ?? styles.finished);
</script>

<span class="inline-flex min-h-6 items-center gap-1.5 rounded-md border px-2 text-xs font-medium {s.cls}">
	<span class="size-1.5 rounded-full {s.dot} {s.live ? 'animate-pulse-dot' : ''}" aria-hidden="true"></span>
	{s.label}
</span>
