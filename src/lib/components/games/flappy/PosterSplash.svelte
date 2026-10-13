<script lang="ts">
	import { fade } from 'svelte/transition';
	import { playSample, preloadSample, unlockAudio } from '$lib/games/flappy/audio';
	import GamePoster from './GamePoster.svelte';

	/**
	 * The title card a player sees before their first flight: the poster on a
	 * spinning comic sunburst. A tap makes Symba roar and the poster rushes
	 * past the camera into the sky, revealing the game behind it.
	 */
	interface Props {
		poster: string;
		title: string;
		/** Played on take-off. */
		roar?: string | null;
		onclose: () => void;
	}
	let { poster, title, roar = null, onclose }: Props = $props();

	let launching = $state(false);
	$effect(() => {
		if (roar) preloadSample(roar);
	});

	function launch() {
		if (launching) return;
		launching = true;
		unlockAudio();
		// On a fresh page the clip may still be decoding: keep trying briefly.
		if (roar) {
			const url = roar;
			let tries = 0;
			const tryRoar = () => !playSample(url) && ++tries < 8 && setTimeout(tryRoar, 90);
			tryRoar();
		}
		navigator.vibrate?.([18, 40, 28]);
		setTimeout(onclose, 820);
	}

	function onkeydown(e: KeyboardEvent) {
		if (e.code !== 'Space' && e.code !== 'Enter' && e.code !== 'ArrowUp' && e.code !== 'KeyW') return;
		// Captured before the game sees it, so this key doesn't start a flight.
		e.preventDefault();
		e.stopImmediatePropagation();
		launch();
	}
</script>

<svelte:window onkeydowncapture={onkeydown} />

<div
	class="splash absolute inset-0 z-50 grid cursor-pointer place-items-center overflow-hidden"
	class:launching
	onpointerdown={(e) => {
		e.preventDefault();
		e.stopPropagation();
		launch();
	}}
	role="button"
	tabindex="0"
	aria-label="{title}. Tap to take off."
	out:fade={{ duration: 220 }}
>
	<!-- The poster itself, blurred, as the backdrop -->
	<img src={poster} alt="" class="backdrop" aria-hidden="true" draggable="false" />
	<div class="rays" aria-hidden="true"></div>
	<div class="vignette" aria-hidden="true"></div>

	<div class="stack relative flex h-full w-full flex-col items-center justify-center gap-5 px-6 py-6">
		<div class="card">
			<GamePoster src={poster} alt={title} delay={120} />
		</div>
		<div class="cta flex flex-col items-center gap-2">
			<span class="pill relative inline-flex items-center gap-2 rounded-full bg-sun px-6 py-3 font-display text-lg font-bold tracking-[0.12em] text-stage uppercase shadow-lg shadow-black/40">
				<span class="ring" aria-hidden="true"></span>
				Tap to take off
			</span>
			<p class="text-xs font-medium tracking-wide text-white/75">Symba roars when you’re ready</p>
		</div>
	</div>

	<div class="flash" aria-hidden="true"></div>
</div>

<style>
	.splash {
		container-type: size;
		background: #120a04;
		-webkit-tap-highlight-color: transparent;
	}
	.backdrop {
		position: absolute;
		inset: -10%;
		width: 120%;
		height: 120%;
		object-fit: cover;
		filter: blur(28px) saturate(1.5) brightness(0.55);
		animation: drift 18s ease-in-out infinite alternate;
	}
	/* Comic sunburst turning slowly behind the card. */
	.rays {
		position: absolute;
		left: 50%;
		top: 44%;
		width: 260vmax;
		aspect-ratio: 1;
		translate: -50% -50%;
		background: repeating-conic-gradient(from 0deg, rgba(255, 214, 92, 0.16) 0deg 7deg, transparent 7deg 18deg);
		mask-image: radial-gradient(circle, #000 0%, transparent 42%);
		animation: spin 40s linear infinite;
	}
	.vignette {
		position: absolute;
		inset: 0;
		background: radial-gradient(ellipse at 50% 45%, transparent 35%, rgba(0, 0, 0, 0.6) 100%);
	}
	.card {
		/* As big as fits above the call to action, keeping the poster's 4:5. */
		width: min(80%, 26rem, calc((100cqh - 9rem) * 0.8));
		animation: float 5s ease-in-out 1.2s infinite;
		transition:
			transform 0.8s cubic-bezier(0.7, 0, 0.84, 0),
			opacity 0.6s ease-in 0.15s,
			filter 0.8s ease-in;
	}
	.cta {
		animation: rise 0.7s cubic-bezier(0.16, 1, 0.3, 1) 0.8s both;
		transition:
			opacity 0.25s ease-out,
			transform 0.4s ease-in;
	}
	.pill {
		animation: breathe 1.8s ease-in-out 1.5s infinite;
	}
	.ring {
		position: absolute;
		inset: 0;
		border-radius: 9999px;
		border: 2px solid var(--color-sun);
		animation: ping 1.8s cubic-bezier(0, 0, 0.2, 1) 1.5s infinite;
	}
	.flash {
		position: absolute;
		inset: 0;
		background: radial-gradient(circle at 50% 42%, #fff 0%, #ffe9a6 35%, rgba(255, 200, 80, 0) 70%);
		opacity: 0;
		pointer-events: none;
	}

	/* ── Take-off ── */
	.launching .card {
		animation: none;
		transform: scale(3.4) translateY(-6%);
		opacity: 0;
		filter: blur(10px);
	}
	.launching .cta {
		opacity: 0;
		transform: translateY(24px);
	}
	.launching .rays {
		animation: spin 1.4s linear infinite;
		transition: opacity 0.7s ease-in;
	}
	.launching .flash {
		animation: flash 0.82s ease-out both;
	}
	.launching .backdrop {
		transition:
			transform 0.8s ease-in,
			opacity 0.8s ease-in;
		transform: scale(1.4);
		opacity: 0;
	}

	@keyframes spin {
		to {
			rotate: 360deg;
		}
	}
	@keyframes drift {
		to {
			transform: scale(1.08) translate(2%, -2%);
		}
	}
	@keyframes float {
		0%,
		100% {
			transform: translateY(0) rotate(-0.6deg);
		}
		50% {
			transform: translateY(-10px) rotate(0.6deg);
		}
	}
	@keyframes rise {
		from {
			opacity: 0;
			transform: translateY(18px);
		}
	}
	@keyframes breathe {
		0%,
		100% {
			transform: scale(1);
		}
		50% {
			transform: scale(1.05);
		}
	}
	@keyframes ping {
		0% {
			transform: scale(1);
			opacity: 0.8;
		}
		80%,
		100% {
			transform: scale(1.35, 1.7);
			opacity: 0;
		}
	}
	@keyframes flash {
		0% {
			opacity: 0;
		}
		30% {
			opacity: 0.85;
		}
		100% {
			opacity: 0;
		}
	}
	@media (prefers-reduced-motion: reduce) {
		.backdrop,
		.rays,
		.card,
		.pill,
		.ring,
		.cta {
			animation: none;
		}
		.launching .card {
			transform: none;
		}
	}
</style>
