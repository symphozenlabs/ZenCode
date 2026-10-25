<script lang="ts">
	import { untrack } from 'svelte';
	import { Play } from '@lucide/svelte';
	import { Board } from '$lib/games/scribble/board';
	import { MOTIONS, motionFor, timeline, type Particle } from '$lib/games/scribble/life';
	import type { Chunk } from '$lib/games/scribble/live';
	import CanvasFrame from './CanvasFrame.svelte';
	import ScribbleCanvas from './ScribbleCanvas.svelte';

	/**
	 * The finished drawing, which comes to life: it is cut out of the paper as
	 * a sticker, peels off, moves the way its word would (see life.ts) and
	 * lands back on the page. Starts once `ready` (the points are up).
	 */
	interface Props {
		chunks: Chunk[];
		word: string;
		/** Hold off until the layout around the drawing has settled. */
		ready?: boolean;
		delay?: number;
		label?: string;
		class?: string;
	}
	let { chunks, word, ready = true, delay = 700, label = 'The drawing', class: cls = '' }: Props = $props();

	let paper: HTMLDivElement;
	let phase = $state<'waiting' | 'alive' | 'done'>('waiting');
	/** The cut-out, also drawn faintly on the paper while the drawing is away. */
	let ghost = $state<{ url: string; box: { x: number; y: number; w: number; h: number } } | null>(null);
	let stop: (() => void) | null = null;
	/** Set before anything async, so a replay and the start timer can't both launch it. */
	let running = false;

	// Start a moment after the drawing stops changing (late strokes still land at the reveal).
	$effect(() => {
		chunks;
		if (!ready || phase !== 'waiting') return;
		const t = setTimeout(() => untrack(comeAlive), delay);
		return () => clearTimeout(t);
	});
	let destroyed = false;
	$effect(() => () => {
		destroyed = true;
		stop?.();
	});

	/** The drawing without its paper: everything near-white becomes transparent, cropped to the ink. */
	function cutOut() {
		if (!chunks.length) return null;
		const canvas = document.createElement('canvas');
		const board = new Board(canvas);
		for (const c of chunks) for (const op of c.ops) board.apply(op);
		if (board.empty) return null;
		const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
		const W = canvas.width;
		const H = canvas.height;
		const all = ctx.getImageData(0, 0, W, H).data;
		let x0 = W;
		let y0 = H;
		let x1 = -1;
		let y1 = -1;
		for (let y = 0; y < H; y += 2) {
			for (let x = 0; x < W; x += 2) {
				const i = (y * W + x) * 4;
				if (Math.min(all[i], all[i + 1], all[i + 2]) < 236) {
					if (x < x0) x0 = x;
					if (x > x1) x1 = x;
					if (y < y0) y0 = y;
					if (y > y1) y1 = y;
				}
			}
		}
		if (x1 < 0) return null;
		const pad = 8;
		x0 = Math.max(0, x0 - pad);
		y0 = Math.max(0, y0 - pad);
		x1 = Math.min(W - 1, x1 + pad);
		y1 = Math.min(H - 1, y1 + pad);
		const w = x1 - x0 + 1;
		const h = y1 - y0 + 1;
		const img = ctx.getImageData(x0, y0, w, h);
		const p = img.data;
		for (let i = 0; i < p.length; i += 4) {
			const m = Math.min(p[i], p[i + 1], p[i + 2]);
			if (m >= 246) p[i + 3] = 0;
			else if (m > 200) p[i + 3] = Math.round((255 * (246 - m)) / 46); // soft edge where ink meets paper
		}
		const out = document.createElement('canvas');
		out.width = w;
		out.height = h;
		out.getContext('2d')!.putImageData(img, 0, 0);
		return { url: out.toDataURL('image/png'), box: { x: x0 / W, y: y0 / H, w: w / W, h: h / H } };
	}

	async function comeAlive() {
		if (running || !paper) return;
		const cut = cutOut();
		const r = paper.getBoundingClientRect();
		if (!cut || !r.width) return;
		running = true;
		ghost = cut;
		const rect = { left: r.left + cut.box.x * r.width, top: r.top + cut.box.y * r.height, width: cut.box.w * r.width, height: cut.box.h * r.height };
		const cx = rect.left + rect.width / 2;
		const cy = rect.top + rect.height / 2;
		const motion = motionFor(word);
		const info = MOTIONS[motion];
		const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
		const { keyframes, duration } = timeline(motion, { left: cx, right: innerWidth - cx, top: cy, bottom: innerHeight - cy, width: rect.width, height: rect.height }, reduced);

		// Fixed layers on <body>, so the drawing can fly over everything and nothing clips it.
		const layer = document.createElement('div');
		layer.setAttribute('aria-hidden', 'true');
		Object.assign(layer.style, { position: 'fixed', inset: '0', zIndex: '60', pointerEvents: 'none', overflow: 'hidden' });
		const img = document.createElement('img');
		img.src = cut.url;
		img.alt = '';
		Object.assign(img.style, {
			position: 'absolute',
			left: `${rect.left}px`,
			top: `${rect.top}px`,
			width: `${rect.width}px`,
			height: `${rect.height}px`,
			transformOrigin: '50% 60%',
			willChange: 'transform, filter'
		});
		layer.append(img);
		document.body.append(layer);
		stop = () => layer.remove();
		await img.decode().catch(() => {});
		// The reveal may have ended while the image was loading.
		if (destroyed) {
			layer.remove();
			running = false;
			return;
		}

		const anim = img.animate(keyframes, { duration, fill: 'forwards' });
		phase = 'alive';
		const timers: ReturnType<typeof setTimeout>[] = [];
		let emitter: ReturnType<typeof setInterval> | null = null;
		if (!reduced) {
			timers.push(setTimeout(() => showCaption(layer, info.caption, rect), duration * 0.17));
			emitter = setInterval(() => {
				const t = ((Number(anim.currentTime) || 0) / duration - 0.15) / 0.7; // 0–1 through the motion
				if (t < info.emit[0] || t > info.emit[1] || layer.childElementCount > 90) return;
				const now = img.getBoundingClientRect();
				for (let i = 0; i < 2; i++) emit(layer, info.particle, now);
			}, 60);
		}
		stop = () => {
			anim.cancel();
			if (emitter) clearInterval(emitter);
			timers.forEach(clearTimeout);
			layer.remove();
		};
		try {
			await anim.finished;
		} catch {
			running = false;
			return; // cancelled: the screen moved on
		}
		running = false;
		if (emitter) clearInterval(emitter);
		phase = 'done';
		// Let the paper fade back in under the landed sticker before taking it away.
		timers.push(setTimeout(() => stop?.(), 350));
	}

	function replay() {
		stop?.();
		stop = null;
		phase = 'waiting';
		comeAlive();
	}

	const rand = (lo: number, hi: number) => lo + Math.random() * (hi - lo);

	function showCaption(layer: HTMLElement, text: string, rect: { left: number; top: number; width: number }) {
		const el = document.createElement('p');
		el.textContent = text;
		el.className = 'font-display font-bold uppercase';
		Object.assign(el.style, {
			position: 'absolute',
			left: `${rect.left + rect.width / 2}px`,
			top: `${Math.max(12, rect.top - 24)}px`,
			transform: 'translate(-50%, -100%)',
			fontSize: `${Math.max(20, Math.min(56, rect.width / 6))}px`,
			color: 'var(--color-sun)',
			whiteSpace: 'nowrap',
			WebkitTextStroke: '2px rgba(0,0,0,.45)',
			paintOrder: 'stroke fill',
			textShadow: '0 4px 0 rgba(0,0,0,.35)'
		});
		layer.append(el);
		el.animate(
			[
				{ transform: 'translate(-50%, -100%) scale(0.3) rotate(-8deg)', opacity: 0 },
				{ transform: 'translate(-50%, -100%) scale(1.15) rotate(3deg)', opacity: 1, offset: 0.12 },
				{ transform: 'translate(-50%, -100%) scale(1) rotate(-2deg)', opacity: 1, offset: 0.2 },
				{ transform: 'translate(-50%, -110%) scale(1) rotate(2deg)', opacity: 1, offset: 0.85 },
				{ transform: 'translate(-50%, -130%) scale(0.9)', opacity: 0 }
			],
			{ duration: 3600, easing: 'ease-out', fill: 'forwards' }
		);
	}

	/** One particle thrown off the moving drawing. */
	function emit(layer: HTMLElement, kind: Particle, r: DOMRect) {
		const el = document.createElement('span');
		const base: Partial<CSSStyleDeclaration> = { position: 'absolute', pointerEvents: 'none', borderRadius: '9999px' };
		let x = rand(r.left, r.right);
		let y = rand(r.top, r.bottom);
		let size = rand(8, 18);
		let frames: Keyframe[];
		let ms = 700;
		if (kind === 'flame') {
			x = r.left + r.width / 2 + rand(-0.12, 0.12) * r.width;
			y = r.bottom - 6;
			size = rand(12, 26);
			Object.assign(base, { background: `radial-gradient(circle, #fff7c2 0%, ${Math.random() > 0.5 ? '#f97316' : '#facc15'} 55%, transparent 72%)` });
			frames = [
				{ transform: 'translate(-50%, -50%) scale(1)', opacity: 1 },
				{ transform: `translate(calc(-50% + ${rand(-24, 24)}px), calc(-50% + ${rand(70, 150)}px)) scale(0.2)`, opacity: 0 }
			];
			ms = rand(450, 700);
		} else if (kind === 'bubble') {
			size = rand(7, 18);
			Object.assign(base, { border: '2px solid rgba(186, 230, 253, 0.9)', background: 'rgba(186, 230, 253, 0.15)' });
			frames = [
				{ transform: 'translate(-50%, -50%) scale(0.4)', opacity: 0 },
				{ transform: 'translate(-50%, -50%) scale(1)', opacity: 0.95, offset: 0.15 },
				{ transform: `translate(calc(-50% + ${rand(-20, 20)}px), calc(-50% - ${rand(80, 170)}px)) scale(1.1)`, opacity: 0 }
			];
			ms = rand(900, 1300);
		} else if (kind === 'dust') {
			y = r.bottom - rand(0, 10);
			size = rand(14, 30);
			Object.assign(base, { background: 'radial-gradient(circle, rgba(226, 232, 240, 0.85), rgba(148, 163, 184, 0) 70%)' });
			frames = [
				{ transform: 'translate(-50%, -50%) scale(0.4)', opacity: 0.9 },
				{ transform: `translate(calc(-50% + ${rand(-40, 40)}px), calc(-50% - ${rand(6, 22)}px)) scale(1.9)`, opacity: 0 }
			];
			ms = rand(550, 800);
		} else {
			// Sparkles (and sparks, which are hotter and quicker) fly outwards from the drawing.
			const spark = kind === 'spark';
			el.textContent = spark ? '✸' : '✦';
			const colors = spark ? ['#f97316', '#facc15', '#ef4444'] : ['#f0c45c', '#ffffff', '#8dbd77', '#a4a9e2'];
			Object.assign(base, { color: colors[Math.floor(Math.random() * colors.length)], fontSize: `${rand(12, spark ? 22 : 26)}px`, lineHeight: '1', borderRadius: '0' });
			const angle = rand(0, Math.PI * 2);
			const dist = rand(40, 90);
			frames = [
				{ transform: 'translate(-50%, -50%) scale(0.3) rotate(0deg)', opacity: 0 },
				{ transform: 'translate(-50%, -50%) scale(1.1) rotate(60deg)', opacity: 1, offset: 0.25 },
				{ transform: `translate(calc(-50% + ${Math.cos(angle) * dist}px), calc(-50% + ${Math.sin(angle) * dist}px)) scale(0.4) rotate(180deg)`, opacity: 0 }
			];
			ms = spark ? rand(380, 560) : rand(650, 950);
			size = 0;
		}
		Object.assign(el.style, base, { left: `${x}px`, top: `${y}px`, ...(size ? { width: `${size}px`, height: `${size}px` } : {}) });
		layer.append(el);
		el.animate(frames, { duration: ms, easing: 'cubic-bezier(.2,.7,.3,1)', fill: 'forwards' }).finished.then(() => el.remove(), () => el.remove());
	}
</script>

<div class="relative {cls}">
	<CanvasFrame fluid>
		<div class="relative size-full" bind:this={paper}>
			<ScribbleCanvas {chunks} animate={false} {label} />
			<!-- While the drawing is off the page, the page is blank but for a faint trace of it. -->
			<div class="absolute inset-0 bg-white transition-opacity duration-300 {phase === 'alive' ? 'opacity-100' : 'opacity-0'}" aria-hidden="true">
				{#if ghost}
					<img
						src={ghost.url}
						alt=""
						class="absolute opacity-[0.08] grayscale"
						style:left="{ghost.box.x * 100}%"
						style:top="{ghost.box.y * 100}%"
						style:width="{ghost.box.w * 100}%"
						style:height="{ghost.box.h * 100}%"
					/>
				{/if}
			</div>
		</div>
	</CanvasFrame>
	{#if phase === 'done'}
		<button
			type="button"
			onclick={replay}
			class="absolute right-2 bottom-2 inline-flex items-center gap-1.5 rounded-full bg-stage/80 px-3 py-1.5 text-xs font-semibold text-cream shadow-lg ring-1 ring-white/15 backdrop-blur transition-colors hover:bg-stage"
		>
			<Play class="size-3.5" /> Again
		</button>
	{/if}
</div>
