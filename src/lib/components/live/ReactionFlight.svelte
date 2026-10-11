<script lang="ts">
	import { reduced } from '$lib/live/motion';

	/**
	 * Overlay that floats emoji up the screen: each one pops in, sways side to
	 * side as it rises, tilts with the sway and fades near the top. Elements are
	 * created imperatively and animated with WAAPI, so a burst of reactions
	 * never touches Svelte state. Call `launch()` through `bind:this`.
	 */
	let {
		size = 64,
		rise = 0.85,
		max = 90,
		class: klass = ''
	}: {
		/** Base emoji size in px (each one varies ±30%). */
		size?: number;
		/** How far up to travel, as a fraction of the overlay's height. */
		rise?: number;
		/** Cap on emoji in flight at once; extras are dropped. */
		max?: number;
		class?: string;
	} = $props();

	let layer = $state<HTMLDivElement>();
	let inFlight = 0;

	const rand = (a: number, b: number) => a + Math.random() * (b - a);

	/**
	 * Float one emoji. `at` is a viewport point to start from; without it the
	 * emoji starts somewhere along the bottom-right of the overlay.
	 */
	export function launch(emoji: string, at?: { x: number; y: number }, delay = 0) {
		if (!layer || inFlight >= max) return;
		const box = layer.getBoundingClientRect();
		const px = Math.round(size * rand(0.7, 1.3));
		const x = at ? at.x - box.left : box.width * rand(0.62, 0.94);
		const y = at ? at.y - box.top : box.height - px * 0.2;

		const el = document.createElement('span');
		el.textContent = emoji;
		el.className = 'reaction-emoji';
		el.style.left = `${x - px / 2}px`;
		el.style.top = `${y - px / 2}px`;
		el.style.fontSize = `${px}px`;
		layer.appendChild(el);
		inFlight++;

		let anim: Animation;
		if (reduced()) {
			anim = el.animate(
				[
					{ opacity: 0, transform: 'translateY(0)' },
					{ opacity: 1, offset: 0.2 },
					{ opacity: 0, transform: `translateY(${-px * 1.5}px)` }
				],
				{ duration: 1400, delay, easing: 'ease-out', fill: 'both' }
			);
		} else {
			// A gentle sine sway whose amplitude grows as it climbs.
			const height = Math.max(box.height, 200) * rise * rand(0.75, 1);
			const amp = rand(18, 42) * (size / 64);
			const waves = rand(1.2, 2.2);
			const phase = rand(0, Math.PI * 2);
			const drift = rand(-30, 30) * (size / 64);
			const spin = rand(-14, 14);
			const steps = 12;
			const frames: Keyframe[] = [{ offset: 0, opacity: 0, transform: 'translate(0, 0) scale(0.2) rotate(0deg)' }];
			frames.push({ offset: 0.06, opacity: 1, transform: `translate(0, ${-px * 0.25}px) scale(1.3) rotate(${spin}deg)` });
			for (let i = 1; i <= steps; i++) {
				const t = i / steps;
				const p = 0.12 + t * 0.88;
				const s = Math.sin(phase + t * waves * Math.PI * 2);
				const dx = s * amp * (0.4 + t) + drift * t;
				const dy = -px * 0.25 - height * t;
				frames.push({
					offset: p,
					opacity: t < 0.7 ? 1 : 1 - (t - 0.7) / 0.3,
					transform: `translate(${dx}px, ${dy}px) scale(${1 - t * 0.2}) rotate(${s * 12 + spin * (1 - t)}deg)`
				});
			}
			anim = el.animate(frames, { duration: rand(2600, 3800), delay, easing: 'cubic-bezier(0.25, 0.6, 0.45, 1)', fill: 'both' });
		}
		const done = () => {
			el.remove();
			inFlight--;
		};
		anim.onfinish = done;
		anim.oncancel = done;
	}
</script>

<div bind:this={layer} class="pointer-events-none fixed inset-0 overflow-hidden {klass}" aria-hidden="true"></div>

<style>
	div :global(.reaction-emoji) {
		position: absolute;
		line-height: 1;
		user-select: none;
		will-change: transform, opacity;
		filter: drop-shadow(0 6px 10px rgb(0 0 0 / 0.18));
	}
</style>
