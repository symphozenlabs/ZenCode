<script lang="ts">
	import { goto } from '$app/navigation';
	import { collection, limit, onSnapshot, orderBy, query } from 'firebase/firestore';
	import { Play, ListChecks, Radio, History, Trophy, Users, CloudOff, Gamepad2, TriangleAlert, ArrowRight, Trash2, ChevronLeft, ChevronRight, Swords, Check } from '@lucide/svelte';
	import { db } from '$lib/firebase/client';
	import { adminAuth } from '$lib/stores/admin-auth.svelte';
	import { GAMES, TOURNAMENT, gameName, presenterHref } from '$lib/games/registry';
	import { SESSIONS, type LiveSession } from '$lib/games/tech-word-rush/types';
	import type { WordQuestion } from '$lib/games/tech-word-rush/questions';
	import { createSession } from '$lib/games/tech-word-rush/api';
	import { createSession as createFlappySession } from '$lib/games/flappy/api';
	import { durationLabel, type FlapSession } from '$lib/games/flappy/types';
	import { isFlyGame } from '$lib/games/flappy/skins';
	import { createTournament as createHeistTournament } from '$lib/games/word-heist/api';
	import type { HeistRules, HeistSession } from '$lib/games/word-heist/types';
	import { createSession as createScribbleSession } from '$lib/games/scribble/api';
	import type { DrawSession } from '$lib/games/scribble/types';
	import type { PackId } from '$lib/games/scribble/words';
	import { createTournament } from '$lib/games/tournament/api';
	import { DEFAULT_ROOM_SIZE as DRAW_ROOM, FORMAT_OF, ROOMS_LIMITS, formatLabel, isTournamentGame, type EliminationRules as ElimRules, type GameSettings, type TournamentRules, type TournamentSession } from '$lib/games/tournament/types';
	import { formatTimestamp } from '$lib/utils/format';
	import PageHeader from '$lib/components/admin/PageHeader.svelte';
	import Button from '$lib/components/ui/Button.svelte';
	import Modal from '$lib/components/ui/Modal.svelte';
	import Skeleton from '$lib/components/ui/Skeleton.svelte';
	import StateMessage from '$lib/components/ui/StateMessage.svelte';
	import AnimatedGrid from '$lib/components/motion/AnimatedGrid.svelte';
	import GradientOrb from '$lib/components/motion/GradientOrb.svelte';
	import SessionStatusBadge from '$lib/components/games/SessionStatusBadge.svelte';
	import type { QuestionMode } from '$lib/components/games/QuestionSetPicker.svelte';
	import TechWordRushSetup from '$lib/components/games/setup/TechWordRushSetup.svelte';
	import FlySetup from '$lib/components/games/setup/FlySetup.svelte';
	import ScribbleSetup from '$lib/components/games/setup/ScribbleSetup.svelte';
	import WordHeistSetup from '$lib/components/games/setup/WordHeistSetup.svelte';
	import EliminationRules from '$lib/components/games/setup/EliminationRules.svelte';
	import RoomsRules, { type RoomsShape } from '$lib/components/games/setup/RoomsRules.svelte';

	type AnySession = LiveSession | FlapSession | HeistSession | DrawSession | TournamentSession;
	let sessions = $state<AnySession[]>([]);
	let status = $state<'loading' | 'ready' | 'error'>('loading');
	let attempt = $state(0);

	$effect(() => {
		attempt;
		status = 'loading';
		const q = query(collection(db(), SESSIONS), orderBy('createdAt', 'desc'), limit(200));
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

	// A tournament's rooms are ordinary game sessions; they are shown from the tournament, not here.
	const visible = $derived(sessions.filter((s) => !('tournament' in s && s.tournament)));
	const active = $derived(visible.filter((s) => s.status !== 'finished'));
	const history = $derived(visible.filter((s) => s.status === 'finished'));

	// Session history, HISTORY_PAGE at a time.
	const HISTORY_PAGE = 10;
	let historyPage = $state(0);
	const historyPages = $derived(Math.max(1, Math.ceil(history.length / HISTORY_PAGE)));
	const historyRows = $derived(history.slice(historyPage * HISTORY_PAGE, (historyPage + 1) * HISTORY_PAGE));
	// Stay on a real page when sessions are cleared or finish.
	$effect(() => {
		if (historyPage > historyPages - 1) historyPage = historyPages - 1;
	});

	// Server readiness: live games need the Admin SDK for trusted scoring.
	let server = $state<{ ready: boolean; message: string | null } | null>(null);
	$effect(() => {
		fetch('/api/games/status')
			.then((r) => r.json())
			.then((v) => (server = v))
			.catch(() => (server = { ready: false, message: 'Unable to reach the game server.' }));
	});

	// ── Each game's own settings (shared by the Start and Tournament dialogs) ──
	let twr = $state({ duration: 15, words: 10, questionMode: 'random' as QuestionMode, questions: [] as WordQuestion[], problem: '' });
	let flap = $state({ duration: '180' });
	let scribble = $state({ drawSeconds: 80, turns: 8, packs: ['everyday', 'tech'] as PackId[], custom: '', problem: '' });
	const scribbleSettings = $derived({ drawSeconds: scribble.drawSeconds, turns: scribble.turns, packs: scribble.packs, custom: scribble.custom });

	// ── Start a live game ────────────────────────────────────────────────
	let startFor = $state<string | null>(null);
	const startOpen = $derived(startFor !== null);
	let heistGame = $state<{ rules: HeistRules | null; problem: string }>({ rules: null, problem: '' });
	let creating = $state(false);
	let createError = $state('');

	// Tech Word Rush needs a valid question set, Word Heist sensible rules, Scribble enough words.
	const blocked = $derived(
		startFor === 'word-heist' ? !heistGame.rules : startFor === 'scribble' ? !!scribble.problem : !isFlyGame(startFor) && !!twr.problem
	);

	function openStart(id: string) {
		startFor = id;
		createError = '';
	}

	async function start() {
		if (blocked) {
			// Word Heist problems are already shown beside their boxes; Scribble's word packs need a message here.
			createError = startFor === 'word-heist' ? '' : startFor === 'scribble' ? scribble.problem : twr.problem;
			return;
		}
		creating = true;
		createError = '';
		try {
			const token = await adminAuth.user?.getIdToken();
			if (!token) throw new Error('Your session expired. Sign in again.');
			if (startFor === 'word-heist') {
				const { code } = await createHeistTournament(token, heistGame.rules!);
				await goto(presenterHref('word-heist', code));
			} else if (isFlyGame(startFor)) {
				const { code } = await createFlappySession(token, Number(flap.duration), startFor);
				await goto(presenterHref(startFor, code));
			} else if (startFor === 'scribble') {
				const { code } = await createScribbleSession(token, scribbleSettings);
				await goto(presenterHref('scribble', code));
			} else {
				const { code } = await createSession(token, twr.duration, twr.questionMode === 'random' ? undefined : twr.questions);
				await goto(presenterHref('tech-word-rush', code));
			}
		} catch (err) {
			createError = (err as Error).message || 'Unable to create the game.';
			creating = false;
		}
	}

	// ── Tournament: pick a game, keep its setup, add the tournament rules ──
	let tourOpen = $state(false);
	let tourGame = $state<string | null>(null);
	let heistTour = $state<{ rules: HeistRules | null; problem: string }>({ rules: null, problem: '' });
	let elim = $state<{ rules: ElimRules | null; problem: string }>({ rules: null, problem: '' });
	let rooms = $state<{ rules: RoomsShape | null; problem: string }>({ rules: null, problem: '' });
	let tourCreating = $state(false);
	let tourError = $state('');

	/** How this game is run as a tournament. */
	const tourFormat = $derived(tourGame === 'word-heist' ? 'rooms' : isTournamentGame(tourGame) ? FORMAT_OF[tourGame] : null);
	const tourBlocked = $derived.by(() => {
		if (!tourGame) return true;
		if (tourGame === 'word-heist') return !heistTour.rules;
		if (tourGame === 'scribble') return !!scribble.problem || !rooms.rules;
		return !elim.rules;
	});

	function openTournament() {
		tourOpen = true;
		tourError = '';
	}

	async function createTour() {
		if (tourBlocked || !tourGame) return;
		tourCreating = true;
		tourError = '';
		try {
			const token = await adminAuth.user?.getIdToken();
			if (!token) throw new Error('Your session expired. Sign in again.');
			if (tourGame === 'word-heist') {
				const { code } = await createHeistTournament(token, heistTour.rules!);
				await goto(presenterHref('word-heist', code));
				return;
			}
			if (!isTournamentGame(tourGame)) throw new Error('Choose a game for the tournament.');
			let settings: GameSettings;
			let rules: TournamentRules;
			if (tourGame === 'tech-word-rush') {
				settings = { duration: twr.duration, words: twr.words };
				rules = elim.rules!;
			} else if (tourGame === 'scribble') {
				settings = scribbleSettings;
				rules = { format: 'rooms', ...rooms.rules! };
			} else {
				settings = { duration: Number(flap.duration) };
				rules = elim.rules!;
			}
			const { code } = await createTournament(token, { game: tourGame, settings, rules });
			await goto(presenterHref('tournament', code));
		} catch (err) {
			tourError = (err as Error).message || 'Unable to create the tournament.';
			tourCreating = false;
		}
	}

	// Clear session history (deletes the finished sessions from Firestore)
	let confirmClear = $state(false);
	let clearing = $state(false);
	let clearError = $state('');

	async function clearHistory() {
		clearing = true;
		clearError = '';
		try {
			const token = await adminAuth.user?.getIdToken();
			if (!token) throw new Error('Your session expired. Sign in again.');
			const res = await fetch('/api/games/history', { method: 'DELETE', headers: { authorization: `Bearer ${token}`, accept: 'application/json' } });
			const data = await res.json().catch(() => ({}));
			if (!res.ok) throw new Error(data?.message || 'Unable to clear the history.');
			confirmClear = false; // the list empties itself through the live query
		} catch (err) {
			clearError = (err as Error).message || 'Unable to clear the history.';
		} finally {
			clearing = false;
		}
	}

	/** One line about where a session is. */
	function progress(s: AnySession): string {
		switch (s.gameType) {
			case 'tournament':
				return `${gameName(s.game)} · ${s.stage === 0 ? 'Registration' : s.final ? 'Final' : `Stage ${s.stage} / ${s.totalStages}`}${s.rooms.length > 1 ? ` · ${s.rooms.length} rooms` : ''}`;
			case 'word-heist':
				return s.round === 0 ? 'Registration' : s.final ? 'Final' : `Round ${s.round} · ${s.roomCount} rooms`;
			case 'scribble':
				return s.status === 'lobby' ? `${s.totalTurns} turns` : `Turn ${Math.max(1, s.drawCount)} / ${s.totalTurns}`;
			case 'tech-word-rush':
				return s.questionIndex < 0 ? 'Not started' : `Word ${s.questionIndex + 1} / ${s.totalQuestions}`;
			default:
				return s.status === 'lobby' ? `${durationLabel(s.duration)} window` : 'Flights live';
		}
	}
	/** The name shown in the lists: a Word Heist tournament is a tournament too. */
	const listName = (s: AnySession) => (s.gameType === 'word-heist' && s.rules.mode === 'tournament' ? 'Word Heist tournament' : gameName(s.gameType));
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
					{#if game.poster}
						<img
							src={game.poster}
							alt=""
							class="absolute inset-0 size-full scale-105 object-cover object-[50%_18%] transition-transform duration-[1200ms] ease-out group-hover:scale-115 group-hover:-rotate-1"
						/>
						<div class="absolute inset-0 bg-gradient-to-t from-stage via-stage/55 to-stage/0"></div>
						<span class="card-sheen pointer-events-none absolute inset-0" aria-hidden="true"></span>
					{:else}
						<AnimatedGrid size={28} animated={false} />
						<GradientOrb size="16rem" class="-top-24 -right-16 opacity-40" />
					{/if}
					<div class="relative flex h-full flex-col justify-between">
						<p class="eyebrow {game.poster ? 'w-fit rounded-full bg-stage/60 px-2 py-0.5 text-green-300 backdrop-blur' : 'text-green-300/80'}">Live game</p>
						<div>
							{#if game.poster}
								<!-- The poster is the art -->
							{:else if game.id === 'word-heist'}
								<div class="mb-3 space-y-1" aria-hidden="true">
									{#each ['CARE', 'CRATER'] as w, row (w)}
										<div class="flex gap-1">
											{#each [...w] as ch, i (i)}
												<span
													class="grid h-7 w-6 place-items-center rounded border font-display text-sm font-bold transition-colors duration-300
														{row ? 'border-sun/60 bg-sun/15 text-sun group-hover:border-sun' : 'border-green-300/50 bg-forest-900 text-cream'}">{ch}</span
												>
											{/each}
										</div>
									{/each}
								</div>
							{:else if game.id === 'scribble'}
								<svg viewBox="0 0 160 80" class="absolute -top-2 right-0 h-28 w-auto" aria-hidden="true">
									<rect x="58" y="6" width="96" height="68" rx="8" fill="#fff" class="transition-transform duration-500 group-hover:-rotate-2" style="transform-origin: 106px 40px" />
									<path d="M72 58 C 80 26, 98 20, 108 40 S 130 62, 142 24" fill="none" stroke="#2563eb" stroke-width="4" stroke-linecap="round" />
									<circle cx="84" cy="26" r="7" fill="#facc15" />
									<path d="M112 60 l9 -15 l9 15z" fill="#ef4444" />
									<g transform="translate(46 50) rotate(35)" class="transition-transform duration-500 group-hover:translate-x-1">
										<rect x="-4" y="-30" width="8" height="26" rx="1.5" fill="#f0c45c" /><path d="M-4 -4 L0 4 L4 -4Z" fill="#fcd5b5" /><rect x="-4" y="-34" width="8" height="5" rx="1.5" fill="#ec4899" />
									</g>
								</svg>
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
							<Button variant="outline" href={game.manageHref}><ListChecks class="size-4" /> {game.manageLabel ?? 'Question bank'}</Button>
						{/if}
					</div>
				</div>
			</article>
		{/each}
	</div>
{/if}

<!-- Tournament module -->
<section class="group relative mt-6 overflow-hidden rounded-lg border border-border bg-stage text-cream" aria-labelledby="tournament-h">
	<AnimatedGrid size={28} animated={false} />
	<GradientOrb size="22rem" class="-top-32 -right-24 opacity-40" />
	<div class="relative flex flex-col gap-5 p-5 md:flex-row md:items-center md:gap-8">
		<div class="hidden shrink-0 md:block" aria-hidden="true">
			<div class="grid grid-cols-3 gap-1">
				{#each [8, 8, 8, 2, 2, 2, 0, 1, 0] as n, i (i)}
					<span class="grid size-8 place-items-center rounded border font-display text-xs font-bold transition-colors duration-300 {n === 1 ? 'border-sun bg-sun/20 text-sun' : n ? 'border-green-300/50 bg-forest-900 text-cream' : 'border-transparent'}">{n === 1 ? '★' : n || ''}</span>
				{/each}
			</div>
		</div>
		<div class="min-w-0 flex-1">
			<p class="eyebrow text-green-300/80">Tournament</p>
			<h2 id="tournament-h" class="mt-1 font-display text-2xl font-bold tracking-tight uppercase">{TOURNAMENT.name}</h2>
			<p class="mt-0.5 text-sm text-sun">{TOURNAMENT.tagline}</p>
			<p class="mt-3 max-w-2xl text-sm text-cream/70">{TOURNAMENT.description}</p>
			<ul class="mt-3 flex flex-wrap gap-1.5">
				{#each TOURNAMENT.tags as tag (tag)}
					<li class="rounded-md border border-green-300/30 px-2 py-0.5 text-xs font-medium text-green-300">{tag}</li>
				{/each}
			</ul>
		</div>
		<div class="shrink-0">
			<Button variant="sun" size="lg" onclick={openTournament} disabled={server?.ready === false}><Swords class="size-4" /> Create tournament</Button>
		</div>
	</div>
</section>

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
			<StateMessage icon={Radio} title="No live sessions" description="Start a live game or a tournament to open a lobby with a join QR code." />
		{:else}
			<ul class="divide-y divide-border">
				{#each active as s (s.code)}
					<li class="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3 text-sm">
						<span class="min-w-0">
							<span class="block font-mono font-semibold tracking-wider">{s.code}</span>
							<span class="block text-xs text-muted-foreground">
								{listName(s)} · {formatTimestamp(s.createdAt, true)}
							</span>
						</span>
						<SessionStatusBadge status={s.status} />
						<span class="inline-flex items-center gap-1 text-xs text-muted-foreground tabular"><Users class="size-3.5" />{s.playerCount}</span>
						<span class="text-xs text-muted-foreground tabular">{progress(s)}</span>
						<Button size="sm" variant="outline" class="ml-auto" href={presenterHref(s.gameType, s.code)}>
							{s.gameType === 'tournament' || (s.gameType === 'word-heist' && s.rules.mode === 'tournament') ? 'Open dashboard' : 'Open presenter'}
							<ArrowRight class="size-3.5" />
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
			{#if history.length}
				<span class="ml-auto text-xs text-muted-foreground tabular">{history.length}</span>
				<Button size="sm" variant="ghost" class="-my-1 text-muted-foreground hover:text-destructive" onclick={() => ((clearError = ''), (confirmClear = true))}>
					<Trash2 class="size-3.5" /> Clear all
				</Button>
			{/if}
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
				{#each historyRows as s (s.code)}
					<li>
						<a
							href={presenterHref(s.gameType, s.code)}
							class="grid grid-cols-[1fr_auto] items-center gap-x-4 gap-y-0.5 px-4 py-3 text-sm transition-colors duration-150 hover:bg-muted/60 sm:grid-cols-[7rem_1fr_5rem_auto]"
						>
							<span class="min-w-0">
								<span class="block font-mono font-semibold tracking-wider">{s.code}</span>
								<span class="block truncate text-[11px] text-muted-foreground">{listName(s)}</span>
							</span>
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
			{#if historyPages > 1}
				<nav class="flex items-center justify-between gap-2 border-t border-border px-4 py-2.5 text-[13px] text-muted-foreground" aria-label="Session history pages">
					<span class="tabular">{historyPage * HISTORY_PAGE + 1}–{Math.min(history.length, (historyPage + 1) * HISTORY_PAGE)} of {history.length}</span>
					<div class="flex items-center gap-1">
						<Button size="sm" variant="outline" disabled={historyPage === 0} onclick={() => historyPage--} aria-label="Previous page"><ChevronLeft class="size-4" /></Button>
						<span class="px-2 tabular">Page {historyPage + 1} / {historyPages}</span>
						<Button size="sm" variant="outline" disabled={historyPage >= historyPages - 1} onclick={() => historyPage++} aria-label="Next page"><ChevronRight class="size-4" /></Button>
					</div>
				</nav>
			{/if}
		{/if}
	</section>
</div>

<!-- Start a live game: each game's own settings -->
<Modal
	open={startOpen}
	size={isFlyGame(startFor) || startFor === 'word-heist' || startFor === 'scribble' ? 'md' : 'lg'}
	title="Start {startFor ? gameName(startFor) : ''}"
	description="Opens a lobby with a QR code for players to join."
	onclose={() => !creating && (startFor = null)}
>
	{#if startFor === 'word-heist'}
		<WordHeistSetup mode="game" bind:rules={heistGame.rules} bind:problem={heistGame.problem} />
	{:else if isFlyGame(startFor)}
		<FlySetup bind:duration={flap.duration} />
	{:else if startFor === 'scribble'}
		<ScribbleSetup bind:drawSeconds={scribble.drawSeconds} bind:turns={scribble.turns} bind:packs={scribble.packs} bind:custom={scribble.custom} bind:problem={scribble.problem} />
	{:else if startFor}
		<TechWordRushSetup bind:duration={twr.duration} bind:questionMode={twr.questionMode} bind:questions={twr.questions} bind:problem={twr.problem} />
	{/if}
	{#if createError}<p class="mt-4 text-[13px] text-destructive" role="alert">{createError}</p>{/if}
	{#snippet footer()}
		<Button variant="ghost" onclick={() => (startFor = null)} disabled={creating}>Cancel</Button>
		<Button onclick={start} loading={creating} disabled={blocked}>
			{creating ? 'Creating…' : startFor === 'word-heist' ? 'Create game' : 'Create lobby'}
		</Button>
	{/snippet}
</Modal>

<!-- Create a tournament: the game, its own setup, then the tournament rules for that game -->
<Modal open={tourOpen} size="lg" title="Create tournament" description="Pick a game, keep its own setup, and add the tournament rules on top." onclose={() => !tourCreating && (tourOpen = false)}>
	<div class="space-y-6">
		<fieldset>
			<legend class="text-[13px] font-medium text-foreground">Game</legend>
			<div class="mt-1.5 grid gap-2 sm:grid-cols-2 lg:grid-cols-3" role="radiogroup" aria-label="Game">
				{#each GAMES as game (game.id)}
					{@const on = tourGame === game.id}
					{@const format = game.id === 'word-heist' ? 'rooms' : isTournamentGame(game.id) ? FORMAT_OF[game.id] : 'elimination'}
					<button
						type="button"
						role="radio"
						aria-checked={on}
						onclick={() => ((tourGame = game.id), (tourError = ''))}
						class="flex items-start gap-2 rounded-md border px-3 py-2 text-left transition-colors {on ? 'border-ring bg-accent' : 'border-border hover:bg-muted'}"
					>
						<span class="mt-0.5 grid size-4 shrink-0 place-items-center rounded-full border {on ? 'border-primary bg-primary text-primary-foreground' : 'border-input'}">{#if on}<Check class="size-3" />{/if}</span>
						<span class="min-w-0">
							<span class="block text-sm font-medium">{game.name}</span>
							<span class="block text-xs text-muted-foreground">{formatLabel(format)}</span>
						</span>
					</button>
				{/each}
			</div>
		</fieldset>

		{#if tourGame}
			<section class="space-y-3" aria-labelledby="setup-h">
				<h3 id="setup-h" class="text-[13px] font-semibold tracking-[0.08em] text-muted-foreground uppercase">{gameName(tourGame)} setup</h3>
				{#if tourGame === 'word-heist'}
					<WordHeistSetup mode="tournament" bind:rules={heistTour.rules} bind:problem={heistTour.problem} />
				{:else if isFlyGame(tourGame)}
					<FlySetup bind:duration={flap.duration} tournament />
				{:else if tourGame === 'scribble'}
					<ScribbleSetup bind:drawSeconds={scribble.drawSeconds} bind:turns={scribble.turns} bind:packs={scribble.packs} bind:custom={scribble.custom} bind:problem={scribble.problem} tournament />
				{:else}
					<TechWordRushSetup bind:duration={twr.duration} bind:words={twr.words} bind:problem={twr.problem} tournament />
				{/if}
			</section>

			{#if tourGame !== 'word-heist'}
				<section class="space-y-3 border-t border-border pt-5" aria-labelledby="rules-h">
					<h3 id="rules-h" class="text-[13px] font-semibold tracking-[0.08em] text-muted-foreground uppercase">Tournament rules · {formatLabel(tourFormat ?? 'elimination')}</h3>
					{#if tourFormat === 'rooms'}
						<RoomsRules limits={ROOMS_LIMITS} defaults={{ maxPlayers: 32, stages: 2, roomSize: DRAW_ROOM, advance: 2 }} bind:rules={rooms.rules} bind:problem={rooms.problem} />
					{:else}
						<EliminationRules bind:rules={elim.rules} bind:problem={elim.problem} />
					{/if}
				</section>
			{/if}
			<p class="rounded-md bg-muted px-3 py-2 text-[13px] text-muted-foreground">
				Everyone registers once with one QR code. Each stage is a real {gameName(tourGame)} game run by its own rules{tourGame === 'word-heist'
					? ' on the live server'
					: tourFormat === 'rooms'
						? ', one game per room'
						: ' on the big screen'}; the top of each leaderboard goes through until the final decides the podium.
			</p>
		{/if}
		{#if tourError}<p class="text-[13px] text-destructive" role="alert">{tourError}</p>{/if}
	</div>
	{#snippet footer()}
		<Button variant="ghost" onclick={() => (tourOpen = false)} disabled={tourCreating}>Cancel</Button>
		<Button onclick={createTour} loading={tourCreating} disabled={tourBlocked}>{tourCreating ? 'Creating…' : 'Create tournament'}</Button>
	{/snippet}
</Modal>

<Modal
	open={confirmClear}
	title="Clear session history?"
	description="Every finished game is permanently deleted: leaderboards, winners, players and their data."
	onclose={() => !clearing && (confirmClear = false)}
>
	<p class="text-sm text-muted-foreground">Lobbies and games still running are kept. This cannot be undone.</p>
	{#if clearError}<p class="mt-3 text-[13px] text-destructive" role="alert">{clearError}</p>{/if}
	{#snippet footer()}
		<Button variant="ghost" onclick={() => (confirmClear = false)} disabled={clearing}>Cancel</Button>
		<Button variant="destructive" onclick={clearHistory} loading={clearing}><Trash2 class="size-4" /> {clearing ? 'Deleting…' : 'Delete all'}</Button>
	{/snippet}
</Modal>

<style>
	/* A band of light sweeps across poster art on hover. */
	.card-sheen {
		background: linear-gradient(105deg, transparent 35%, rgba(255, 255, 255, 0.28) 48%, transparent 60%);
		transform: translateX(-110%);
	}
	:global(.group:hover) .card-sheen {
		transform: translateX(110%);
		transition: transform 0.9s cubic-bezier(0.45, 0, 0.2, 1);
	}
	@media (prefers-reduced-motion: reduce) {
		.card-sheen {
			display: none;
		}
	}
</style>
