<script lang="ts">
	import { page } from '$app/state';
	import type { Component } from 'svelte';
	import {
		Power,
		RotateCcw,
		ShieldAlert,
		SearchX,
		Flag,
		Play,
		ChevronLeft,
		ChevronRight,
		Timer,
		Hand,
		Sparkles,
		Trophy,
		Eye,
		EyeOff,
		CircleAlert
	} from '@lucide/svelte';
	import { HostRoom } from '$lib/live/host.svelte';
	import { hasAnswer, SLIDE_META } from '$lib/live/slides';
	import { DUR, rise, sink, softFade, warpIn, warpOut } from '$lib/live/motion';
	import { SLIDE_ACCENT } from '$lib/components/live/slide-icons';
	import Logo from '$lib/components/site/Logo.svelte';
	import AnimatedGrid from '$lib/components/motion/AnimatedGrid.svelte';
	import GlowBackground from '$lib/components/motion/GlowBackground.svelte';
	import NoiseOverlay from '$lib/components/motion/NoiseOverlay.svelte';
	import Button from '$lib/components/ui/Button.svelte';
	import Modal from '$lib/components/ui/Modal.svelte';
	import PresenterBar from '$lib/components/live/PresenterBar.svelte';
	import PresenterLobby from '$lib/components/live/PresenterLobby.svelte';
	import PresenterSlide from '$lib/components/live/PresenterSlide.svelte';
	import PresenterLeaderboard from '$lib/components/live/PresenterLeaderboard.svelte';
	import JoinChip from '$lib/components/live/JoinChip.svelte';
	import ReconnectBanner from '$lib/components/live/ReconnectBanner.svelte';

	const sessionId = page.params.id!;
	const room = new HostRoom(sessionId);
	$effect(() => room.socket.start());

	let bar = $state<PresenterBar>();
	let confirmEnd = $state(false);
	let confirmReset = $state(false);

	const session = $derived(room.session);
	const live = $derived(room.live);
	const slide = $derived(room.slide);
	const run = $derived(room.run);
	const isLast = $derived(!!live && !!session && live.index >= session.slides.length - 1);
	const joinUrl = $derived(session?.joinCode ? `${page.url.origin}/play/${session.joinCode}` : '');
	const joinHost = $derived(page.url.host);
	const fatal = $derived(room.error);
	/** Slides whose title card has played (see PresenterSlide). */
	const introduced = new Set<string>();
	const accent = $derived(live?.view === 'slide' && slide ? SLIDE_ACCENT[slide.kind] : 'var(--color-brand)');

	// ---- Actions ---------------------------------------------------------------

	const next = () => live && !isLast && room.act({ t: 'change_slide', index: live.index + 1 });
	const prev = () => live && live.index > 0 && room.act({ t: 'change_slide', index: live.index - 1 });
	const reveal = () => run && slide && !run.revealed && room.act({ t: 'reveal_answer' });
	const toggleLeaderboard = () => live && room.act({ t: 'show_leaderboard', show: live.view !== 'leaderboard' });
	const toggleResults = () => run && room.act({ t: 'toggle_results', show: !run.showResults });

	interface Primary {
		label: string;
		icon: Component<{ class?: string }>;
		run: () => void;
	}

	/** The one obvious next step, bound to Space. */
	const primary = $derived.by((): Primary | null => {
		if (!session) return null;
		if (session.status === 'lobby') return { label: 'Start session', icon: Play, run: () => room.act({ t: 'start_session' }) };
		if (!live || !slide || !run) return null;
		const scored = SLIDE_META[slide.kind].scored;
		if (live.view === 'leaderboard') return isLast ? null : { label: 'Next slide', icon: ChevronRight, run: next };
		if (run.phase === 'ready') return { label: 'Start timer', icon: Timer, run: () => room.act({ t: 'start_timer' }) };
		if (run.phase === 'open') return { label: slide.timeLimit > 0 ? 'Close responses' : 'Close voting', icon: Hand, run: () => room.act({ t: 'close_responses' }) };
		if (hasAnswer(slide) && !run.revealed) return { label: 'Reveal answer', icon: Sparkles, run: reveal };
		if (scored && run.revealed) return { label: 'Show leaderboard', icon: Trophy, run: toggleLeaderboard };
		if (!run.showResults) return { label: 'Show results', icon: Eye, run: toggleResults };
		return isLast ? { label: 'Show leaderboard', icon: Trophy, run: toggleLeaderboard } : { label: 'Next slide', icon: ChevronRight, run: next };
	});

	function onkeydown(e: KeyboardEvent) {
		if (confirmEnd || confirmReset || e.metaKey || e.ctrlKey || e.altKey) return;
		const t = e.target as HTMLElement;
		if (t instanceof HTMLInputElement || t instanceof HTMLTextAreaElement) return;
		// Let a focused button handle its own Space/Enter
		if ((e.key === ' ' || e.key === 'Enter') && t.closest('button, a')) return;
		const key = e.key.toLowerCase();
		const handled = (fn: () => unknown) => (e.preventDefault(), fn());
		if (key === 'f') return handled(() => bar?.toggleFullscreen());
		if (key === ' ' || key === 'enter') return handled(() => primary?.run());
		if (!live) return;
		if (key === 'arrowright' || key === 'pagedown' || key === 'n') return handled(next);
		if (key === 'arrowleft' || key === 'pageup' || key === 'p') return handled(prev);
		if (key === 'r') return handled(reveal);
		if (key === 'l') return handled(toggleLeaderboard);
		if (key === 'h') return handled(toggleResults);
	}

	// Refused actions (e.g. "Slide 3 isn't finished") as a short toast
	let toast = $state<string | null>(null);
	$effect(() => {
		const n = room.notice;
		if (!n) return;
		toast = n.message;
		const t = setTimeout(() => (toast = null), 4000);
		return () => clearTimeout(t);
	});

	const view = $derived(
		!session ? 'connecting' : session.status === 'ended' ? 'ended' : live ? `${live.view}:${slide?.id}` : session.joinCode ? 'lobby' : 'connecting'
	);

	const iconBtn =
		'grid size-10 place-items-center rounded-md text-cream/70 transition-colors duration-150 hover:bg-white/5 hover:text-cream disabled:pointer-events-none disabled:opacity-30';
</script>

<svelte:head><title>{session?.title ?? 'Presenter'} — ZenCode Live</title></svelte:head>
<svelte:window {onkeydown} />

<div class="fixed inset-0 overflow-hidden bg-stage font-sans text-cream">
	<AnimatedGrid size={72} animated={!live} />
	<GlowBackground class="opacity-50" />
	<!-- Ambient glow tinted by the current slide kind -->
	<div
		aria-hidden="true"
		class="pointer-events-none absolute -bottom-1/3 left-1/2 h-[80%] w-[110%] -translate-x-1/2 rounded-full opacity-35 blur-3xl transition-[background] duration-[1600ms]"
		style:background="radial-gradient(closest-side, color-mix(in srgb, {accent} 45%, transparent), transparent)"
	></div>
	<NoiseOverlay opacity={0.05} />
	<!-- A band of light crosses the stage on every scene change -->
	{#key view}
		<div aria-hidden="true" class="pointer-events-none absolute inset-0 z-10 overflow-hidden motion-reduce:hidden">
			<div class="stage-sweep absolute inset-y-0 -left-1/4 w-1/3" style:background="linear-gradient(90deg, transparent, color-mix(in srgb, {accent} 16%, transparent), transparent)"></div>
		</div>
	{/key}

	<ReconnectBanner status={room.socket.status} tone="stage" />

	<main class="relative mx-auto flex h-full max-w-[min(100%,177.78vh)] flex-col px-[5vw] pt-[4vh] pb-[11vh]">
		<header class="flex min-h-[clamp(3rem,7vh,5rem)] items-center justify-between gap-6">
			<Logo />
			{#if live && session?.joinCode}
				<div in:rise={{ y: -8, duration: DUR.stage }}><JoinChip code={session.joinCode} {joinUrl} {joinHost} /></div>
			{:else if session}
				<p class="truncate text-stage-sm text-cream/60" in:softFade>{session.title}</p>
			{/if}
		</header>

		<!-- Stack: outgoing and incoming views share one cell, so nothing shifts -->
		<div class="relative mt-[4vh] grid min-h-0 flex-1 [grid-template-areas:'stack'] *:[grid-area:stack] *:min-h-0">
			{#key view}
				<div class="h-full" in:warpIn={{ duration: 1000, delay: 260 }} out:warpOut={{ duration: 420 }}>
					{#if fatal}
						<div class="grid h-full place-items-center text-center">
							<div>
								<div class="mx-auto grid size-14 place-items-center rounded-lg bg-stage-raised ring-1 ring-stage-line">
									{#if fatal.code === 'unauthorized'}<ShieldAlert class="size-6 text-sun" />{:else}<SearchX class="size-6 text-sun" />{/if}
								</div>
								<p class="mt-5 text-stage-md font-semibold">{fatal.code === 'unauthorized' ? 'Organiser access required' : 'Session not found'}</p>
								<p class="mt-2 text-stage-sm text-cream/60">{fatal.message}</p>
								<Button href="/admin/live" variant="stage" size="lg" class="mt-8">Back to live sessions</Button>
							</div>
						</div>
					{:else if view === 'connecting'}
						<div class="grid h-full grid-rows-[1fr_auto] gap-[4vh]" aria-busy="true" aria-label="Connecting to the room">
							<div class="grid items-center gap-[4vw] lg:grid-cols-[1fr_auto]">
								<div class="space-y-[2vh]">
									<div class="h-4 w-48 animate-pulse rounded-md bg-stage-raised"></div>
									<div class="h-[5vh] w-3/5 animate-pulse rounded-md bg-stage-raised"></div>
									<div class="h-[14vh] w-4/5 animate-pulse rounded-md bg-stage-raised"></div>
								</div>
								<div class="hidden size-[min(26vw,40vh)] animate-pulse rounded-lg bg-stage-raised lg:block"></div>
							</div>
							<div class="h-[24vh] animate-pulse rounded-lg bg-stage-raised/60"></div>
						</div>
					{:else if view === 'ended'}
						<div class="grid h-full place-items-center text-center">
							<div>
								<div class="mx-auto grid size-16 place-items-center rounded-lg bg-stage-raised ring-1 ring-stage-line"><Flag class="size-7 text-sun" /></div>
								<p class="mt-6 font-display text-stage-lg font-semibold">That’s a wrap</p>
								<p class="mt-2 text-stage-sm text-cream/60">This session has ended and its join code no longer works.</p>
								<div class="mt-10 flex justify-center gap-3">
									<Button variant="sun" size="lg" onclick={room.reopen}><RotateCcw class="size-4" /> Run again</Button>
									<Button href="/admin/live/{sessionId}" variant="stage" size="lg">Back to builder</Button>
								</div>
								<p class="mt-4 text-[13px] text-cream/40">Running again opens a fresh lobby with a new code and clears players and results.</p>
							</div>
						</div>
					{:else if view === 'lobby' && session?.joinCode}
						<PresenterLobby code={session.joinCode} {joinUrl} {joinHost} participants={room.participants} />
					{:else if live?.view === 'leaderboard'}
						<PresenterLeaderboard entries={room.leaderboard} final={isLast && !!run?.revealed} />
					{:else if slide && run}
						<PresenterSlide {room} {introduced} />
					{/if}
				</div>
			{/key}
		</div>
	</main>

	<!-- Refused-action toast -->
	<div class="pointer-events-none fixed inset-x-0 top-16 z-50 flex justify-center" aria-live="polite">
		{#if toast}
			<p class="flex items-center gap-2 rounded-md bg-stage-raised px-4 py-2.5 text-sm text-cream shadow-lg ring-1 ring-stage-line" in:rise={{ y: -10, duration: DUR.base }} out:sink>
				<CircleAlert class="size-4 text-sun" /> {toast}
			</p>
		{/if}
	</div>

	{#if session && !fatal}
		<PresenterBar bind:this={bar} backHref="/admin/live/{sessionId}" title={session.title}>
			{#snippet center()}
				{#if live}
					<button type="button" class={iconBtn} onclick={prev} disabled={live.index === 0} aria-label="Previous slide (←)" title="Previous slide (←)">
						<ChevronLeft class="size-5" />
					</button>
				{/if}
				{#if primary}
					{@const Icon = primary.icon}
					<button
						type="button"
						onclick={primary.run}
						class="inline-flex h-10 min-w-44 items-center justify-center gap-2 rounded-md bg-sun px-4 text-sm font-semibold text-forest-950 transition-[background-color,transform] duration-150 hover:bg-sun-light active:translate-y-px"
						title="{primary.label} (Space)"
					>
						<Icon class="size-4" />
						{primary.label}
						<kbd class="ml-1 rounded bg-forest-950/10 px-1.5 font-mono text-[11px]">Space</kbd>
					</button>
				{:else if !live}
					<span class="text-[13px] text-cream/60 tabular">{room.connectedCount} connected</span>
				{/if}
				{#if live}
					<button type="button" class={iconBtn} onclick={next} disabled={isLast} aria-label="Next slide (→)" title="Next slide (→)">
						<ChevronRight class="size-5" />
					</button>
				{/if}
			{/snippet}
			{#snippet actions()}
				{#if live && run}
					<button type="button" class={iconBtn} onclick={toggleResults} aria-pressed={run.showResults} aria-label={run.showResults ? 'Hide results (H)' : 'Show results (H)'} title={run.showResults ? 'Hide results (H)' : 'Show results (H)'}>
						{#if run.showResults}<EyeOff class="size-4" />{:else}<Eye class="size-4" />{/if}
					</button>
					<button type="button" class={iconBtn} onclick={() => (confirmReset = true)} aria-label="Reset this slide" title="Reset this slide">
						<RotateCcw class="size-4" />
					</button>
					<button type="button" class={iconBtn} onclick={toggleLeaderboard} aria-pressed={live.view === 'leaderboard'} aria-label="Leaderboard (L)" title="Leaderboard (L)">
						<Trophy class="size-4" />
					</button>
				{/if}
				{#if session.status === 'lobby' || session.status === 'live'}
					<button type="button" class={iconBtn} onclick={() => (confirmEnd = true)} aria-label="End session" title="End session">
						<Power class="size-4" />
					</button>
				{/if}
			{/snippet}
		</PresenterBar>
	{/if}
</div>

<Modal open={confirmEnd} title="End this session?" description="Phones are disconnected and the join code stops working." onclose={() => (confirmEnd = false)}>
	<p class="text-sm text-foreground">You can run it again later with a fresh code.</p>
	{#snippet footer()}
		<Button variant="outline" onclick={() => (confirmEnd = false)}>Keep running</Button>
		<Button variant="destructive" onclick={() => (room.endSession(), (confirmEnd = false))}><Power class="size-4" /> End session</Button>
	{/snippet}
</Modal>

<Modal open={confirmReset} title="Reset this slide?" description="Its answers are cleared and any points it gave are taken back." onclose={() => (confirmReset = false)}>
	<p class="text-sm text-foreground">Use this to run the question again.</p>
	{#snippet footer()}
		<Button variant="outline" onclick={() => (confirmReset = false)}>Cancel</Button>
		<Button variant="destructive" onclick={() => (room.act({ t: 'reset_slide' }), (confirmReset = false))}><RotateCcw class="size-4" /> Reset slide</Button>
	{/snippet}
</Modal>
