<script lang="ts">
	/**
	 * A game's key art as a framed card: it unveils itself (blur → sharp, a
	 * clip that opens from the centre), then drifts in a slow Ken Burns zoom
	 * with a light sheen passing over it now and then. With `tilt`, it leans
	 * toward the pointer like a holographic card.
	 */
	interface Props {
		src: string;
		alt: string;
		tilt?: boolean;
		/** Delay before the unveil, in ms. */
		delay?: number;
		class?: string;
	}
	let { src, alt, tilt = false, delay = 0, class: cls = '' }: Props = $props();

	let rx = $state(0);
	let ry = $state(0);
	let gx = $state(50);
	let gy = $state(30);
	let loaded = $state(false);
	let img = $state<HTMLImageElement>();
	// A cached image can finish before hydration and never fire `load`.
	$effect(() => {
		if (img?.complete && img.naturalWidth) loaded = true;
	});

	function onpointermove(e: PointerEvent) {
		if (!tilt || e.pointerType !== 'mouse') return;
		const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
		const px = (e.clientX - r.left) / r.width;
		const py = (e.clientY - r.top) / r.height;
		ry = (px - 0.5) * 14;
		rx = (0.5 - py) * 14;
		gx = px * 100;
		gy = py * 100;
	}
	function onpointerleave() {
		rx = ry = 0;
		gx = 50;
		gy = 30;
	}
</script>

<div class="poster-wrap {cls}" style:--delay="{delay}ms" {onpointermove} {onpointerleave} role="presentation">
	<div class="poster" class:loaded style:--rx="{rx}deg" style:--ry="{ry}deg" style:--gx="{gx}%" style:--gy="{gy}%">
		<img bind:this={img} {src} {alt} class="poster-img" draggable="false" decoding="async" onload={() => (loaded = true)} onerror={() => (loaded = true)} />
		<span class="poster-sheen" aria-hidden="true"></span>
		<span class="poster-glare" aria-hidden="true"></span>
	</div>
</div>

<style>
	.poster-wrap {
		perspective: 1100px;
	}
	.poster {
		position: relative;
		aspect-ratio: 4 / 5;
		width: 100%;
		overflow: hidden;
		border-radius: 1.5rem;
		background: #1b1206;
		box-shadow:
			0 0 0 1px rgba(255, 255, 255, 0.14),
			0 30px 80px -24px rgba(0, 0, 0, 0.75),
			0 0 120px -30px rgba(255, 176, 46, 0.55);
		transform: rotateX(var(--rx, 0deg)) rotateY(var(--ry, 0deg));
		transition: transform 0.35s cubic-bezier(0.2, 0.8, 0.2, 1);
		transform-style: preserve-3d;
		opacity: 0;
		clip-path: inset(42% 42% 42% 42% round 1.5rem);
	}
	.poster.loaded {
		animation: unveil 1.1s cubic-bezier(0.16, 1, 0.3, 1) var(--delay) both;
	}
	.poster-img {
		display: block;
		width: 100%;
		height: 100%;
		object-fit: cover;
		animation: kenburns 22s ease-in-out infinite alternate;
	}
	/* A diagonal band of light that crosses the card every few seconds. */
	.poster-sheen {
		position: absolute;
		inset: -20%;
		background: linear-gradient(105deg, transparent 38%, rgba(255, 255, 255, 0.38) 48%, rgba(255, 255, 255, 0.08) 54%, transparent 62%);
		transform: translateX(-80%);
		mix-blend-mode: soft-light;
		animation: sheen 6.5s cubic-bezier(0.45, 0, 0.2, 1) calc(var(--delay) + 1.1s) infinite;
		pointer-events: none;
	}
	/* Follows the pointer when tilting. */
	.poster-glare {
		position: absolute;
		inset: 0;
		background: radial-gradient(circle at var(--gx) var(--gy), rgba(255, 255, 255, 0.22), transparent 55%);
		mix-blend-mode: overlay;
		pointer-events: none;
	}
	@keyframes unveil {
		0% {
			opacity: 0;
			clip-path: inset(42% 42% 42% 42% round 1.5rem);
			filter: blur(14px) saturate(1.6);
			scale: 1.12;
		}
		35% {
			opacity: 1;
		}
		100% {
			opacity: 1;
			clip-path: inset(0 0 0 0 round 1.5rem);
			filter: blur(0) saturate(1);
			scale: 1;
		}
	}
	@keyframes kenburns {
		from {
			transform: scale(1.02) translate(0, 0);
		}
		to {
			transform: scale(1.12) translate(-1.5%, -2%);
		}
	}
	@keyframes sheen {
		0% {
			transform: translateX(-80%);
		}
		28%,
		100% {
			transform: translateX(80%);
		}
	}
	@media (prefers-reduced-motion: reduce) {
		.poster.loaded {
			animation: none;
			opacity: 1;
			clip-path: inset(0 0 0 0 round 1.5rem);
		}
		.poster {
			transform: none;
		}
		.poster-img,
		.poster-sheen {
			animation: none;
		}
	}
</style>
