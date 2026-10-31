<script lang="ts">
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import { collection, doc, onSnapshot } from 'firebase/firestore';
	import { Users, Play, Flag, CloudOff, ArrowLeft, Trophy, LayoutGrid, UserX, ChevronRight, Crown, DoorOpen, DoorClosed, ExternalLink, Swords, Lock, TriangleAlert } from '@lucide/svelte';
	import { db } from '$lib/firebase/client';
	import { adminAuth } from '$lib/stores/admin-auth.svelte';
	import { SESSIONS, type LiveSession } from '$lib/games/tech-word-rush/types';
	import type { FlapSession } from '$lib/games/flappy/types';
	import type { DrawSession } from '$lib/games/scribble/types';
	import { dueAt } from '$lib/games/scribble/engine';
	import { control as twrControl, serverNow } from '$lib/games/tech-word-rush/api';
	import { control as flyControl } from '$lib/games/flappy/api';
	import { control as drawControl } from '$lib/games/scribble/api';
	import { isFlyGame } from '$lib/games/flappy/skins';
	import { control } from '$lib/games/tournament/api';
	import { describeStage, planFor } from '$lib/games/tournament/plan';
	import { GAME_TYPE, formatLabel, type StageResult, type TournamentControl, type TournamentPlayer, type TournamentSession } from '$lib/games/tournament/types';
	import { gameName, presenterHref, playerHref } from '$lib/games/registry';
	import PageHeader from '$lib/components/admin/PageHeader.svelte';
	import StatCard from '$lib/components/admin/StatCard.svelte';
	import Button from '$lib/components/ui/Button.svelte';
	import Modal from '$lib/components/ui/Modal.svelte';
	import Spinner from '$lib/components/ui/Spinner.svelte';
	import StateMessage from '$lib/components/ui/StateMessage.svelte';
	import SessionStatusBadge from '$lib/components/games/SessionStatusBadge.svelte';
	import QrCode from '$lib/components/games/QrCode.svelte';

	/**
	 * Tournament dashboard (organisers). Registration, locking entries,
	 * watching every room's game, finishing a stage and closing. Each room's
	 * game is run from its own presenter; for Scribble rooms this page also
	 * keeps every room's clock going, so it must stay open while they play.
	 */
	const code = $derived((page.params.code ?? '').toUpperCase());
	const joinUrl = $derived(`${page.url.origin}${playerHref('tournament', code)}`);

	let session = $state<TournamentSession | null>(null);
	let loadState = $state<'loading' | 'ready' | 'missing' | 'error'>('loading');
	let players = $state<(TournamentPlayer & { id: string })[]>([]);
	let stages = $state<StageResult[]>([]);

	$effect(() => {
		const c = code;
		loadState = 'loading';
		const unsubSession = onSnapshot(
			doc(db(), SESSIONS, c),
			(snap) => {
				const s = snap.data() as TournamentSession | undefined;
				session = s?.gameType === GAME_TYPE ? s : null;
				loadState = session ? 'ready' : 'missing';
			},
			() => (loadState = 'error')
		);
		const unsubPlayers = onSnapshot(collection(db(), SESSIONS, c, 'players'), (snap) => {
			players = snap.docs.map((d) => ({ id: d.id, ...(d.data() as TournamentPlayer) }));
		});
		const unsubStages = onSnapshot(collection(db(), SESSIONS, c, 'stages'), (snap) => {
			stages = snap.docs.map((d) => d.data() as StageResult).sort((a, b) => a.stage - b.stage);
		});
		return () => {
			unsubSession();
			unsubPlayers();
			unsubStages();
		};
	});

	// ── The current stage's games, live ──────────────────────────────────
	type RoomSession = LiveSession | FlapSession | DrawSession;
	let roomDocs = $state<Record<string, RoomSession | null>>({});
	const roomCodes = $derived((session?.rooms ?? []).map((r) => r.code).join(','));
	$effect(() => {
		const codes = roomCodes ? roomCodes.split(',') : [];
		roomDocs = {};
		const offs = codes.map((rc) =>
			onSnapshot(doc(db(), SESSIONS, rc), (snap) => {
				roomDocs = { ...roomDocs, [rc]: (snap.data() as RoomSession | undefined) ?? null };
			})
		);
		return () => offs.forEach((off) => off());
	});
	const rooms = $derived((session?.rooms ?? []).map((r) => ({ ...r, game: roomDocs[r.code] ?? null })));
	const allFinished = $derived(rooms.length > 0 && rooms.every((r) => r.game?.status === 'finished' && !(r.game as LiveSession).ranking && !(r.game as DrawSession).scoring));
	const anyRunning = $derived(rooms.some((r) => r.game && r.game.status !== 'lobby' && r.game.status !== 'finished'));

	/** A room's top three from its game's leaderboard (updated as each game writes it). */
	const top3 = (g: RoomSession | null) => (g?.leaderboard ?? []).slice(0, 3).map((e) => ({ id: e.id, name: e.name, score: 'score' in e ? e.score : e.xp }));

	// Scribble rooms: their clock lives on a screen. Keep every room moving from here.
	let now = $state(serverNow());
	$effect(() => {
		const t = setInterval(() => (now = serverNow()), 500);
		return () => clearInterval(t);
	});
	const ticking = new Set<string>();
	const lastTick = new Map<string, number>();
	$effect(() => {
		if (session?.game !== 'scribble' || session.status !== 'stage') return;
		for (const r of rooms) {
			const g = r.game as DrawSession | null;
			if (!g || g.status === 'lobby' || g.status === 'finished') continue;
			const due = dueAt(g);
			if (due === null || now < due || ticking.has(r.code) || Date.now() - (lastTick.get(r.code) ?? 0) < 2500) continue;
			ticking.add(r.code);
			lastTick.set(r.code, Date.now());
			adminAuth.user
				?.getIdToken()
				.then((t) => drawControl(t, r.code, 'advance'))
				.catch(() => {})
				.finally(() => ticking.delete(r.code));
		}
	});
	$effect(() => {
		if (session?.game !== 'scribble' || session.status !== 'stage') return;
		const sweep = () => {
			for (const r of rooms) if (r.game && r.game.status !== 'finished') adminAuth.user?.getIdToken().then((t) => drawControl(t, r.code, 'sweep')).catch(() => {});
		};
		const timer = setInterval(sweep, 20_000);
		return () => clearInterval(timer);
	});

	// ── Control ──────────────────────────────────────────────────────────
	let busy = $state<string | null>(null);
	let actionError = $state('');

	async function run(action: TournamentControl, extra: Record<string, unknown> = {}) {
		if (busy) return false;
		busy = action;
		actionError = '';
		try {
			const token = await adminAuth.user?.getIdToken();
			if (!token) throw new Error('Your session expired. Sign in again.');
			await control(token, code, action, extra);
			return true;
		} catch (err) {
			actionError = (err as Error).message || 'Unable to update the tournament.';
			return false;
		} finally {
			busy = null;
		}
	}

	/** Start or end one room's game with the game's own control. */
	async function roomAction(roomCode: string, action: 'start' | 'finish') {
		if (busy || !session) return;
		busy = `${action}:${roomCode}`;
		actionError = '';
		try {
			const token = await adminAuth.user?.getIdToken();
			if (!token) throw new Error('Your session expired. Sign in again.');
			if (session.game === 'tech-word-rush') await twrControl(token, roomCode, action);
			else if (isFlyGame(session.game)) await flyControl(token, roomCode, action);
			else await drawControl(token, roomCode, action);
		} catch (err) {
			actionError = (err as Error).message || 'Unable to update the game.';
		} finally {
			busy = null;
		}
	}
	async function startAll() {
		for (const r of rooms) if (r.game?.status === 'lobby') await roomAction(r.code, 'start');
	}

	let confirm = $state<'prepare' | 'finish' | 'close' | null>(null);
	async function confirmed() {
		const which = confirm;
		const ok = which === 'prepare' ? await run('prepare') : which === 'finish' ? await run('finish-stage') : which === 'close' ? await run('close') : false;
		if (ok) {
			confirm = null;
			if (which === 'close') goto('/admin/games');
		}
	}

	let removing = $state<{ id: string; name: string } | null>(null);
	async function removeConfirmed() {
		if (!removing) return;
		if (await run('remove-player', { playerId: removing.id })) removing = null;
	}

	// ── Derived ──────────────────────────────────────────────────────────
	const status = $derived(session?.status ?? 'lobby');
	const counts = $derived({
		lobby: players.filter((p) => p.status === 'lobby').length,
		playing: players.filter((p) => p.status === 'playing').length,
		reserve: players.filter((p) => p.status === 'reserve').length,
		removed: players.filter((p) => p.status === 'removed').length
	});
	/** Stages if entries were locked now. */
	const lobbyPlan = $derived(session && session.status === 'lobby' && counts.lobby >= 2 ? planFor(session.rules, counts.lobby) : null);
	const stageLabel = $derived(!session ? '' : session.stage === 0 ? 'Registration' : session.final ? `Final · stage ${session.stage} of ${session.totalStages}` : `Stage ${session.stage} of ${session.totalStages}`);
	const currentResult = $derived(stages.find((s) => s.stage === (session?.stage ?? 0) - 1) ?? null);
	const byId = $derived(new Map(players.map((p) => [p.id, p])));
	const gameNoun = $derived(session ? gameName(session.game) : '');

	let playerFilter = $state<'all' | 'active' | 'out' | 'reserve'>('all');
	let playerSearch = $state('');
	const shownPlayers = $derived(
		players
			.filter((p) => {
				if (playerFilter === 'active' && p.status !== 'playing' && p.status !== 'qualified' && p.status !== 'lobby') return false;
				if (playerFilter === 'out' && p.status !== 'eliminated' && p.status !== 'removed') return false;
				if (playerFilter === 'reserve' && p.status !== 'reserve') return false;
				return !playerSearch.trim() || p.name.toLowerCase().includes(playerSearch.trim().toLowerCase());
			})
			.sort((a, b) => (a.roomNumber ?? 999) - (b.roomNumber ?? 999) || a.name.localeCompare(b.name))
	);
	const placeLabel = (n: number) => (n === 1 ? '1st' : n === 2 ? '2nd' : n === 3 ? '3rd' : `${n}th`);
	const statusText: Record<string, string> = {
		lobby: 'Registered',
		playing: 'Playing',
		qualified: 'Qualified',
		eliminated: 'Out',
		reserve: 'Reserve',
		removed: 'Removed',
		finalist: 'Finalist',
		champion: 'Champion'
	};
	const gameStatusText = (g: RoomSession | null) => (!g ? 'Creating…' : g.status === 'lobby' ? 'In the lobby' : g.status === 'finished' ? 'Finished' : 'Playing');
</script>

<svelte:head><title>Tournament {code} — ZenCode Admin</title></svelte:head>

<a href="/admin/games" class="mb-4 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"><ArrowLeft class="size-4" /> Games</a>

{#if loadState === 'error'}
	<StateMessage tone="error" icon={CloudOff} title="Unable to open the tournament." description="Check your connection and reload." />
{:else if loadState === 'loading'}
	<div class="flex items-center gap-3 py-20 text-muted-foreground" role="status"><Spinner /> Loading tournament…</div>
{:else if loadState === 'missing' || !session}
	<StateMessage icon={CloudOff} title="Tournament not found" description="It may have been deleted from the session history." />
{:else}
	<PageHeader eyebrow="{gameNoun} · {formatLabel(session.format)}" title="Tournament {code}" description="One QR code for everyone. Each stage is a real {gameNoun} game with its own presenter and rules.">
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
			<p class="text-xs font-semibold tracking-[0.08em] text-muted-foreground uppercase">{stageLabel}</p>
			<p class="mt-0.5 text-sm text-foreground">
				{#if status === 'lobby'}
					{counts.lobby} of {session.rules.maxPlayers} registered{#if lobbyPlan && typeof lobbyPlan !== 'string'}
						→ {lobbyPlan.length} stage{lobbyPlan.length === 1 ? '' : 's'}, {describeStage(lobbyPlan[0], session.format)}{/if}
				{:else if status === 'stage'}
					{#if allFinished}
						Every room has finished — finish the stage to {session.final ? 'decide the podium' : 'send the qualifiers through'}.
					{:else}
						{rooms.length} {rooms.length === 1 ? 'game' : 'rooms'} · {session.plan[session.stage - 1] ? describeStage(session.plan[session.stage - 1], session.format) : ''}. Run each game from its presenter{session.game === 'scribble' ? ' (keep this page open: it runs every room’s clock)' : ''}.
					{/if}
				{:else if session.podium.length}
					Tournament complete.
				{:else}
					Tournament closed.
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
				<Button onclick={() => (confirm = 'prepare')} disabled={counts.lobby < 2}><Lock class="size-4" /> Lock entries & make stage 1…</Button>
			{:else if status === 'stage'}
				{#if rooms.some((r) => r.game?.status === 'lobby') && rooms.length > 1}
					<Button variant="outline" loading={busy?.startsWith('start:') ?? false} onclick={startAll}><Play class="size-4" /> Start all rooms</Button>
				{/if}
				<Button onclick={() => (confirm = 'finish')} disabled={!allFinished}><ChevronRight class="size-4" /> {session.final ? 'Finish final…' : `Finish stage ${session.stage}…`}</Button>
			{/if}
			{#if status !== 'finished'}
				<Button variant="outline" class="text-destructive hover:text-destructive" onclick={() => (confirm = 'close')}><Flag class="size-4" /> {status === 'lobby' ? 'Close lobby' : 'End tournament'}</Button>
			{/if}
		</div>
	</section>

	<!-- Stats -->
	<div class="mb-6 grid grid-cols-2 gap-3 md:grid-cols-5">
		<StatCard label="Registered" value={players.length - counts.removed} icon={Users} />
		<StatCard label={session.stage ? 'In this stage' : 'In lobby'} value={session.stage ? counts.playing : counts.lobby} />
		<StatCard label="Reserve" value={counts.reserve} helper="Joined after entries were locked" />
		<StatCard label="Rooms" value={session.stage ? rooms.length : (typeof lobbyPlan === 'object' && lobbyPlan ? lobbyPlan[0].sizes.length : 0)} icon={LayoutGrid} helper={session.stage ? '' : 'Provisional'} />
		<StatCard label="Stages" value={session.totalStages} icon={Swords} helper={session.stage ? `On stage ${session.stage}` : 'Planned'} />
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
								<p class="text-sm text-muted-foreground tabular">{p.score.toLocaleString('en-IN')} {session.game === 'tech-word-rush' ? 'XP' : 'pts'}</p>
							</li>
						{/each}
					</ol>
				</section>
			{/if}

			<!-- Rooms -->
			<section aria-labelledby="rooms-h">
				<div class="mb-3 flex items-center gap-2">
					<h2 id="rooms-h" class="text-[15px] font-semibold">{session.stage ? `${rooms.length === 1 ? 'Game' : 'Rooms'} · ${session.final ? 'Final' : `Stage ${session.stage}`}` : 'Stages'}</h2>
					{#if rooms.length > 1}<span class="text-xs text-muted-foreground tabular">{rooms.length}</span>{/if}
				</div>
				{#if !session.stage}
					<ol class="divide-y divide-border rounded-lg border border-border bg-card" aria-label="Planned stages">
						{#each session.plan as st (st.stage)}
							<li class="flex items-start gap-3 px-4 py-3 text-sm">
								<span class="grid size-6 shrink-0 place-items-center rounded-full bg-secondary text-xs font-semibold text-secondary-foreground">{st.stage}</span>
								<span>
									<span class="font-medium">{st.final ? 'Final' : `Stage ${st.stage}`}</span>
									<span class="block text-muted-foreground">{describeStage(st, session.format)}</span>
								</span>
							</li>
						{/each}
					</ol>
					<p class="mt-2 text-xs text-muted-foreground">Planned for {session.rules.maxPlayers} participants; the stages adjust to how many actually register.</p>
				{:else if !rooms.length}
					<div class="flex items-center gap-3 rounded-lg border border-border bg-card p-6 text-sm text-muted-foreground"><Spinner /> Creating games…</div>
				{:else}
					<ul class="grid gap-3 sm:grid-cols-2 2xl:grid-cols-3">
						{#each rooms as room (room.code)}
							{@const g = room.game}
							<li class="flex flex-col rounded-lg border border-border bg-card p-4">
								<div class="flex items-center gap-2">
									<span class="font-semibold">{rooms.length === 1 ? gameNoun : `Room ${room.number}`}</span>
									<span class="font-mono text-xs text-muted-foreground">{room.code}</span>
									{#if g}<SessionStatusBadge status={g.status} />{/if}
								</div>
								<p class="mt-1 text-xs text-muted-foreground tabular">{room.players} players · {gameStatusText(g)}</p>
								<ol class="mt-3 min-h-16 space-y-1">
									{#each top3(g) as r, i (r.id)}
										<li class="flex items-center gap-2 text-sm">
											<span class="w-5 font-mono text-xs {i < 2 ? 'text-brand' : 'text-muted-foreground'}">{i + 1}</span>
											<span class="min-w-0 flex-1 truncate">{r.name}</span>
											<span class="font-semibold tabular">{r.score}</span>
										</li>
									{:else}
										<li class="text-sm text-muted-foreground">{g?.status === 'lobby' ? 'Scores appear once the game is played.' : 'No scores yet.'}</li>
									{/each}
								</ol>
								<div class="mt-auto flex flex-wrap gap-2 pt-3">
									<Button size="sm" href={presenterHref(session.game, room.code)} target="_blank" rel="noopener"><ExternalLink class="size-3.5" /> Open presenter</Button>
									{#if g?.status === 'lobby'}
										<Button size="sm" variant="outline" loading={busy === `start:${room.code}`} onclick={() => roomAction(room.code, 'start')}><Play class="size-3.5" /> Start</Button>
									{:else if g && g.status !== 'finished'}
										<Button size="sm" variant="outline" class="text-destructive hover:text-destructive" loading={busy === `finish:${room.code}`} onclick={() => roomAction(room.code, 'finish')}><Flag class="size-3.5" /> End now</Button>
									{/if}
								</div>
							</li>
						{/each}
					</ul>
					{#if session.game === 'scribble' && anyRunning}
						<p class="mt-3 flex items-start gap-2 text-xs text-muted-foreground"><TriangleAlert class="mt-0.5 size-3.5 shrink-0 text-attention" /> Scribble rooms are timed from a screen. This page keeps every room moving — keep it open until the stage ends.</p>
					{/if}
				{/if}
			</section>

			<!-- Last stage's results -->
			{#if currentResult || (status === 'finished' && stages.length)}
				{@const r = currentResult ?? stages[stages.length - 1]}
				<section class="rounded-lg border border-border bg-card" aria-labelledby="result-h">
					<h2 id="result-h" class="border-b border-border px-4 py-3 text-[15px] font-semibold">{r.final ? 'Final' : `Stage ${r.stage}`} results</h2>
					<div class="grid gap-4 p-4 sm:grid-cols-2 2xl:grid-cols-3">
						{#each r.rooms as room (room.code)}
							<div>
								<p class="text-xs font-semibold tracking-[0.08em] text-muted-foreground uppercase">{r.rooms.length === 1 ? 'Ranking' : `Room ${room.number}`} <span class="font-mono normal-case tracking-normal">· {room.code}</span></p>
								<ol class="mt-2 space-y-1">
									{#each room.ranking as e (e.id)}
										{@const through = room.advancing.includes(e.id)}
										<li class="flex items-center gap-2 text-sm {through ? '' : 'text-muted-foreground'}">
											<span class="w-6 font-mono text-xs">{e.rank}</span>
											<span class="min-w-0 flex-1 truncate {through ? 'font-medium' : ''}">{e.name}</span>
											{#if through}<Trophy class="size-3.5 text-sun" aria-label={r.final ? 'Podium' : 'Through'} />{/if}
											<span class="tabular">{e.score}</span>
										</li>
									{/each}
								</ol>
							</div>
						{/each}
					</div>
				</section>
			{/if}

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
						<option value="active">Still in</option>
						<option value="out">Out</option>
						<option value="reserve">Reserve</option>
					</select>
				</header>
				<div class="max-h-96 overflow-y-auto">
					<table class="w-full text-left text-sm">
						<thead class="sticky top-0 bg-muted/80 text-[11px] font-semibold tracking-wider text-muted-foreground uppercase backdrop-blur">
							<tr><th class="px-4 py-2">Name</th><th class="px-4 py-2">Status</th><th class="px-4 py-2">Room</th><th class="px-4 py-2">Last stage</th><th class="px-4 py-2"><span class="sr-only">Actions</span></th></tr>
						</thead>
						<tbody class="divide-y divide-border">
							{#each shownPlayers.slice(0, 300) as p (p.id)}
								<tr>
									<td class="max-w-48 truncate px-4 py-2 font-medium">{p.name}</td>
									<td class="px-4 py-2 text-muted-foreground">{statusText[p.status] ?? p.status}{p.place ? ` · ${placeLabel(p.place)}` : ''}</td>
									<td class="px-4 py-2 text-muted-foreground tabular">{p.roomNumber ? `S${p.stage} · ${p.roomNumber}` : '—'}</td>
									<td class="px-4 py-2 text-muted-foreground tabular">{p.lastRank ? `${placeLabel(p.lastRank)} · ${p.lastScore ?? 0}` : '—'}</td>
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
			{#if stages.length > 1}
				<section class="rounded-lg border border-border bg-card" aria-labelledby="hist-h">
					<h2 id="hist-h" class="border-b border-border px-4 py-3 text-[15px] font-semibold">Stage history</h2>
					<ul class="divide-y divide-border">
						{#each stages as r (r.stage)}
							<li class="px-4 py-3 text-sm">
								<p class="font-medium">{r.final ? `Final (stage ${r.stage})` : `Stage ${r.stage}`} · {r.rooms.length} room{r.rooms.length === 1 ? '' : 's'} · {r.rooms.reduce((n, x) => n + x.ranking.length, 0)} players</p>
								<p class="mt-1 text-muted-foreground">
									{r.final ? 'Podium' : 'Through'}:
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
				<p class="mt-1 text-sm text-muted-foreground">One QR code for every participant, for the whole tournament.</p>
				<div class="mx-auto mt-4 max-w-56"><QrCode value={joinUrl} label="QR code to join tournament {code}" /></div>
				<p class="mt-3 text-center font-mono text-2xl font-bold tracking-[0.2em]">{code}</p>
				<p class="mt-1 text-center text-xs break-all text-muted-foreground">{joinUrl}</p>
				<p class="mt-3 text-center text-xs {session.registrationOpen ? 'text-emerald-700' : 'text-muted-foreground'}">
					Registration {session.registrationOpen ? 'open' : 'closed'}{session.stage && session.registrationOpen ? ' — new players join the reserve list' : ''}
				</p>
			</section>
			<section class="rounded-lg border border-border bg-card p-4 text-sm text-muted-foreground">
				<h2 class="text-[15px] font-semibold text-foreground">Rules</h2>
				<ul class="mt-2 space-y-1">
					{#if session.rules.format === 'rooms'}
						<li>{session.rules.stages} stages · rooms of up to {session.rules.roomSize} · top {session.rules.advance} per room go through · up to {session.rules.maxPlayers} participants</li>
					{:else}
						<li>{session.rules.stages} stages · everyone plays together · {session.rules.finalists} in the final · up to {session.rules.maxPlayers} participants</li>
					{/if}
					<li>
						{#if session.game === 'tech-word-rush'}
							{'words' in session.settings ? session.settings.words : ''} words a stage · {'duration' in session.settings ? session.settings.duration : ''} s a word · fresh words every stage
						{:else if isFlyGame(session.game)}
							{'duration' in session.settings ? Math.round(session.settings.duration / 60) : ''} min flight window a stage · best flight counts
						{:else if 'turns' in session.settings}
							{session.settings.turns} turns a room · {session.settings.drawSeconds} s to draw
						{/if}
					</li>
					<li>Cutoffs follow the game's own leaderboard and tie-breaks. Players removed from a game for going offline finish last.</li>
				</ul>
			</section>
		</aside>
	</div>

	<!-- Confirmations -->
	<Modal
		open={!!confirm}
		title={confirm === 'prepare' ? 'Lock entries and make stage 1?' : confirm === 'finish' ? (session.final ? 'Finish the final?' : `Finish stage ${session.stage}?`) : status === 'lobby' ? 'Close this lobby?' : 'End the tournament now?'}
		onclose={() => !busy && (confirm = null)}
	>
		{#if confirm === 'prepare'}
			<p class="text-sm text-muted-foreground">
				<span class="font-semibold text-foreground">{counts.lobby} players</span>
				{#if lobbyPlan && typeof lobbyPlan !== 'string'}
					→ <span class="font-semibold text-foreground">{lobbyPlan.length} stage{lobbyPlan.length === 1 ? '' : 's'}</span>, starting with {describeStage(lobbyPlan[0], session.format).toLowerCase()}.
				{:else if typeof lobbyPlan === 'string'}
					— the stages will be shortened to fit: {lobbyPlan}
				{/if}
				A {gameNoun} game is created for {session.format === 'rooms' ? 'each room' : 'the stage'} with everyone seated; anyone who registers later joins the reserve list.
			</p>
		{:else if confirm === 'finish'}
			<p class="text-sm text-muted-foreground">
				{#if session.final}
					The final's leaderboard decides 1st to 3rd and the tournament ends.
				{:else}
					Each room's leaderboard decides who goes through ({session.format === 'rooms' && session.rules.format === 'rooms' ? `top ${session.rules.advance} per room` : `top ${session.plan[session.stage - 1]?.advance ?? ''}`}), and stage {session.stage + 1}'s games are created straight away.
				{/if}
			</p>
		{:else}
			<p class="text-sm text-muted-foreground">
				{status === 'lobby' ? 'Registration closes for good and the tournament moves to the session history.' : 'Any game still running is ended without results and the tournament moves to the session history.'} You'll return to the Games page. This cannot be undone.
			</p>
		{/if}
		{#if actionError}<p class="mt-3 text-[13px] text-destructive" role="alert">{actionError}</p>{/if}
		{#snippet footer()}
			<Button variant="ghost" onclick={() => (confirm = null)} disabled={!!busy}>Cancel</Button>
			<Button variant={confirm === 'close' ? 'destructive' : 'default'} loading={!!busy} onclick={confirmed}>
				{confirm === 'prepare' ? 'Lock entries' : confirm === 'finish' ? (session?.final ? 'Finish final' : 'Finish stage') : status === 'lobby' ? 'Close lobby' : 'End tournament'}
			</Button>
		{/snippet}
	</Modal>

	<Modal open={!!removing} title="Remove {removing?.name ?? ''}?" onclose={() => !busy && (removing = null)}>
		<p class="text-sm text-muted-foreground">They leave the tournament and cannot go through to the next stage. A game they are already in keeps running.</p>
		{#snippet footer()}
			<Button variant="ghost" onclick={() => (removing = null)} disabled={!!busy}>Cancel</Button>
			<Button variant="destructive" loading={busy === 'remove-player'} onclick={removeConfirmed}><UserX class="size-4" /> Remove</Button>
		{/snippet}
	</Modal>
{/if}
