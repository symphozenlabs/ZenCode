<script lang="ts">
	import type { BoardRow } from '$lib/live/protocol';
	import Modal from '$lib/components/ui/Modal.svelte';
	import Avatar from './Avatar.svelte';

	/** Everyone's points on the phone: the top rows, plus this player if they're further down. */
	let {
		open,
		onclose,
		board,
		meId,
		me,
		players
	}: {
		open: boolean;
		onclose: () => void;
		board: BoardRow[];
		meId: string;
		/** This player's own row, used when they aren't in the top rows. */
		me: BoardRow | null;
		players: number;
	} = $props();

	const mine = $derived(board.some((r) => r.id === meId));
	const MEDALS = ['🥇', '🥈', '🥉'];
</script>

{#snippet row(r: BoardRow)}
	{@const isMe = r.id === meId}
	<li
		class="flex items-center gap-3 rounded-lg px-3 py-2.5 {isMe ? 'bg-sun-light/60 ring-1 ring-sun' : r.rank <= 3 ? 'bg-secondary/60' : ''}"
		aria-current={isMe ? 'true' : undefined}
	>
		<span class="w-7 shrink-0 text-center font-display text-base font-semibold text-forest-900 tabular">
			{#if r.rank <= 3}<span aria-label="Rank {r.rank}">{MEDALS[r.rank - 1]}</span>{:else}{r.rank}{/if}
		</span>
		<Avatar avatar={r.avatar} class="size-9 text-lg" />
		<span class="min-w-0 flex-1 truncate text-[15px] font-medium text-forest-950">
			{r.nickname}{#if isMe}<span class="ml-1.5 text-[12px] font-semibold text-forest-700">(you)</span>{/if}
		</span>
		<span class="shrink-0 text-[15px] font-semibold text-forest-950 tabular">{r.score.toLocaleString('en-IN')}</span>
	</li>
{/snippet}

<Modal {open} {onclose} title="Leaderboard" description="{players} {players === 1 ? 'player' : 'players'}{players > board.length ? ` · top ${board.length}` : ''}">
	<ol class="-mx-1 max-h-[60dvh] space-y-1 overflow-y-auto px-1">
		{#each board as r (r.id)}
			{@render row(r)}
		{/each}
	</ol>
	{#if !mine && me}
		<div class="mt-2 border-t border-dashed border-border pt-2">
			<ol>{@render row(me)}</ol>
		</div>
	{/if}
</Modal>
