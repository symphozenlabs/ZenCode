<script lang="ts">
	import { untrack, type Snippet } from 'svelte';
	import { fade, scale } from 'svelte/transition';
	import { backOut } from 'svelte/easing';
	import { STEP, WORLD_H, autopilot, createWorld, flap, step, type GameEvent, type Phase, type World } from '$lib/games/flappy/engine';
	import { createRenderer, type Particle } from '$lib/games/flappy/render';
	import { createCityRenderer } from '$lib/games/flappy/render-city';
	import { play as playSound, playSample, preloadSample, unlockAudio, type Sound } from '$lib/games/flappy/audio';
	import { SKINS, type FlyGame } from '$lib/games/flappy/skins';
	import { serverNow } from '$lib/games/tech-word-rush/api';

	/**
	 * The playable game (or, in `demo` mode, a self-flying attract loop for the
	 * big screen). Simulation runs at a fixed 120 Hz and the drawing
	 * interpolates between steps, so motion is smooth on any refresh rate.
	 *
	 * Taps are read on pointerdown (not click) for the lowest latency.
	 */
	interface Props {
		/** Which game's look: Flappy Bird or Soar & Roar. */
		skin?: FlyGame;
		mode?: 'play' | 'demo';
		/** False blocks starting a new flight (e.g. time is up). */
		canPlay?: boolean;
		/** Server time (ms) when the current flight is cut off. */
		deadline?: number | null;
		/** Shown on the get-ready screen. */
		hint?: string;
		phase?: Phase;
		score?: number;
		onstart?: () => void;
		onend?: (score: number, reason: 'crash' | 'time') => void;
		/** Rendered over the game once a flight is over. */
		overlay?: Snippet;
		class?: string;
	}
	let {
		skin = 'flappy',
		mode = 'play',
		canPlay = true,
		deadline = null,
		hint = 'Tap, click or press Space to flap',
		phase = $bindable('ready'),
		score = $bindable(0),
		onstart,
		onend,
		overlay,
		class: cls = ''
	}: Props = $props();

	let host = $state<HTMLDivElement>();
	let canvas = $state<HTMLCanvasElement>();
	let paused = $state(false);
	let timeUp = $state(false);

	// Fixed for the component's life: the parent re-keys it to switch games.
	const look = untrack(() => SKINS[skin]);
	const newWorld = () => createWorld(undefined, look.radius);
	if (look.milestoneSound) preloadSample(look.milestoneSound);
	if (look.crashSound) preloadSample(look.crashSound);
	if (look.crashSticker && typeof Image !== 'undefined') new Image().src = look.crashSticker;
	// The self-flying demo behind the lobby stays silent.
	const sfx = (s: Sound) => mode === 'play' && playSound(s);
	const clip = (url: string) => mode === 'play' && playSample(url);

	/** The comic "FAAH!" sticker, popped where the crash happened (CSS px). */
	let sticker = $state<{ id: number; x: number; y: number } | null>(null);
	let stickerTimer: ReturnType<typeof setTimeout> | undefined;
	function popSticker() {
		if (!look.crashSticker || !renderer || !host) return;
		const s = host.clientHeight / WORLD_H;
		const w = host.clientWidth;
		const half = Math.min(w * 0.36, 170);
		// Above and ahead of the mascot, so its crash pose stays in view.
		const x = Math.max(half + 8, Math.min(w - half - 8, renderer.birdX * s + 70));
		const y = Math.max(110, Math.min(host.clientHeight - 200, world.y * s - 110));
		sticker = { id: performance.now(), x, y };
		clearTimeout(stickerTimer);
		stickerTimer = setTimeout(() => (sticker = null), 1700);
	}

	let world: World = newWorld();
	const prev = { y: world.y, rot: world.rot, distance: 0, scroll: 0 };
	let particles: Particle[] = [];
	let shake = 0;
	let flash = 0;
	let slowUntil = 0;
	let wingPhase = 0;
	let theme = 0;
	let restartAt = 0;
	const reduced = typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches;

	function syncPrev() {
		prev.y = world.y;
		prev.rot = world.rot;
		prev.distance = world.distance;
		prev.scroll = world.scroll;
	}

	/** Back to the get-ready screen with a fresh course. */
	export function reset() {
		world = newWorld();
		syncPrev();
		particles = [];
		shake = flash = 0;
		paused = false;
		timeUp = false;
		sticker = null;
		phase = 'ready';
		score = 0;
	}

	function burst(kind: Particle['kind'], n: number, x: number, y: number, opts: Partial<Particle> & { spread?: number; speed?: number; colors?: string[] } = {}) {
		const { spread = Math.PI * 2, speed = 160, colors = ['#ffd34e'] } = opts;
		for (let i = 0; i < n; i++) {
			const a = -Math.PI / 2 + (Math.random() - 0.5) * spread;
			const v = speed * (0.4 + Math.random() * 0.8);
			const ttl = (opts.ttl ?? 0.8) * (0.6 + Math.random() * 0.6);
			particles.push({
				kind,
				x,
				y,
				vx: Math.cos(a) * v + (opts.vx ?? 0),
				vy: Math.sin(a) * v + (opts.vy ?? 0),
				life: ttl,
				ttl,
				size: (opts.size ?? 4) * (0.7 + Math.random() * 0.6),
				rot: Math.random() * Math.PI * 2,
				vr: (Math.random() - 0.5) * 10,
				color: colors[i % colors.length]
			});
		}
	}

	function input() {
		unlockAudio();
		if (mode === 'demo') return;
		if (paused) {
			paused = false;
			flap(world);
			sfx('flap');
			return;
		}
		if (world.phase === 'ready') {
			if (!canPlay) return;
			flap(world);
			phase = 'playing';
			sfx('flap');
			onstart?.();
			return;
		}
		if (flap(world)) {
			sfx('flap');
			if (reduced) return;
			if (look.id === 'symba')
				burst('spark', 5, renderer!.birdX - 30, world.y + 4, { speed: 120, size: 3.5, ttl: 0.4, spread: Math.PI * 0.6, vx: -world.speed - 80, vy: 90, colors: ['#ffd36b', '#ff8a2b', '#fff3c4'] });
			else burst('puff', 2, renderer!.birdX - 14, world.y + 6, { speed: 40, size: 3, ttl: 0.35, vx: -world.speed * 0.5 });
		}
	}

	function onEvents(events: GameEvent[]) {
		const bx = renderer!.birdX;
		for (const e of events) {
			if (e === 'score') {
				score = world.score;
				const milestone = world.score % 10 === 0;
				// Symba roars (the Singam tone) at every 10 points.
				if (!(milestone && look.milestoneSound && clip(look.milestoneSound))) sfx(milestone ? 'milestone' : 'score');
				if (!reduced) burst('spark', milestone ? 18 : 6, bx, world.y, { speed: milestone ? 260 : 150, size: milestone ? 6 : 4.5, ttl: 0.7, colors: ['#fff3b0', '#ffd34e', '#ffffff'] });
			} else if (e === 'hit') {
				// Symba: "FAAH!" — the clip plus a comic sticker. Others: a thud.
				if (look.crashSound) {
					if (!clip(look.crashSound)) sfx('hit');
				} else sfx('hit');
				popSticker();
				if (mode === 'play') navigator.vibrate?.(45);
				if (!reduced) {
					shake = 1;
					flash = 1;
					slowUntil = performance.now() + 380;
					if (look.id === 'symba') {
						burst('spark', 16, bx - 20, world.y, { speed: 240, size: 5, ttl: 0.8, colors: ['#ffb02e', '#ff6a1a', '#ffe08a'] });
						burst('dust', 10, bx - 24, world.y - 6, { speed: 60, size: 7, ttl: 1.2, vy: -40 });
					} else burst('feather', 14, bx, world.y, { speed: 210, size: 6, ttl: 1.6, colors: ['#ffd34e', '#f5a623', '#fff1c1', '#e48a24'] });
				}
				if (world.phase === 'dying' && !look.crashSound) sfx('fall');
			} else if (e === 'ground') {
				if (!reduced) {
					shake = Math.max(shake, 0.45);
					burst('dust', 8, bx, world.y + 12, { speed: 90, size: 5, ttl: 0.6, spread: Math.PI * 0.9 });
				}
			}
		}
		if (world.phase === 'over' && phase !== 'over') finish('crash');
	}

	function finish(reason: 'crash' | 'time') {
		phase = 'over';
		score = world.score;
		if (mode === 'demo') {
			restartAt = performance.now() + 1400;
			return;
		}
		onend?.(world.score, reason);
	}

	let renderer: ReturnType<typeof createRenderer> | null = null;

	$effect(() => {
		if (!canvas || !host) return;
		const r = look.id === 'symba' ? createCityRenderer(canvas) : createRenderer(canvas);
		renderer = r;
		const fit = () => r.resize(host!.clientWidth, host!.clientHeight, window.devicePixelRatio);
		fit();
		const ro = new ResizeObserver(fit);
		ro.observe(host);
		if (mode === 'demo') {
			theme = 0.4;
			flap(world);
		}

		let raf = 0;
		let last = performance.now();
		let acc = 0;
		let clock = 0;
		const events: GameEvent[] = [];

		const frame = (now: number) => {
			raf = requestAnimationFrame(frame);
			let dt = Math.min(0.05, (now - last) / 1000);
			last = now;
			clock += dt;
			if (now < slowUntil) dt *= 0.3;

			// Cut the flight off exactly when the shared timer runs out.
			if (mode === 'play' && deadline && world.phase === 'playing' && serverNow() >= deadline) {
				world.phase = 'over';
				timeUp = true;
				finish('time');
			}

			if (mode === 'demo' && world.phase === 'over' && now >= restartAt) {
				world = newWorld();
				flap(world);
				syncPrev();
			}

			if (!paused) {
				acc += dt;
				events.length = 0;
				while (acc >= STEP) {
					syncPrev();
					if (mode === 'demo') autopilot(world);
					step(world, STEP, events);
					acc -= STEP;
				}
				if (events.length) onEvents(events);
			}
			const a = paused ? 1 : acc / STEP;

			// Wings beat faster right after a flap.
			const sinceFlap = world.time - world.flapAt;
			if (world.phase === 'playing' || world.phase === 'ready') wingPhase += dt * (sinceFlap < 0.22 ? 30 : world.phase === 'ready' ? 11 : 15);
			const wing = world.phase === 'dying' || world.phase === 'over' ? 0.5 : Math.sin(wingPhase) * 0.6;
			const squash = world.phase === 'playing' ? Math.max(0, 1 - sinceFlap / 0.14) : 0;

			for (const p of particles) {
				p.life -= dt;
				p.x += p.vx * dt;
				p.y += p.vy * dt;
				p.rot += p.vr * dt;
				if (p.kind === 'feather') {
					p.vx *= 1 - dt * 1.8;
					p.vy = p.vy * (1 - dt * 2.2) + 120 * dt;
					p.x += Math.sin(p.life * 6) * 0.6;
				} else if (p.kind === 'spark') p.vy += 260 * dt;
				else p.vy -= 20 * dt;
			}
			if (particles.length) particles = particles.filter((p) => p.life > 0);
			shake = Math.max(0, shake - dt * 3.2);
			flash = Math.max(0, flash - dt * 4);

			// Sky shifts toward night as the score climbs (the demo cycles slowly).
			const target = mode === 'demo' ? 1.5 + Math.sin(clock / 18) * 1.5 : Math.min(3, world.score / 10);
			theme += (target - theme) * Math.min(1, dt * 0.9);

			const lerp = (x: number, y: number) => x + (y - x) * a;
			r.draw({
				world,
				y: lerp(prev.y, world.y),
				rot: lerp(prev.rot, world.rot),
				distance: lerp(prev.distance, world.distance),
				scroll: lerp(prev.scroll, world.scroll),
				clock,
				theme,
				wing,
				squash,
				particles,
				shake,
				flash
			});
		};
		raf = requestAnimationFrame(frame);

		const onKey = (e: KeyboardEvent) => {
			if (mode === 'demo' || e.repeat) return;
			const el = e.target as HTMLElement | null;
			if (el && (el.isContentEditable || /^(INPUT|TEXTAREA|SELECT|BUTTON|A)$/.test(el.tagName))) return;
			if (e.code === 'Space' || e.code === 'ArrowUp' || e.code === 'KeyW') {
				e.preventDefault();
				input();
			}
		};
		const onVisibility = () => {
			if (document.hidden && world.phase === 'playing') paused = true;
			last = performance.now();
		};
		window.addEventListener('keydown', onKey);
		document.addEventListener('visibilitychange', onVisibility);
		return () => {
			cancelAnimationFrame(raf);
			ro.disconnect();
			window.removeEventListener('keydown', onKey);
			document.removeEventListener('visibilitychange', onVisibility);
			renderer = null;
		};
	});

	function onpointerdown(e: PointerEvent) {
		if (e.pointerType === 'mouse' && e.button !== 0) return;
		e.preventDefault();
		input();
	}
</script>

<div
	bind:this={host}
	class="relative isolate size-full touch-none overflow-hidden select-none [-webkit-tap-highlight-color:transparent] {cls}"
	{onpointerdown}
	oncontextmenu={(e) => e.preventDefault()}
	role={mode === 'play' ? 'application' : 'img'}
	aria-label={mode === 'play' ? `${look.name}. Tap or press Space to fly.` : `${look.name} demo`}
>
	<canvas bind:this={canvas} class="absolute inset-0 block size-full"></canvas>

	{#if sticker && look.crashSticker}
		{#key sticker.id}
			<div class="faah pointer-events-none absolute z-40" style:left="{sticker.x}px" style:top="{sticker.y}px" aria-hidden="true">
				<span class="faah-ring"></span>
				<span class="faah-ring faah-ring-2"></span>
				{#each Array(10) as _, i (i)}
					<span class="faah-dot" style:--a="{i * 36}deg" style:--d="{80 + (i % 3) * 22}px"></span>
				{/each}
				<img src={look.crashSticker} alt="" class="faah-img" draggable="false" />
			</div>
		{/key}
	{/if}

	{#if mode === 'play'}
		<!-- Score -->
		{#if phase !== 'ready'}
			<div class="pointer-events-none absolute inset-x-0 top-[7%] z-10 text-center" aria-live="polite">
				{#key score}
					<span
						class="flappy-score inline-block font-display text-7xl font-bold text-white tabular sm:text-8xl"
						in:scale={{ start: reduced ? 1 : 1.35, duration: 260, easing: backOut }}>{score}</span
					>
				{/key}
			</div>
		{/if}

		{#if phase === 'ready'}
			<div class="pointer-events-none absolute inset-0 z-10 flex flex-col items-center justify-center px-6 text-center" out:fade={{ duration: 150 }}>
				<p class="flappy-title font-display text-5xl font-bold tracking-tight text-white uppercase sm:text-6xl">Get ready</p>
				<div class="mt-[34vh] flex flex-col items-center gap-3 sm:mt-[30vh]">
					<span class="tap-hint grid size-14 place-items-center rounded-full bg-white/90 text-2xl shadow-lg" aria-hidden="true">👆</span>
					<p class="rounded-full bg-black/35 px-4 py-1.5 text-sm font-semibold text-white backdrop-blur-sm">{canPlay ? hint : 'Flights are closed'}</p>
				</div>
			</div>
		{/if}

		{#if paused}
			<div class="pointer-events-none absolute inset-0 z-20 grid place-items-center bg-black/30 backdrop-blur-[2px]" transition:fade={{ duration: 150 }}>
				<p class="rounded-xl bg-black/50 px-5 py-3 text-lg font-semibold text-white">Paused — tap to keep flying</p>
			</div>
		{/if}

		{#if timeUp}
			<div class="pointer-events-none absolute inset-x-0 top-[30%] z-20 text-center" in:scale={{ start: 0.6, duration: 420, easing: backOut }}>
				<p class="flappy-title font-display text-6xl font-bold text-sun uppercase">Time!</p>
			</div>
		{/if}

		{#if phase === 'over' && overlay}
			<div class="absolute inset-0 z-30" onpointerdown={(e) => e.stopPropagation()} role="presentation">
				{@render overlay()}
			</div>
		{/if}
	{/if}
</div>

<style>
	.flappy-score,
	.flappy-title {
		-webkit-text-stroke: 3px rgba(40, 22, 6, 0.85);
		paint-order: stroke fill;
		text-shadow: 0 5px 0 rgba(40, 22, 6, 0.55);
	}
	.tap-hint {
		animation: tap 1.1s ease-in-out infinite;
	}
	@keyframes tap {
		0%,
		100% {
			transform: translateY(0) scale(1);
		}
		45% {
			transform: translateY(6px) scale(0.92);
		}
	}
	/* Comic crash sticker: slam in, wobble, hold, then pop away. */
	.faah {
		width: min(72%, 340px);
		translate: -50% -50%;
	}
	.faah-img {
		display: block;
		width: 100%;
		height: auto;
		filter: drop-shadow(0 6px 0 rgba(0, 0, 0, 0.35));
		animation: faah-pop 1.65s cubic-bezier(0.2, 0.9, 0.25, 1) both;
	}
	@keyframes faah-pop {
		0% {
			transform: scale(0.1) rotate(-28deg);
			opacity: 0;
		}
		14% {
			transform: scale(1.32) rotate(7deg);
			opacity: 1;
		}
		24% {
			transform: scale(0.9) rotate(-5deg);
		}
		33% {
			transform: scale(1.08) rotate(3deg);
		}
		42%,
		52% {
			transform: scale(1) rotate(-2deg);
		}
		47% {
			transform: scale(1.03) rotate(1.5deg);
		}
		82% {
			transform: scale(1) rotate(-2deg);
			opacity: 1;
		}
		100% {
			transform: scale(1.5) rotate(6deg);
			opacity: 0;
		}
	}
	.faah-ring {
		position: absolute;
		left: 50%;
		top: 50%;
		width: 60%;
		aspect-ratio: 1;
		border-radius: 9999px;
		border: 6px solid #ffe14d;
		translate: -50% -50%;
		animation: faah-ring 0.6s ease-out both;
	}
	.faah-ring-2 {
		border-color: #ffffff;
		border-width: 3px;
		animation-delay: 0.08s;
	}
	@keyframes faah-ring {
		0% {
			transform: scale(0.2);
			opacity: 1;
		}
		100% {
			transform: scale(2.1);
			opacity: 0;
		}
	}
	.faah-dot {
		position: absolute;
		left: 50%;
		top: 50%;
		width: 12px;
		height: 12px;
		margin: -6px;
		border-radius: 9999px;
		background: #ff3b30;
		box-shadow: 0 0 0 3px #1b1b1b;
		animation: faah-dot 0.7s ease-out both;
	}
	.faah-dot:nth-child(odd) {
		background: #ffd23f;
	}
	@keyframes faah-dot {
		0% {
			transform: rotate(var(--a)) translateY(0) scale(1.2);
			opacity: 1;
		}
		100% {
			transform: rotate(var(--a)) translateY(calc(-1 * var(--d))) scale(0);
			opacity: 0;
		}
	}
	@media (prefers-reduced-motion: reduce) {
		.tap-hint,
		.faah-ring,
		.faah-dot {
			animation: none;
		}
		.faah-ring,
		.faah-dot {
			display: none;
		}
		.faah-img {
			animation: faah-fade 1.6s both;
		}
		@keyframes faah-fade {
			0%,
			85% {
				opacity: 1;
			}
			100% {
				opacity: 0;
			}
		}
	}
</style>
