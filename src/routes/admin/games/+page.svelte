<script lang="ts">
	import { untrack } from 'svelte';
	import { goto } from '$app/navigation';
	import { collection, limit, onSnapshot, orderBy, query } from 'firebase/firestore';
	import { Play, ListChecks, Radio, History, Trophy, Users, CloudOff, Gamepad2, TriangleAlert, ArrowRight, Trash2, ChevronLeft, ChevronRight } from '@lucide/svelte';
	import { db } from '$lib/firebase/client';
	import { adminAuth } from '$lib/stores/admin-auth.svelte';
	import { GAMES, gameName, presenterHref } from '$lib/games/registry';
	import { SESSIONS, type LiveSession } from '$lib/games/tech-word-rush/types';
	import { QUESTIONS_PER_GAME, type WordQuestion } from '$lib/games/tech-word-rush/questions';
	import { createSession } from '$lib/games/tech-word-rush/api';
	import { createSession as createFlappySession } from '$lib/games/flappy/api';
	import { DURATIONS as FLAP_DURATIONS, durationLabel, type FlapSession } from '$lib/games/flappy/types';
	import { isFlyGame } from '$lib/games/flappy/skins';
	import { createTournament } from '$lib/games/word-heist/api';
	import { describeSizes, maxParticipants, planStages, solveShape, type ShapeKey } from '$lib/games/word-heist/allocation';
	import {
		DEFAULT_ROOM_SIZE,
		DEFAULT_RULES,
		FINAL_OPTIONS,
		GAME_RULES,
		MAX_PLAYERS,
		MAX_STAGES,
		PACE_LIMITS,
		ROOM_MAX,
		ROOM_MIN,
		ROUND_SECONDS,
		RULE_LIMITS,
		TILE_LIMITS,
		maxTilesFor,
		formatClock,
		suggestedTiles,
		TILE_BANDS,
		bandTiles,
		tileBand,
		tilePace,
		tilesFor,
		type HeistMode,
		type HeistRules,
		type HeistSession
	} from '$lib/games/word-heist/types';
	import { createSession as createScribbleSession } from '$lib/games/scribble/api';
	import { DRAW_SECONDS, TURN_COUNTS, type DrawSession } from '$lib/games/scribble/types';
	import { PACKS, buildPool, parseCustomWords, type PackId } from '$lib/games/scribble/words';
	import { formatTimestamp } from '$lib/utils/format';
	import PageHeader from '$lib/components/admin/PageHeader.svelte';
	import Button from '$lib/components/ui/Button.svelte';
	import Modal from '$lib/components/ui/Modal.svelte';
	import SelectField from '$lib/components/ui/SelectField.svelte';
	import Field from '$lib/components/ui/Field.svelte';
	import Segmented from '$lib/components/live/Segmented.svelte';
	import QuestionSetPicker, { type QuestionMode } from '$lib/components/games/QuestionSetPicker.svelte';
	import Skeleton from '$lib/components/ui/Skeleton.svelte';
	import StateMessage from '$lib/components/ui/StateMessage.svelte';
	import AnimatedGrid from '$lib/components/motion/AnimatedGrid.svelte';
	import GradientOrb from '$lib/components/motion/GradientOrb.svelte';
	import SessionStatusBadge from '$lib/components/games/SessionStatusBadge.svelte';

	type AnySession = LiveSession | FlapSession | HeistSession | DrawSession;
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

	const active = $derived(sessions.filter((s) => s.status !== 'finished'));
	const history = $derived(sessions.filter((s) => s.status === 'finished'));

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

	// Start a live game
	let startFor = $state<string | null>(null);
	const startOpen = $derived(startFor !== null);
	let duration = $state(15);
	let questionMode = $state<QuestionMode>('random');
	let fixedQuestions = $state<WordQuestion[]>([]);
	let questionProblem = $state('');
	let flapDuration = $state('180');
	// Word Heist: one game room, or a tournament of stages.
	let heistMode = $state<HeistMode>('tournament');
	let heist = $state({
		roundSeconds: String(DEFAULT_RULES.roundSeconds),
		finalSeconds: String(DEFAULT_RULES.finalSeconds),
		tiles: String(DEFAULT_RULES.tileCount),
		minWordLength: String(DEFAULT_RULES.minWordLength),
		gamePlayers: String(DEFAULT_ROOM_SIZE),
		participants: String(DEFAULT_RULES.maxPlayers),
		stages: String(DEFAULT_RULES.stages),
		advance: String(DEFAULT_RULES.advance),
		roomSize: String(DEFAULT_RULES.roomSize)
	});

	const roundSeconds = $derived(Number(heist.roundSeconds));
	const finalSeconds = $derived(Number(heist.finalSeconds));
	const tileCount = $derived(Number(heist.tiles));
	/** The room size tiles are set for: the game's players, or a tournament's room size. */
	const fullRoom = $derived(Number(heistMode === 'game' ? heist.gamePlayers : heist.roomSize));

	const heistRules = $derived<HeistRules>(
		heistMode === 'game'
			? { ...GAME_RULES, roundSeconds, finalSeconds, tileCount, minWordLength: Number(heist.minWordLength), maxPlayers: fullRoom, roomSize: fullRoom }
			: {
					mode: 'tournament',
					roundSeconds,
					finalSeconds,
					tileCount,
					minWordLength: Number(heist.minWordLength),
					stages: Number(heist.stages),
					advance: Number(heist.advance),
					maxPlayers: Number(heist.participants),
					roomSize: fullRoom
				}
	);
	/** Most players the chosen stages, room size and players-through can take. */
	const heistMax = $derived(maxParticipants(Number(heist.stages), Number(heist.advance), fullRoom));
	const heistPlan = $derived(
		heistMode === 'game' ? planStages(fullRoom, 1, 0, fullRoom) : planStages(Number(heist.participants), Number(heist.stages), Number(heist.advance), fullRoom)
	);
	const heistPace = $derived(tilePace(roundSeconds, tileCount));
	/** Most tiles a full room can have for this round length. */
	const maxTiles = $derived(maxTilesFor(roundSeconds));

	// ── Locks: a box the organiser sets stays as they set it ─────────────
	// Only the boxes they haven't touched are worked out. If what they set
	// can't work, the form says which boxes to change instead of changing them.
	type LockKey = ShapeKey | 'tiles';
	const SHAPE_KEYS: readonly LockKey[] = ['participants', 'stages', 'roomSize', 'advance'];
	let locked = $state<LockKey[]>([]);
	let shapeProblem = $state('');
	const lock = (key: LockKey) => {
		if (!locked.includes(key)) locked = [...locked, key];
	};
	/** Free a box again: it (and the others not set) are worked out afresh. */
	function unlock(key: LockKey) {
		locked = locked.filter((k) => k !== key);
		if (SHAPE_KEYS.includes(key)) solveShapeBoxes();
		else recalcTiming();
	}

	/** Fill the tournament boxes the organiser hasn't set. */
	function solveShapeBoxes() {
		const current = { participants: Number(heist.participants), stages: Number(heist.stages), roomSize: Number(heist.roomSize), advance: Number(heist.advance) };
		if (Object.values(current).some((v) => !Number.isInteger(v))) return;
		const out = solveShape(current, new Set(locked.filter((k): k is ShapeKey => k in current)));
		if (typeof out === 'string') {
			shapeProblem = out;
			return;
		}
		shapeProblem = '';
		Object.assign(heist, { participants: String(out.participants), stages: String(out.stages), roomSize: String(out.roomSize), advance: String(out.advance) });
	}
	function onShape(key: ShapeKey, value: string) {
		heist[key] = value;
		lock(key);
		solveShapeBoxes();
	}

	// ── Timing: round length and tiles are set; the pace is worked out ──
	// Tiles not set: the suggested bag for the room size and round length.
	function recalcTiming() {
		if (!locked.includes('tiles')) heist.tiles = String(suggestedTiles(fullRoom, roundSeconds));
	}
	function onTiles(value: string) {
		heist.tiles = value;
		lock('tiles');
	}
	// A different room size (or switching game ⇄ tournament) re-suggests the tiles unless they were set.
	let tilesSetFor = DEFAULT_RULES.roomSize;
	$effect(() => {
		const size = fullRoom;
		if (size === tilesSetFor || !(size >= ROOM_MIN)) return;
		tilesSetFor = size;
		untrack(recalcTiming);
	});

	// Each problem is shown next to the boxes it's about.
	const shapeError = $derived.by(() => {
		if (heistMode === 'tournament') {
			if (shapeProblem) return shapeProblem;
			if (!/^\d+$/.test(heist.participants.trim())) return 'Enter the number of participants.';
			if (Number(heist.participants) > MAX_PLAYERS) return `At most ${MAX_PLAYERS} participants.`;
		}
		return typeof heistPlan === 'string' ? heistPlan : '';
	});
	const timingError = $derived.by(() => {
		if (!Number.isInteger(tileCount) || tileCount < TILE_LIMITS[0] || tileCount > maxTiles)
			return `Tiles per room: ${TILE_LIMITS[0]}–${maxTiles} for a ${durationLabel(roundSeconds)} round${tileCount > maxTiles ? ' — use fewer tiles or a longer round' : ''}.`;
		if (heistPace < PACE_LIMITS[0])
			return `${tileCount} tiles in ${durationLabel(roundSeconds)} is a tile every ${heistPace.toFixed(1)} s — at most ${tilesFor(roundSeconds, PACE_LIMITS[0])} tiles fit (one every ${PACE_LIMITS[0]} s). Use fewer tiles or a longer round.`;
		if (heistPace > PACE_LIMITS[1])
			return `${tileCount} tiles in ${durationLabel(roundSeconds)} is a tile every ${heistPace.toFixed(1)} s — use at least ${tilesFor(roundSeconds, PACE_LIMITS[1])} tiles or a shorter round.`;
		return '';
	});
	const heistProblem = $derived(shapeError || timingError);
	/** What each room-size band gets, from the full room's band down. */
	const tileBands = $derived(
		Array.from({ length: tileBand(fullRoom) }, (_, i) => {
			const band = tileBand(fullRoom) - i;
			const low = band === 1 ? ROOM_MIN : TILE_BANDS[band - 2] + 1;
			const high = Math.min(TILE_BANDS[band - 1], fullRoom);
			const count = bandTiles(high, fullRoom, tileCount);
			return { label: low === high ? `${low}` : `${low}–${high}`, count, pace: tilePace(roundSeconds, count) };
		})
	);
	const range = (lo: number, hi: number) => Array.from({ length: hi - lo + 1 }, (_, i) => lo + i);
	let drawSeconds = $state<number>(80);
	let drawTurns = $state<number>(8);
	let drawPacks = $state<PackId[]>(['everyday', 'tech']);
	let customWords = $state('');
	let creating = $state(false);
	let createError = $state('');

	const wordCount = $derived(questionMode === 'random' ? QUESTIONS_PER_GAME : fixedQuestions.length);
	const customCount = $derived(parseCustomWords(customWords).length);
	const drawPool = $derived(buildPool(drawPacks, parseCustomWords(customWords)).length);
	const drawProblem = $derived(drawPool < 10 ? 'Pick a word pack, or add at least 10 words of your own.' : '');
	// Tech Word Rush needs a valid question set, Word Heist sensible rules, Scribble enough words.
	const blocked = $derived(
		startFor === 'word-heist' ? !!heistProblem : startFor === 'scribble' ? !!drawProblem : !isFlyGame(startFor) && !!questionProblem
	);

	function togglePack(id: PackId) {
		drawPacks = drawPacks.includes(id) ? drawPacks.filter((p) => p !== id) : [...drawPacks, id];
	}

	function openStart(id: string) {
		startFor = id;
		createError = '';
	}

	async function start() {
		if (blocked) {
			// Word Heist problems are already shown beside their boxes; Scribble's word packs need a message here.
			createError = startFor === 'word-heist' ? '' : startFor === 'scribble' ? drawProblem : questionProblem;
			return;
		}
		creating = true;
		createError = '';
		try {
			const token = await adminAuth.user?.getIdToken();
			if (!token) throw new Error('Your session expired. Sign in again.');
			if (startFor === 'word-heist') {
				const { code } = await createTournament(token, heistRules);
				await goto(presenterHref('word-heist', code));
			} else if (isFlyGame(startFor)) {
				const { code } = await createFlappySession(token, Number(flapDuration), startFor);
				await goto(presenterHref(startFor, code));
			} else if (startFor === 'scribble') {
				const { code } = await createScribbleSession(token, { drawSeconds, turns: drawTurns, packs: drawPacks, custom: customWords });
				await goto(presenterHref('scribble', code));
			} else {
				const { code } = await createSession(token, duration, questionMode === 'random' ? undefined : fixedQuestions);
				await goto(presenterHref('tech-word-rush', code));
			}
		} catch (err) {
			createError = (err as Error).message || 'Unable to create the game.';
			creating = false;
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
							{#if s.gameType === 'word-heist'}
								{s.round === 0 ? 'Registration' : s.final ? 'Final' : `Round ${s.round} · ${s.roomCount} rooms`}
							{:else if s.gameType === 'scribble'}
								{s.status === 'lobby' ? `${s.totalTurns} turns` : `Turn ${Math.max(1, s.drawCount)} / ${s.totalTurns}`}
							{:else if s.gameType !== 'tech-word-rush'}
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

<Modal
	open={startOpen}
	size={isFlyGame(startFor) || startFor === 'word-heist' || startFor === 'scribble' ? 'md' : 'lg'}
	title="Start {startFor ? gameName(startFor) : ''}"
	description="Opens a lobby with a QR code for players to join."
	onclose={() => !creating && (startFor = null)}
>
	{#if startFor === 'word-heist'}
		<div class="space-y-4">
			<Segmented
				label="What are you running?"
				bind:value={heistMode}
				options={[
					{ value: 'game', label: 'Create game' },
					{ value: 'tournament', label: 'Create tournament' }
				]}
			/>

			{#if heistMode === 'game'}
				<p class="text-[13px] text-muted-foreground">One room, one round, {ROOM_MIN}–{ROOM_MAX} players. The top three make the podium.</p>
				<SelectField label="Players (most)" bind:value={heist.gamePlayers} options={range(ROOM_MIN, ROOM_MAX).map(String)} />
				{#if shapeError}<p class="text-[13px] text-destructive" role="alert">{shapeError}</p>{/if}
			{:else}
				<p class="text-[13px] text-muted-foreground">
					A box you set is highlighted and stays as you set it (× to free it); the others are worked out to fit. If what you set can't work together, you'll be told which to change.
				</p>
				<div class="grid gap-3 sm:grid-cols-2">
					<Field
						label="Participants"
						type="number"
						inputmode="numeric"
						min="2"
						max={MAX_PLAYERS}
						bind:value={heist.participants}
						onchange={(e) => onShape('participants', e.currentTarget.value)}
						locked={locked.includes('participants')}
						onunlock={() => unlock('participants')}
					/>
					<SelectField label="Stages" bind:value={heist.stages} options={range(2, MAX_STAGES).map(String)} onchange={(v) => onShape('stages', v)} locked={locked.includes('stages')} onunlock={() => unlock('stages')} />
					<SelectField label="Players per room (most)" bind:value={heist.roomSize} options={range(ROOM_MIN, ROOM_MAX).map(String)} onchange={(v) => onShape('roomSize', v)} locked={locked.includes('roomSize')} onunlock={() => unlock('roomSize')} />
					<SelectField label="Go through per room" bind:value={heist.advance} options={range(1, Number(heist.roomSize) - 1).map(String)} onchange={(v) => onShape('advance', v)} locked={locked.includes('advance')} onunlock={() => unlock('advance')} />
				</div>
				{#if shapeError}
					<p class="text-[13px] text-destructive" role="alert">{shapeError}</p>
				{:else}
				<p class="text-[13px] text-muted-foreground">
					{#if heistMax}
						Up to <button type="button" class="font-semibold text-foreground underline-offset-4 hover:underline tabular" onclick={() => onShape('participants', String(heistMax))}>{heistMax} participants</button> for
						{heist.stages} stages, rooms of up to {heist.roomSize}, {heist.advance} going through from each room.
					{:else}
						{heist.stages} stages can't work with {heist.advance} going through from each room — send fewer through.
					{/if}
				</p>
				{/if}
			{/if}

			{#if typeof heistPlan !== 'string'}
				<ol class="space-y-1 rounded-md bg-muted px-3 py-2 text-[13px] text-muted-foreground" aria-label="Stages">
					{#each heistPlan as st (st.stage)}
						<li>
							<span class="font-semibold text-foreground">{st.final ? (heistMode === 'game' ? 'Game' : 'Final') : `Stage ${st.stage}`}:</span>
							<span class="tabular">{st.players} players · {describeSizes(st.sizes)}</span>{st.final ? ' · top 3 on the podium' : ` · top ${st.advance} from each room go through`}
						</li>
					{/each}
				</ol>
			{/if}

			<div class="grid gap-3 sm:grid-cols-3">
				<SelectField
					label="Round length"
					bind:value={heist.roundSeconds}
					options={ROUND_SECONDS.map((s) => ({ value: String(s), label: durationLabel(s) }))}
					onchange={(v) => ((heist.roundSeconds = v), recalcTiming())}
				/>
				<Field
					label="Tiles per room"
					type="number"
					inputmode="numeric"
					min={TILE_LIMITS[0]}
					max={maxTiles}
					hint="For a full room of {fullRoom} · up to {maxTiles}"
					bind:value={heist.tiles}
					onchange={(e) => onTiles(e.currentTarget.value)}
					locked={locked.includes('tiles')}
					onunlock={() => unlock('tiles')}
				/>
				<div class="flex flex-col gap-1.5">
					<span class="text-[13px] font-medium text-foreground">New tile every</span>
					<output class="flex h-9 items-center rounded-md border border-dashed border-input bg-muted/60 px-3 text-sm text-foreground tabular" aria-live="polite">
						{Number.isFinite(heistPace) && heistPace > 0 ? `${heistPace.toFixed(1)} s` : '—'}
					</output>
					<span class="text-[13px] text-muted-foreground">Worked out from the two boxes</span>
				</div>
			</div>
			{#if timingError}
				<p class="text-[13px] text-destructive" role="alert">{timingError}</p>
			{:else}
				<p class="text-[13px] text-muted-foreground">
					Tiles drop for <span class="font-medium text-foreground">{durationLabel(roundSeconds)}</span>, then a {finalSeconds} s final countdown —
					<span class="font-medium text-foreground tabular">{formatClock((roundSeconds + finalSeconds) * 1000)}</span> a round in all.
					{#each tileBands as b, i (b.label)}{i ? ' · ' : 'Rooms of '}<span class="font-medium text-foreground tabular">{b.label}</span>:
						<span class="tabular">{b.count} tiles ({b.pace.toFixed(1)} s)</span>{/each}.
				</p>
			{/if}
			<div class="grid gap-3 sm:grid-cols-2">
				<SelectField
					label="Final countdown"
					bind:value={heist.finalSeconds}
					options={FINAL_OPTIONS.map((s) => ({ value: String(s), label: s ? `${s} seconds, no new tiles` : 'None — end with the last tile' }))}
				/>
				<SelectField label="Shortest word" bind:value={heist.minWordLength} options={range(...RULE_LIMITS.minWordLength).map(String)} />
			</div>
			<ul class="space-y-1.5 text-[13px] text-muted-foreground">
				<li>• Everyone scans one QR code and starts on 0. Letter tiles drop into a row shared by the room; words can only be made from those tiles.</li>
				<li>• Steal any word by adding at least one tile to it (just adding S to the end doesn't count). Score = letters in the words you hold.</li>
				<li>• Banned words are managed on the Word moderation page.</li>
			</ul>
			{#if createError}<p class="text-[13px] text-destructive" role="alert">{createError}</p>{/if}
			{#if createError}<p class="text-[13px] text-destructive" role="alert">{createError}</p>{/if}
		</div>
	{:else if isFlyGame(startFor)}
		<div class="space-y-4">
			<SelectField label="Game length" bind:value={flapDuration} options={FLAP_DURATIONS.map((d) => ({ value: String(d), label: durationLabel(d) }))} />
			<ul class="space-y-1.5 text-[13px] text-muted-foreground">
				<li>• Players can practise in the lobby while they wait.</li>
				<li>• Once you start, they fly as many times as they like until time runs out.</li>
				<li>• Only each player’s <span class="font-medium text-foreground">best</span> flight counts — a worse one never lowers their score.</li>
				<li>• The final leaderboard appears when the timer ends.</li>
			</ul>
			{#if createError}<p class="text-[13px] text-destructive" role="alert">{createError}</p>{/if}
		</div>
	{:else if startFor === 'scribble'}
		<div class="space-y-5">
			<Segmented label="Time to draw" bind:value={drawSeconds} options={DRAW_SECONDS.map((s) => ({ value: s, label: `${s} sec` }))} />
			<Segmented label="Turns" bind:value={drawTurns} options={TURN_COUNTS.map((n) => ({ value: n, label: String(n) }))} />
			<fieldset>
				<legend class="text-[13px] font-medium text-foreground">Word packs</legend>
				<div class="mt-1.5 grid gap-2 sm:grid-cols-3">
					{#each PACKS as pack (pack.id)}
						{@const on = drawPacks.includes(pack.id)}
						<label class="flex cursor-pointer items-start gap-2 rounded-md border px-3 py-2 transition-colors {on ? 'border-ring bg-accent' : 'border-border hover:bg-muted'}">
							<input type="checkbox" class="mt-0.5 accent-[var(--color-primary)]" checked={on} onchange={() => togglePack(pack.id)} />
							<span>
								<span class="block text-sm font-medium">{pack.name}</span>
								<span class="block text-xs text-muted-foreground">{pack.description}</span>
							</span>
						</label>
					{/each}
				</div>
			</fieldset>
			<div>
				<label for="custom-words" class="text-[13px] font-medium text-foreground">Your own words <span class="font-normal text-muted-foreground">(optional)</span></label>
				<textarea
					id="custom-words"
					bind:value={customWords}
					rows="3"
					placeholder="symba, hackathon trophy, pitch deck…"
					class="mt-1.5 w-full rounded-md border border-input bg-card px-3 py-2 text-sm outline-none focus:border-ring focus:ring-4 focus:ring-ring/20"
				></textarea>
				<p class="mt-1 text-xs text-muted-foreground">Separate with commas or new lines. {customCount ? `${customCount} added.` : ''}</p>
			</div>
			<p class="rounded-md bg-muted px-3 py-2 text-[13px] text-muted-foreground">
				<span class="font-semibold text-foreground tabular">{drawPool}</span> words ·
				<span class="font-semibold text-foreground tabular">~{Math.ceil((drawTurns * (drawSeconds + 25)) / 60)} min</span> · needs 2+ players
			</p>
			{#if createError || drawProblem}<p class="text-[13px] text-destructive" role="alert">{createError || drawProblem}</p>{/if}
		</div>
	{:else}
		<div class="space-y-5">
			<Segmented
				label="Time per word"
				bind:value={duration}
				options={[10, 15, 20, 25].map((s) => ({ value: s, label: `${s} sec` }))}
			/>
			<QuestionSetPicker bind:mode={questionMode} bind:questions={fixedQuestions} bind:problem={questionProblem} />
			<p class="rounded-md bg-muted px-3 py-2 text-[13px] text-muted-foreground">
				<span class="font-semibold text-foreground tabular">{wordCount}</span> words ·
				<span class="font-semibold text-foreground tabular">~{Math.ceil((wordCount * duration) / 60)} min</span> answer time · up to
				<span class="font-semibold text-foreground tabular">100 XP</span> per word
			</p>
			{#if createError}<p class="text-[13px] text-destructive" role="alert">{createError}</p>{/if}
		</div>
	{/if}
	{#snippet footer()}
		<Button variant="ghost" onclick={() => (startFor = null)} disabled={creating}>Cancel</Button>
		<Button onclick={start} loading={creating} disabled={blocked}>
			{creating ? 'Creating…' : startFor === 'word-heist' ? (heistMode === 'game' ? 'Create game' : 'Create tournament') : 'Create lobby'}
		</Button>
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
