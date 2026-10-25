<script lang="ts">
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import { flip } from 'svelte/animate';
	import {
		Users,
		Play,
		Pause,
		Flag,
		CloudOff,
		ArrowLeft,
		Trophy,
		Timer,
		RotateCcw,
		DoorOpen,
		DoorClosed,
		LayoutGrid,
		Wifi,
		UserX,
		ShieldAlert,
		ChevronRight,
		Scale,
		Crown
	} from '@lucide/svelte';
	import { adminAuth } from '$lib/stores/admin-auth.svelte';
	import { serverNow } from '$lib/games/tech-word-rush/api';
	import { HeistClient } from '$lib/games/word-heist/client.svelte';
	import { describeSizes, fitStages } from '$lib/games/word-heist/allocation';
	import { rankBoard } from '$lib/games/word-heist/engine';
	import { formatClock, type HeistControl, type RoomSummary } from '$lib/games/word-heist/types';
	import PageHeader from '$lib/components/admin/PageHeader.svelte';
	import StatCard from '$lib/components/admin/StatCard.svelte';
	import Button from '$lib/components/ui/Button.svelte';
	import Modal from '$lib/components/ui/Modal.svelte';
	import Spinner from '$lib/components/ui/Spinner.svelte';
	import StateMessage from '$lib/components/ui/StateMessage.svelte';
	import SessionStatusBadge from '$lib/components/games/SessionStatusBadge.svelte';
	import QrCode from '$lib/components/games/QrCode.svelte';

	const code = $derived((page.params.code ?? '').toUpperCase());
	const joinUrl = $derived(`${page.url.origin}/join/heist/${code}`);

	// ── Live data (WebSocket to the live server) ─────────────────────────
	let client = $state<HeistClient | null>(null);
	$effect(() => {
		const next = new HeistClient(code, 'admin', () => adminAuth.user?.getIdToken() ?? Promise.resolve(null));
		client = next;
		return next.start();
	});

	const session = $derived(client?.tournament ?? null);
	const players = $derived(client?.players ?? []);
	const rounds = $derived(client?.rounds ?? []);
	const rooms = $derived(client?.rooms ?? []);
	const loadState = $derived(!client ? 'loading' : client.load === 'missing' ? 'missing' : client.error ? 'error' : client.load);
	const offline = $derived(!!client && client.status === 'reconnecting');
	const currentRound = $derived(session?.round ?? 0);

	let now = $state(serverNow());
	$effect(() => {
		const t = setInterval(() => (now = serverNow()), 500);
		return () => clearInterval(t);
	});

	const status = $derived(session?.status ?? 'lobby');
	const timeLeft = $derived(session?.timerEndsAt ? Math.max(0, session.timerEndsAt - now) : (session?.pausedRemainingMs ?? 0));
	const isGame = $derived(session?.rules.mode === 'game');
	const noun = $derived(isGame ? 'game' : 'tournament');
	const byId = $derived(new Map(players.map((p) => [p.id, p])));
	const counts = $derived.by(() => {
		const c = { lobby: 0, active: 0, reserve: 0, removed: 0, connected: 0, disconnected: 0 };
		for (const p of players) {
			if (p.status === 'removed') {
				c.removed++;
				continue;
			}
			if (p.status === 'reserve') c.reserve++;
			else if (p.status === 'lobby') c.lobby++;
			if (session && p.round === session.round && p.status !== 'reserve') c.active++;
			if (p.connected) c.connected++;
			else c.disconnected++;
		}
		return c;
	});
	const currentResult = $derived(rounds.find((r) => r.round === currentRound) ?? null);
	const qualifierCount = $derived(currentResult ? currentResult.rooms.reduce((n, r) => n + r.advancing.length, 0) : 0);
	// What locking the lobby / preparing the next stage would make.
	const lobbyPlan = $derived(session && counts.lobby >= 2 ? fitStages(counts.lobby, session.rules.stages, session.rules.advance, session.rules.roomSize) : null);
	const lobbyText = $derived(lobbyPlan ? `${describeSizes(lobbyPlan[0].sizes)} · ${lobbyPlan.length} stage${lobbyPlan.length === 1 ? '' : 's'}` : 'needs at least 2 players');
	const nextPlan = $derived(session && qualifierCount >= 2 ? fitStages(qualifierCount, Math.max(1, session.totalStages - session.round), session.rules.advance, session.rules.roomSize) : null);
	const nextText = $derived(nextPlan ? `${describeSizes(nextPlan[0].sizes)}${nextPlan[0].final ? ' — this will be the final' : ''}` : '—');
	const stageLabel = $derived(
		!session ? '' : isGame ? 'Game' : session.round === 0 ? 'Registration' : session.final ? `Final (stage ${session.round} of ${session.totalStages})` : `Stage ${session.round} of ${session.totalStages}`
	);

	// ── Control ──────────────────────────────────────────────────────────
	let busy = $state<HeistControl | null>(null);
	let actionError = $state('');

	async function run(action: HeistControl, extra: Record<string, unknown> = {}) {
		if (busy) return false;
		busy = action;
		actionError = '';
		try {
			if (!client) throw new Error('Not connected yet.');
			await client.control(action, extra);
			return true;
		} catch (err) {
			actionError = (err as Error).message || 'That did not work. Please try again.';
			return false;
		} finally {
			busy = null;
		}
	}

	// ── Dialogs ──────────────────────────────────────────────────────────
	let confirm = $state<'prepare' | 'end' | 'next' | 'close' | 'reset' | null>(null);
	let resetText = $state('');

	async function confirmed() {
		const action = confirm;
		if (!action || !session) return;
		const ok =
			action === 'prepare'
				? await run('prepare')
				: action === 'end'
					? await run('end', { round: session.round })
					: action === 'next'
						? await run('next-round', { round: session.round })
						: action === 'close'
							? await run('close')
							: await run('reset', { confirm: resetText.trim().toUpperCase() });
		if (ok) {
			confirm = null;
			resetText = '';
			// A closed lobby is done with: back to the Games page.
			if (action === 'close') await goto('/admin/games');
		}
	}

	// Room detail (full board loaded on demand)
	let openRoom = $state<RoomSummary | null>(null);
	$effect(() => client?.watch(openRoom?.roomId ?? null));
	const board = $derived(openRoom ? (client?.room ?? null) : null);
	const boardRanking = $derived(board ? rankBoard(board) : []);

	let removing = $state<{ id: string; name: string } | null>(null);
	async function removeConfirmed() {
		if (!removing) return;
		if (await run('remove-player', { playerId: removing.id })) removing = null;
	}

	// Tie decisions: click players in place order.
	let picks = $state<Record<string, string[]>>({});
	const tieKey = (roomId: string, i: number) => `${roomId}:${i}`;
	function togglePick(key: string, id: string, slots: number) {
		const cur = picks[key] ?? [];
		picks[key] = cur.includes(id) ? cur.filter((p) => p !== id) : cur.length < slots ? [...cur, id] : cur;
	}

	// Player list
	let playerFilter = $state<'all' | 'active' | 'reserve' | 'disconnected'>('all');
	let playerSearch = $state('');
	const shownPlayers = $derived(
		players
			.filter((p) => {
				if (playerFilter === 'active' && !(session && p.round === session.round && p.status !== 'reserve' && p.status !== 'removed')) return false;
				if (playerFilter === 'reserve' && p.status !== 'reserve') return false;
				if (playerFilter === 'disconnected' && p.connected) return false;
				return !playerSearch.trim() || p.name.toLowerCase().includes(playerSearch.trim().toLowerCase());
			})
			.sort((a, b) => (a.roomNumber ?? 999) - (b.roomNumber ?? 999) || a.name.localeCompare(b.name))
	);

	const placeLabel = (n: number) => (n === 1 ? '1st' : n === 2 ? '2nd' : n === 3 ? '3rd' : `${n}th`);
	const statusText: Record<string, string> = {
		lobby: 'Lobby',
		playing: 'Playing',
		qualified: 'Qualified',
		eliminated: 'Out',
		tied: 'Tie — deciding',
		reserve: 'Reserve',
		removed: 'Removed',
		champion: 'Champion'
	};
</script>

<svelte:head><title>Word Heist {code} — ZenCode Admin</title></svelte:head>

<a href="/admin/games" class="mb-4 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"><ArrowLeft class="size-4" /> Games</a>

{#if offline}
	<div class="mb-4 flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-4 py-2 text-sm text-amber-900" role="status"><Spinner class="size-4" /> Reconnecting to the live server…</div>
{/if}
{#if loadState === 'error'}
	<StateMessage tone="error" icon={CloudOff} title="Unable to open the tournament." description={client?.error ?? 'Check your connection and reload.'} />
{:else if loadState === 'loading'}
	<div class="flex items-center gap-3 py-20 text-muted-foreground" role="status"><Spinner /> Loading tournament…</div>
{:else if loadState === 'missing' || !session}
	<StateMessage icon={CloudOff} title="Tournament not found" description="It may have been deleted from the session history." />
{:else}
	<PageHeader eyebrow="Word Heist" title="Tournament {code}" description="One QR code for everyone. Rooms, scores and qualification are run on the server.">
		{#snippet actions()}
			<SessionStatusBadge status={session!.status} />
		{/snippet}
	</PageHeader>

	{#if actionError}
		<div class="mb-4 flex items-start justify-between gap-3 rounded-lg border border-destructive/20 bg-destructive/10 px-4 py-3 text-sm text-destructive" role="alert">
			<span>{actionError}</span>
			<button type="button" class="font-bold opacity-70 hover:opacity-100" onclick={() => (actionError = '')} aria-label="Dismiss">×</button>
		</div>
	{/if}

	<!-- Controls -->
	<section class="mb-6 flex flex-col gap-4 rounded-lg border border-border bg-card p-4 lg:flex-row lg:items-center" aria-label="Tournament controls">
		<div class="min-w-0 flex-1">
			<p class="text-xs font-semibold tracking-[0.08em] text-muted-foreground uppercase">
				{stageLabel}
			</p>
			<p class="mt-0.5 text-sm text-foreground">
				{#if status === 'lobby'}
					{counts.lobby} of {session.rules.maxPlayers} registered → {lobbyText}
				{:else if status === 'ready'}
					{session.roundPlayers} players in {session.roomCount} rooms, everyone on 0. Start when everyone is ready.
				{:else if status === 'playing' || status === 'paused'}
					{session.roomCount} room{session.roomCount === 1 ? '' : 's'} live · {formatClock(timeLeft)} left{timeLeft <= session.rules.finalSeconds * 1000 ? ' (final countdown)' : ''}{status === 'paused' ? ' (paused)' : ''}
				{:else if status === 'scoring'}
					Scoring every room…
				{:else if status === 'review'}
					{session.openTies ? `${session.openTies} tie${session.openTies === 1 ? '' : 's'} to decide before the next round.` : `${qualifierCount} go through → ${nextText}`}
				{:else if session.podium.length}
					{isGame ? 'Game' : 'Tournament'} complete.
				{:else}
					{isGame ? 'Game' : 'Tournament'} closed.
				{/if}
			</p>
		</div>
		<div class="flex flex-wrap gap-2">
			{#if status !== 'finished'}
				{#if session.registrationOpen}
					<Button variant="outline" loading={busy === 'close-registration'} onclick={() => run('close-registration')}><DoorClosed class="size-4" /> Close registration</Button>
				{:else}
					<Button variant="outline" loading={busy === 'open-registration'} onclick={() => run('open-registration')}><DoorOpen class="size-4" /> Open registration</Button>
				{/if}
			{/if}
			{#if status === 'lobby'}
				<Button onclick={() => (confirm = 'prepare')} disabled={counts.lobby < 2}><LayoutGrid class="size-4" /> Review rooms…</Button>
			{:else if status === 'ready'}
				<Button loading={busy === 'start'} onclick={() => run('start')}><Play class="size-4" /> Start {session.final ? 'final' : `round ${session.round}`}</Button>
			{:else if status === 'playing'}
				<Button variant="outline" loading={busy === 'pause'} onclick={() => run('pause')}><Pause class="size-4" /> Pause</Button>
				<Button variant="destructive" onclick={() => (confirm = 'end')}><Flag class="size-4" /> End round</Button>
			{:else if status === 'paused'}
				<Button loading={busy === 'resume'} onclick={() => run('resume')}><Play class="size-4" /> Resume</Button>
				<Button variant="destructive" onclick={() => (confirm = 'end')}><Flag class="size-4" /> End round</Button>
			{:else if status === 'scoring'}
				<Button variant="outline" loading={busy === 'end'} onclick={() => run('end', { round: session!.round })}><RotateCcw class="size-4" /> Retry scoring</Button>
			{:else if status === 'review' && !session.final}
				<Button onclick={() => (confirm = 'next')} disabled={session.openTies > 0}><ChevronRight class="size-4" /> Prepare round {session.round + 1}…</Button>
			{/if}
			{#if status !== 'finished'}
				<Button variant="outline" class="text-destructive hover:text-destructive" onclick={() => (confirm = 'close')}><Flag class="size-4" /> {status === 'lobby' ? 'Close lobby' : 'End tournament'}</Button>
			{/if}
			<Button variant="ghost" class="text-muted-foreground hover:text-destructive" onclick={() => ((resetText = ''), (confirm = 'reset'))}><RotateCcw class="size-4" /> Reset</Button>
		</div>
	</section>

	<!-- Stats -->
	<div class="mb-6 grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
		<StatCard label="Registered" value={players.length - counts.removed} icon={Users} />
		<StatCard label={session.round ? 'In this round' : 'In lobby'} value={session.round ? counts.active : counts.lobby} />
		<StatCard label="Reserve" value={counts.reserve} helper="Joined after rooms were locked" />
		<StatCard label="Connected" value={counts.connected} icon={Wifi} helper="{counts.disconnected} not seen in the last minute" />
		<StatCard label="Rooms" value={session.round ? session.roomCount : (lobbyPlan?.[0].sizes.length ?? 0)} icon={LayoutGrid} helper={session.round ? '' : 'Provisional'} />
		<StatCard label="Time left" value={status === 'playing' || status === 'paused' ? formatClock(timeLeft) : '—'} icon={Timer} />
	</div>

	<div class="grid gap-6 xl:grid-cols-[1fr_20rem]">
		<div class="min-w-0 space-y-6">
			<!-- Podium -->
			{#if status === 'finished' && session.podium.length}
				<section class="rounded-lg border border-border bg-card p-5" aria-labelledby="podium-h">
					<h2 id="podium-h" class="flex items-center gap-2 text-[15px] font-semibold"><Crown class="size-4 text-sun" /> Final results</h2>
					<ol class="mt-4 grid gap-3 sm:grid-cols-3">
						{#each session.podium as p (p.playerId)}
							<li class="rounded-lg border px-4 py-3 {p.rank === 1 ? 'border-sun/60 bg-sun/10' : 'border-border'}">
								<p class="text-xs font-semibold tracking-[0.08em] text-muted-foreground uppercase">{placeLabel(p.rank)}</p>
								<p class="mt-1 truncate text-lg font-semibold">{p.name}</p>
								<p class="text-sm text-muted-foreground tabular">{p.score} pts</p>
							</li>
						{/each}
					</ol>
				</section>
			{/if}

			<!-- Ties -->
			{#if currentResult && currentResult.rooms.some((r) => r.ties.some((t) => !t.resolved))}
				<section class="rounded-lg border border-orange-200 bg-orange-50/60 p-5" aria-labelledby="ties-h">
					<h2 id="ties-h" class="flex items-center gap-2 text-[15px] font-semibold text-orange-900"><Scale class="size-4" /> Ties to decide</h2>
					<p class="mt-1 text-sm text-orange-900/80">These players are level on score and on the longest word made first. Click players in place order, then confirm.</p>
					<div class="mt-4 space-y-4">
						{#each currentResult.rooms as room (room.roomId)}
							{#each room.ties as tie, i (i)}
								{#if !tie.resolved}
									{@const key = tieKey(room.roomId, i)}
									<div class="rounded-md border border-orange-200 bg-card p-4">
										<p class="text-sm font-medium">
											Room {room.number} — {tie.slots === 1 ? `1 place` : `${tie.slots} places`} from {placeLabel(tie.fromRank)} ({currentResult.final ? 'podium order' : 'qualification'})
										</p>
										<div class="mt-3 flex flex-wrap gap-2">
											{#each tie.candidates as id (id)}
												{@const order = (picks[key] ?? []).indexOf(id)}
												{@const entry = room.ranking.find((r) => r.playerId === id)}
												<button
													type="button"
													onclick={() => togglePick(key, id, tie.slots)}
													aria-pressed={order >= 0}
													class="rounded-md border px-3 py-1.5 text-sm transition-colors {order >= 0 ? 'border-primary bg-primary text-primary-foreground' : 'border-input bg-card hover:bg-muted'}"
												>
													{#if order >= 0}<span class="mr-1 font-mono">{tie.fromRank + order}.</span>{/if}{entry?.name ?? id}
													<span class="ml-1 opacity-70 tabular">{entry?.score ?? 0}</span>
												</button>
											{/each}
										</div>
										<Button
											size="sm"
											class="mt-3"
											disabled={(picks[key] ?? []).length !== tie.slots}
											loading={busy === 'resolve-tie'}
											onclick={() => run('resolve-tie', { roomId: room.roomId, tieIndex: i, picks: picks[key] })}>Confirm</Button
										>
									</div>
								{/if}
							{/each}
						{/each}
					</div>
				</section>
			{/if}

			<!-- Rooms: live Top 3 -->
			<section aria-labelledby="rooms-h">
				<div class="mb-3 flex items-center gap-2">
					<h2 id="rooms-h" class="text-[15px] font-semibold">{session.round ? `Rooms · ${session.final ? 'Final' : `Round ${session.round}`}` : 'Rooms'}</h2>
					{#if rooms.length}<span class="text-xs text-muted-foreground tabular">{rooms.length}</span>{/if}
				</div>
				{#if !session.round}
					<div class="rounded-lg border border-border bg-card">
						<StateMessage icon={LayoutGrid} title="Rooms are made when you prepare round 1" description={`${counts.lobby} in the lobby → ${lobbyText}. Players see a provisional room while they wait.`} />
					</div>
				{:else if !rooms.length}
					<div class="flex items-center gap-3 rounded-lg border border-border bg-card p-6 text-sm text-muted-foreground"><Spinner /> Creating rooms…</div>
				{:else}
					<ul class="grid gap-3 sm:grid-cols-2 2xl:grid-cols-3">
						{#each rooms as room (room.roomId)}
							<li>
								<button
									type="button"
									onclick={() => (openRoom = room)}
									class="block w-full rounded-lg border border-border bg-card p-4 text-left transition-colors hover:border-ring/50"
								>
									<div class="flex items-center gap-2">
										<span class="font-semibold">Room {room.number}</span>
										<span class="text-xs text-muted-foreground tabular">{room.playerCount} players · {room.moves} moves</span>
										<ChevronRight class="ml-auto size-4 text-muted-foreground" />
									</div>
									<ol class="mt-3 space-y-1">
										{#each room.top3 as r (r.playerId)}
											<li animate:flip={{ duration: 400 }} class="flex items-center gap-2 text-sm">
												<span class="w-5 font-mono text-xs {r.rank <= 2 ? 'text-brand' : 'text-muted-foreground'}">{r.rank}</span>
												<span class="min-w-0 flex-1 truncate">{r.name}</span>
												<span class="font-semibold tabular">{r.score}</span>
											</li>
										{:else}
											<li class="text-sm text-muted-foreground">No players</li>
										{/each}
									</ol>
								</button>
							</li>
						{/each}
					</ul>
				{/if}
			</section>

			<!-- Players -->
			<section class="rounded-lg border border-border bg-card" aria-labelledby="players-h">
				<header class="flex flex-wrap items-center gap-2 border-b border-border px-4 py-3">
					<h2 id="players-h" class="text-[15px] font-semibold">Participants</h2>
					<input
						bind:value={playerSearch}
						placeholder="Search names"
						aria-label="Search participants"
						class="ml-auto h-8 w-40 rounded-md border border-input bg-background px-2.5 text-sm focus:ring-2 focus:ring-ring focus:outline-hidden"
					/>
					<select bind:value={playerFilter} aria-label="Filter participants" class="h-8 rounded-md border border-input bg-background px-2 text-sm">
						<option value="all">All</option>
						<option value="active">In this round</option>
						<option value="reserve">Reserve</option>
						<option value="disconnected">Not connected</option>
					</select>
				</header>
				<div class="max-h-96 overflow-y-auto">
					<table class="w-full text-left text-sm">
						<thead class="sticky top-0 bg-muted/80 text-[11px] font-semibold tracking-wider text-muted-foreground uppercase backdrop-blur">
							<tr><th class="px-4 py-2">Name</th><th class="px-4 py-2">Status</th><th class="px-4 py-2">Room</th><th class="px-4 py-2">Seen</th><th class="px-4 py-2"><span class="sr-only">Actions</span></th></tr>
						</thead>
						<tbody class="divide-y divide-border">
							{#each shownPlayers.slice(0, 300) as p (p.id)}
								<tr>
									<td class="max-w-48 truncate px-4 py-2 font-medium">{p.name}</td>
									<td class="px-4 py-2 text-muted-foreground">{statusText[p.status] ?? p.status}{p.place ? ` · ${placeLabel(p.place)}` : ''}</td>
									<td class="px-4 py-2 text-muted-foreground tabular">{p.roomNumber ? `R${p.round} · ${p.roomNumber}` : '—'}</td>
									<td class="px-4 py-2">
										<span class="inline-flex items-center gap-1.5 text-xs {p.connected ? 'text-emerald-700' : 'text-muted-foreground'}">
											<span class="size-1.5 rounded-full {p.connected ? 'bg-emerald-500' : 'bg-zinc-300'}"></span>
											{p.connected ? 'Connected' : 'Away'}
										</span>
									</td>
									<td class="px-4 py-2 text-right">
										{#if p.status !== 'removed' && status !== 'finished'}
											<Button size="sm" variant="ghost" class="text-muted-foreground hover:text-destructive" onclick={() => (removing = { id: p.id, name: p.name })}><UserX class="size-3.5" /> Remove</Button>
										{/if}
									</td>
								</tr>
							{:else}
								<tr><td colspan="5" class="px-4 py-8 text-center text-muted-foreground">No participants match.</td></tr>
							{/each}
						</tbody>
					</table>
				</div>
			</section>

			<!-- History -->
			{#if rounds.length}
				<section class="rounded-lg border border-border bg-card" aria-labelledby="hist-h">
					<h2 id="hist-h" class="border-b border-border px-4 py-3 text-[15px] font-semibold">Round history</h2>
					<ul class="divide-y divide-border">
						{#each rounds as r (r.round)}
							<li class="px-4 py-3 text-sm">
								<p class="font-medium">{r.final ? `Final (round ${r.round})` : `Round ${r.round}`} · {r.rooms.length} room{r.rooms.length === 1 ? '' : 's'} · {r.rooms.reduce((n, x) => n + x.ranking.length, 0)} players</p>
								<p class="mt-1 text-muted-foreground">
									{r.final ? 'Podium' : 'Advanced'}:
									{r.rooms.flatMap((x) => x.advancing).map((id) => byId.get(id)?.name ?? '?').join(', ') || '—'}
								</p>
							</li>
						{/each}
					</ul>
				</section>
			{/if}
		</div>

		<!-- Join panel -->
		<aside class="space-y-4">
			<section class="rounded-lg border border-border bg-card p-4">
				<h2 class="text-[15px] font-semibold">Join</h2>
				<p class="mt-1 text-sm text-muted-foreground">One QR code for every participant.</p>
				<div class="mx-auto mt-4 max-w-56"><QrCode value={joinUrl} label="QR code to join Word Heist {code}" /></div>
				<p class="mt-3 text-center font-mono text-2xl font-bold tracking-[0.2em]">{code}</p>
				<p class="mt-1 text-center text-xs break-all text-muted-foreground">{joinUrl}</p>
				<p class="mt-3 text-center text-xs {session.registrationOpen ? 'text-emerald-700' : 'text-muted-foreground'}">
					Registration {session.registrationOpen ? 'open' : 'closed'}{session.round && session.registrationOpen ? ' — new players join the reserve list' : ''}
				</p>
			</section>
			<section class="rounded-lg border border-border bg-card p-4 text-sm text-muted-foreground">
				<h2 class="flex items-center gap-2 text-[15px] font-semibold text-foreground"><ShieldAlert class="size-4" /> Rules</h2>
				<ul class="mt-2 space-y-1">
					<li>
						{isGame
							? `One room of up to ${session.rules.maxPlayers} players`
							: `${session.rules.stages} stages · rooms of up to ${session.rules.roomSize} · top ${session.rules.advance} per room go through · up to ${session.rules.maxPlayers} participants`}
					</li>
					<li>
						Tiles drop for {formatClock(session.rules.roundSeconds * 1000)}, then a {session.rules.finalSeconds} s final countdown · a full room gets {session.rules.tileCount} tiles, smaller rooms fewer
					</li>
					<li>Words: {session.rules.minWordLength}+ letters from the tiles; steals add at least one tile</li>
					<li>Everyone starts on 0 · ties: longest word, then who made it first</li>
				</ul>
				<a href="/admin/games/word-heist/moderation" class="mt-3 inline-block text-forest-700 underline-offset-4 hover:underline">Word moderation</a>
			</section>
		</aside>
	</div>

	<!-- Room detail -->
	<Modal open={!!openRoom} size="lg" title="Room {openRoom?.number ?? ''}" description={openRoom ? `${openRoom.playerCount} players · round ${openRoom.round}` : ''} onclose={() => (openRoom = null)}>
		{#if !board}
			<div class="flex items-center gap-3 text-muted-foreground"><Spinner /> Loading board…</div>
		{:else}
			<div class="grid gap-6 md:grid-cols-2">
				<div>
					<h3 class="text-sm font-semibold">Ranking</h3>
					<ol class="mt-2 space-y-1">
						{#each boardRanking as r (r.playerId)}
							<li class="flex items-center gap-2 text-sm">
								<span class="w-5 font-mono text-xs text-muted-foreground">{r.rank}</span>
								<span class="min-w-0 flex-1 truncate">{r.name}</span>
								<span class="text-xs text-muted-foreground tabular" title="Longest word made · steals">{r.longest}L · {r.steals}S</span>
								<span class="w-8 text-right font-semibold tabular">{r.score}</span>
								{#if status !== 'finished'}
									<button type="button" class="rounded p-1 text-muted-foreground hover:text-destructive" aria-label="Remove {r.name}" onclick={() => (removing = { id: r.playerId, name: r.name })}><UserX class="size-3.5" /></button>
								{/if}
							</li>
						{/each}
					</ol>
					<h3 class="mt-6 text-sm font-semibold">Recent moves</h3>
					<ul class="mt-2 space-y-1 text-sm text-muted-foreground">
						{#each board.feed as f (f.seq)}
							<li class="truncate">
								<span class="font-medium text-foreground">{f.byName}</span>
								{f.kind === 'create' ? 'made' : f.kind === 'extend' ? `grew ${f.from} →` : `stole ${f.from} →`}
								<span class="font-mono font-semibold text-foreground">{f.text}</span>{f.victimName ? ` from ${f.victimName}` : ''}
							</li>
						{:else}
							<li>No moves yet.</li>
						{/each}
					</ul>
				</div>
				<div>
					<h3 class="text-sm font-semibold">Tiles · {board.tiles.count - (board.drawn ?? 0)} of {board.tiles.count} left in the bag</h3>
					<ul class="mt-2 flex min-h-8 flex-wrap gap-1">
						{#each board.pool ?? [] as t (t.id)}
							<li class="grid size-7 place-items-center rounded border border-sun/60 bg-sun/15 font-mono text-sm font-bold">{t.c}</li>
						{:else}
							<li class="text-sm text-muted-foreground">No face-up tiles.</li>
						{/each}
					</ul>
					<h3 class="mt-6 text-sm font-semibold">Board · {Object.keys(board.words).length} words</h3>
					<ul class="mt-2 flex flex-wrap gap-1.5">
						{#each Object.entries(board.words).sort((a, b) => b[1].text.length - a[1].text.length) as [id, w] (id)}
							<li class="rounded-md border border-border px-2 py-1 text-sm">
								<span class="font-mono font-semibold">{w.text}</span>
								<span class="text-xs text-muted-foreground">· {board.players[w.owner]?.name ?? '—'}</span>
							</li>
						{/each}
					</ul>
				</div>
			</div>
		{/if}
	</Modal>

	<!-- Confirmations -->
	<Modal
		open={!!confirm}
		title={confirm === 'prepare'
			? 'Lock round 1 rooms?'
			: confirm === 'end'
				? 'End this round now?'
				: confirm === 'next'
					? `Prepare round ${session.round + 1}?`
					: confirm === 'close'
						? status === 'lobby'
							? 'Close this lobby?'
							: `End the ${noun} now?`
						: 'Reset the tournament?'}
		onclose={() => !busy && (confirm = null)}
	>
		{#if confirm === 'prepare'}
			<p class="text-sm text-muted-foreground">
				<span class="font-semibold text-foreground">{counts.lobby} players</span> → <span class="font-semibold text-foreground">{lobbyText}</span>. Rooms are locked and each gets its own bag of tiles; everyone starts on 0. Anyone who registers later joins the reserve list.
			</p>
		{:else if confirm === 'end'}
			<p class="text-sm text-muted-foreground">Moves stop immediately in every room and the top {session.final ? 'three are placed' : `${session.rules.advance} in each room go through`}.</p>
		{:else if confirm === 'next'}
			<p class="text-sm text-muted-foreground">
				<span class="font-semibold text-foreground">{qualifierCount} players</span> → <span class="font-semibold text-foreground">{nextText}</span>. Scores start again at 0 with fresh bags of tiles.
			</p>
		{:else if confirm === 'close'}
			<p class="text-sm text-muted-foreground">
				{status === 'lobby'
					? `Registration closes for good, players are sent back to the home page and the ${noun} moves to the session history.`
					: `Any running round stops now without scoring, players are sent back to the home page and the ${noun} moves to the session history.`} You'll return to the Games page. This cannot be undone.
			</p>
		{:else if confirm === 'reset'}
			<p class="text-sm text-muted-foreground">Every room, board and round result is deleted and all participants go back to the lobby. This cannot be undone.</p>
			<label for="reset-confirm" class="mt-4 block text-[13px] font-medium">Type <span class="font-mono">{code}</span> to confirm</label>
			<input id="reset-confirm" bind:value={resetText} autocomplete="off" class="mt-1.5 h-9 w-full rounded-md border border-input bg-background px-3 font-mono text-sm uppercase focus:ring-2 focus:ring-ring focus:outline-hidden" />
		{/if}
		{#if actionError}<p class="mt-3 text-[13px] text-destructive" role="alert">{actionError}</p>{/if}
		{#snippet footer()}
			<Button variant="ghost" onclick={() => (confirm = null)} disabled={!!busy}>Cancel</Button>
			<Button
				variant={confirm === 'end' || confirm === 'close' || confirm === 'reset' ? 'destructive' : 'default'}
				loading={!!busy}
				disabled={confirm === 'reset' && resetText.trim().toUpperCase() !== code}
				onclick={confirmed}
			>
				{confirm === 'prepare'
					? 'Lock rooms'
					: confirm === 'end'
						? 'End round'
						: confirm === 'next'
							? 'Create rooms'
							: confirm === 'close'
								? status === 'lobby'
									? 'Close lobby'
									: 'End tournament'
								: 'Reset'}
			</Button>
		{/snippet}
	</Modal>

	<Modal open={!!removing} title="Remove {removing?.name ?? ''}?" onclose={() => !busy && (removing = null)}>
		<p class="text-sm text-muted-foreground">They leave the tournament. In a running round their words are taken off the board and they drop out of the ranking.</p>
		{#snippet footer()}
			<Button variant="ghost" onclick={() => (removing = null)} disabled={!!busy}>Cancel</Button>
			<Button variant="destructive" loading={busy === 'remove-player'} onclick={removeConfirmed}><UserX class="size-4" /> Remove</Button>
		{/snippet}
	</Modal>
{/if}
