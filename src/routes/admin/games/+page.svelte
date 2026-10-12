<script lang="ts">
	import { goto } from '$app/navigation';
	import { collection, limit, onSnapshot, orderBy, query } from 'firebase/firestore';
	import { Play, ListChecks, Radio, History, Trophy, Users, CloudOff, Gamepad2, TriangleAlert, ArrowRight } from '@lucide/svelte';
	import { db } from '$lib/firebase/client';
	import { adminAuth } from '$lib/stores/admin-auth.svelte';
	import { GAMES, gameName, presenterHref } from '$lib/games/registry';
	import { SESSIONS, type LiveSession } from '$lib/games/tech-word-rush/types';
	import { QUESTIONS_PER_GAME } from '$lib/games/tech-word-rush/questions';
	import { createSession } from '$lib/games/tech-word-rush/api';
	import { createSession as createFlappySession } from '$lib/games/flappy/api';
	import { DURATIONS as FLAP_DURATIONS, durationLabel, type FlapSession } from '$lib/games/flappy/types';
	import { isFlyGame } from '$lib/games/flappy/skins';
	import { formatTimestamp } from '$lib/utils/format';
	import PageHeader from '$lib/components/admin/PageHeader.svelte';
	import Button from '$lib/components/ui/Button.svelte';
	import Modal from '$lib/components/ui/Modal.svelte';
	import SelectField from '$lib/components/ui/SelectField.svelte';
	import Skeleton from '$lib/components/ui/Skeleton.svelte';
	import StateMessage from '$lib/components/ui/StateMessage.svelte';
	import AnimatedGrid from '$lib/components/motion/AnimatedGrid.svelte';
	import GradientOrb from '$lib/components/motion/GradientOrb.svelte';
	import SessionStatusBadge from '$lib/components/games/SessionStatusBadge.svelte';

	type AnySession = LiveSession | FlapSession;
	let sessions = $state<AnySession[]>([]);
	let status = $state<'loading' | 'ready' | 'error'>('loading');
	let attempt = $state(0);

	$effect(() => {
		attempt;
		status = 'loading';
		const q = query(collection(db(), SESSIONS), orderBy('createdAt', 'desc'), limit(40));
		return onSnapshot(
			q,
			(snap) => {
				sessions = snap.docs.map((d) => d.data() as AnySession);
				status = 'ready';
			},
			(err) => {
				console.error('[games]', err);
				status = 'error';
			}
		);
	});

	const active = $derived(sessions.filter((s) => s.status !== 'finished'));
	const history = $derived(sessions.filter((s) => s.status === 'finished'));

	// Server readiness: live games need the Admin SDK for trusted scoring.
	let server = $state<{ ready: boolean; message: string | null } | null>(null);
	$effect(() => {
		fetch('/api/games/status')
			.then((r) => r.json())
			.then((v) => (server = v))
			.catch(() => (server = { ready: false, message: 'Unable to reach the game server.' }));
	});

	// Start a live game
	let startFor = $state<string | null>(null);
	const startOpen = $derived(startFor !== null);
	let duration = $state('45');
	let flapDuration = $state('180');
	let creating = $state(false);
	let createError = $state('');

	function openStart(id: string) {
		startFor = id;
		createError = '';
	}

	async function start() {
		creating = true;
		createError = '';
		try {
			const token = await adminAuth.user?.getIdToken();
			if (!token) throw new Error('Your session expired. Sign in again.');
			if (isFlyGame(startFor)) {
				const { code } = await createFlappySession(token, Number(flapDuration), startFor);
				await goto(presenterHref(startFor, code));
			} else {
				const { code } = await createSession(token, Number(duration));
				await goto(presenterHref('tech-word-rush', code));
			}
		} catch (err) {
			createError = (err as Error).message || 'Unable to create the game.';
			creating = false;
		}
	}
</script>

<svelte:head><title>Games — ZenCode Admin</title></svelte:head>

<PageHeader eyebrow="Live" title="Games" description="Create and manage live interactive games." />

{#if server && !server.ready}
	<div class="mb-6 flex items-start gap-3 rounded-lg border border-orange-200 bg-orange-50 px-4 py-3 text-sm text-orange-900" role="status">
		<TriangleAlert class="mt-0.5 size-4 shrink-0" />
		<p><span class="font-semibold">Live games are not available yet.</span> {server.message}</p>
	</div>
{/if}

{#if !GAMES.length}
	<div class="rounded-lg border border-border bg-card">
		<StateMessage icon={Gamepad2} title="No games available" description="Create or configure a game to get started." />
	</div>
{:else}
	<div class="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
		{#each GAMES as game (game.id)}
			<article
				class="group flex flex-col overflow-hidden rounded-lg border border-border bg-card transition-[border-color,box-shadow,transform] duration-200 hover:-translate-y-0.5 hover:border-ring/50 hover:shadow-lg hover:shadow-forest-950/5"
			>
				<div class="relative h-44 overflow-hidden bg-stage px-5 py-5 text-cream">
					<AnimatedGrid size={28} animated={false} />
					<GradientOrb size="16rem" class="-top-24 -right-16 opacity-40" />
					<div class="relative flex h-full flex-col justify-between">
						<p class="eyebrow text-green-300/80">Live game</p>
						<div>
							{#if game.id === 'symba'}
								<img src="/games/symba/boost.webp" alt="" class="absolute -top-6 -right-4 h-44 w-auto drop-shadow-[0_12px_24px_rgba(0,0,0,0.45)] transition-transform duration-500 group-hover:-translate-y-2 group-hover:rotate-[-3deg]" />
							{:else if game.id === 'flappy'}
								<svg viewBox="0 0 160 70" class="absolute -top-1 right-0 h-28 w-auto" aria-hidden="true">
									<defs>
										<linearGradient id="bamboo-art" x1="0" x2="1">
											<stop offset="0" stop-color="#21461a" /><stop offset="0.3" stop-color="#9fd06a" /><stop offset="0.5" stop-color="#86bd4f" /><stop offset="1" stop-color="#1d3f16" />
										</linearGradient>
										<radialGradient id="bird-art" cx="0.35" cy="0.3"><stop offset="0" stop-color="#fff6c2" /><stop offset="0.5" stop-color="#ffd34e" /><stop offset="1" stop-color="#ee9b22" /></radialGradient>
									</defs>
									<rect x="96" y="-10" width="22" height="30" fill="url(#bamboo-art)" /><rect x="93" y="16" width="28" height="7" rx="2" fill="url(#bamboo-art)" />
									<rect x="96" y="56" width="22" height="30" fill="url(#bamboo-art)" /><rect x="93" y="52" width="28" height="7" rx="2" fill="url(#bamboo-art)" />
									<rect x="136" y="-10" width="22" height="18" fill="url(#bamboo-art)" /><rect x="133" y="5" width="28" height="7" rx="2" fill="url(#bamboo-art)" />
									<rect x="136" y="44" width="22" height="40" fill="url(#bamboo-art)" /><rect x="133" y="40" width="28" height="7" rx="2" fill="url(#bamboo-art)" />
									<g transform="translate(62 38) rotate(-12)">
										<g class="transition-transform duration-500 group-hover:-translate-y-1.5">
											<path d="M-7 -1 L-14 -5 L-12 0 L-14 4 L-6 3Z" fill="#d9822a" />
											<ellipse rx="10" ry="8" fill="url(#bird-art)" stroke="#6e3708" stroke-opacity="0.6" />
											<ellipse cx="-3" cy="1" rx="6" ry="3.6" fill="#f2a43a" stroke="#6e3708" stroke-opacity="0.5" />
											<circle cx="4.5" cy="-3" r="3.4" fill="#fff" /><circle cx="5.6" cy="-2.8" r="1.6" fill="#18181b" />
											<path d="M6 -0.5 L13 1 L6 3Z" fill="#ff7b2e" />
										</g>
									</g>
								</svg>
							{:else}
							<div class="mb-3 flex gap-1" aria-hidden="true">
								{#each ['P', '', '', '', '', 'N'] as ch, i (i)}
									<span
										class="grid h-8 w-6.5 place-items-center rounded border font-display text-sm font-bold transition-colors duration-300
											{ch ? 'border-green-300/60 bg-forest-900 text-cream' : 'border-stage-line bg-stage-raised group-hover:border-green-300/30'}"
										>{ch}</span
									>
								{/each}
							</div>
							{/if}
							<h2 class="font-display text-2xl font-bold tracking-tight uppercase">{game.name}</h2>
							<p class="mt-0.5 text-sm text-sun">{game.tagline}</p>
						</div>
					</div>
				</div>
				<div class="flex flex-1 flex-col p-5">
					<p class="text-sm text-muted-foreground">{game.description}</p>
					<ul class="mt-3 flex flex-wrap gap-1.5">
						{#each game.tags as tag (tag)}
							<li class="rounded-md bg-secondary px-2 py-0.5 text-xs font-medium text-secondary-foreground">{tag}</li>
						{/each}
					</ul>
					<div class="mt-auto flex flex-wrap gap-2 pt-5">
						<Button onclick={() => openStart(game.id)} disabled={server?.ready === false}>
							<Play class="size-4" /> Start live game
						</Button>
						{#if game.manageHref}
							<Button variant="outline" href={game.manageHref}><ListChecks class="size-4" /> Question bank</Button>
						{/if}
					</div>
				</div>
			</article>
		{/each}
	</div>
{/if}

<!-- Sessions -->
<div class="mt-8 grid gap-6 xl:grid-cols-2">
	<section class="rounded-lg border border-border bg-card" aria-labelledby="active-h">
		<header class="flex items-center gap-2 border-b border-border px-4 py-3">
			<Radio class="size-4 text-brand" />
			<h2 id="active-h" class="text-[15px] font-semibold">Active sessions</h2>
			{#if active.length}<span class="ml-auto text-xs text-muted-foreground tabular">{active.length}</span>{/if}
		</header>
		{#if status === 'loading'}
			<ul class="divide-y divide-border">
				{#each Array(2) as _, i (i)}
					<li class="flex items-center gap-4 px-4 py-3"><Skeleton class="h-4 w-20" /><Skeleton class="h-5 w-24" /><Skeleton class="ml-auto h-8 w-28" /></li>
				{/each}
			</ul>
		{:else if status === 'error'}
			<StateMessage tone="error" icon={CloudOff} title="Unable to load sessions." description="Check your connection, then retry.">
				<Button variant="outline" onclick={() => attempt++}>Retry</Button>
			</StateMessage>
		{:else if !active.length}
			<StateMessage icon={Radio} title="No live sessions" description="Start a live game to open a lobby with a join QR code." />
		{:else}
			<ul class="divide-y divide-border">
				{#each active as s (s.code)}
					<li class="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3 text-sm">
						<span class="min-w-0">
							<span class="block font-mono font-semibold tracking-wider">{s.code}</span>
							<span class="block text-xs text-muted-foreground">
								{gameName(s.gameType)} · {formatTimestamp(s.createdAt, true)}
							</span>
						</span>
						<SessionStatusBadge status={s.status} />
						<span class="inline-flex items-center gap-1 text-xs text-muted-foreground tabular"><Users class="size-3.5" />{s.playerCount}</span>
						<span class="text-xs text-muted-foreground tabular">
							{#if s.gameType !== 'tech-word-rush'}
								{s.status === 'lobby' ? `${durationLabel(s.duration)} window` : 'Flights live'}
							{:else}
								{s.questionIndex < 0 ? 'Not started' : `Word ${s.questionIndex + 1} / ${s.totalQuestions}`}
							{/if}
						</span>
						<Button size="sm" variant="outline" class="ml-auto" href={presenterHref(s.gameType, s.code)}>
							Open presenter <ArrowRight class="size-3.5" />
						</Button>
					</li>
				{/each}
			</ul>
		{/if}
	</section>

	<section class="rounded-lg border border-border bg-card" aria-labelledby="history-h">
		<header class="flex items-center gap-2 border-b border-border px-4 py-3">
			<History class="size-4 text-muted-foreground" />
			<h2 id="history-h" class="text-[15px] font-semibold">Session history</h2>
			{#if history.length}<span class="ml-auto text-xs text-muted-foreground tabular">{history.length}</span>{/if}
		</header>
		{#if status === 'loading'}
			<ul class="divide-y divide-border">
				{#each Array(3) as _, i (i)}
					<li class="flex items-center gap-4 px-4 py-3"><Skeleton class="h-4 w-20" /><Skeleton class="h-4 w-32" /><Skeleton class="ml-auto h-4 w-16" /></li>
				{/each}
			</ul>
		{:else if status === 'ready' && !history.length}
			<StateMessage icon={History} title="No finished games yet" description="Completed sessions and their winners appear here." />
		{:else if status === 'ready'}
			<ul class="divide-y divide-border">
				{#each history as s (s.code)}
					<li>
						<a
							href={presenterHref(s.gameType, s.code)}
							class="grid grid-cols-[1fr_auto] items-center gap-x-4 gap-y-0.5 px-4 py-3 text-sm transition-colors duration-150 hover:bg-muted/60 sm:grid-cols-[7rem_1fr_5rem_auto]"
						>
							<span class="font-mono font-semibold tracking-wider">{s.code}</span>
							<span class="order-3 col-span-2 flex min-w-0 items-center gap-1.5 text-muted-foreground sm:order-none sm:col-span-1">
								{#if s.winner}
									<Trophy class="size-3.5 shrink-0 text-sun" />
									<span class="truncate font-medium text-foreground">{s.winner.name}</span>
									<span class="text-xs tabular">
										{'score' in s.winner ? `${s.winner.score.toLocaleString('en-IN')} pts` : `${s.winner.xp.toLocaleString('en-IN')} XP`}
									</span>
								{:else}
									<span class="text-xs">No players</span>
								{/if}
							</span>
							<span class="hidden items-center gap-1 text-xs text-muted-foreground tabular sm:inline-flex"><Users class="size-3.5" />{s.playerCount}</span>
							<span class="text-right text-xs text-muted-foreground tabular">{formatTimestamp(s.endedAt ?? s.createdAt, true)}</span>
						</a>
					</li>
				{/each}
			</ul>
		{/if}
	</section>
</div>

<Modal
	open={startOpen}
	title="Start {startFor ? gameName(startFor) : ''}"
	description="Opens a lobby with a QR code for players to join."
	onclose={() => !creating && (startFor = null)}
>
	{#if isFlyGame(startFor)}
		<div class="space-y-4">
			<SelectField label="Game length" bind:value={flapDuration} options={FLAP_DURATIONS.map((d) => ({ value: String(d), label: durationLabel(d) }))} />
			<ul class="space-y-1.5 text-[13px] text-muted-foreground">
				<li>• Players can practise in the lobby while they wait.</li>
				<li>• Once you start, they fly as many times as they like until time runs out.</li>
				<li>• Each new flight <span class="font-medium text-foreground">replaces</span> their previous score — only the latest counts.</li>
				<li>• The final leaderboard appears when the timer ends.</li>
			</ul>
			{#if createError}<p class="text-[13px] text-destructive" role="alert">{createError}</p>{/if}
		</div>
	{:else}
	<div class="space-y-4">
		<SelectField
			label="Time per word"
			bind:value={duration}
			options={[
				{ value: '30', label: '30 seconds' },
				{ value: '45', label: '45 seconds' },
				{ value: '60', label: '60 seconds' },
				{ value: '90', label: '90 seconds' }
			]}
		/>
		<dl class="grid grid-cols-2 gap-2 text-center">
			<div class="rounded-md bg-muted px-2 py-2">
				<dt class="text-[11px] text-muted-foreground">Words</dt>
				<dd class="text-lg font-semibold tabular">{QUESTIONS_PER_GAME}</dd>
			</div>
			<div class="rounded-md bg-muted px-2 py-2">
				<dt class="text-[11px] text-muted-foreground">Max XP per word</dt>
				<dd class="text-lg font-semibold tabular">100</dd>
			</div>
		</dl>
		<p class="text-[13px] text-muted-foreground">Words are picked at random from the question bank and ordered easy to hard.</p>
		{#if createError}<p class="text-[13px] text-destructive" role="alert">{createError}</p>{/if}
	</div>
	{/if}
	{#snippet footer()}
		<Button variant="ghost" onclick={() => (startFor = null)} disabled={creating}>Cancel</Button>
		<Button onclick={start} loading={creating}>{creating ? 'Creating game…' : 'Create lobby'}</Button>
	{/snippet}
</Modal>
