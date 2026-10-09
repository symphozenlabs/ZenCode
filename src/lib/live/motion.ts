/**
 * Motion for live screens. Durations mirror the --motion-* tokens in app.css.
 *
 * With prefers-reduced-motion every transition here becomes a plain opacity
 * fade driven by `tick` (JS), because the global reduced-motion CSS rule
 * zeroes CSS animation durations, which would make CSS fades pop.
 */
import { backOut, cubicIn, cubicOut, elasticOut, expoOut, quartOut } from 'svelte/easing';
import { prefersReducedMotion } from 'svelte/motion';
import type { TransitionConfig } from 'svelte/transition';

export const DUR = { fast: 150, base: 220, layout: 420, stage: 640 } as const;

interface Opts {
	delay?: number;
	duration?: number;
}

export const reduced = () => prefersReducedMotion.current;

/** Opacity-only, JS driven — safe under reduced motion. */
export function softFade(node: Element, { delay = 0, duration = DUR.base }: Opts = {}): TransitionConfig {
	const el = node as HTMLElement;
	const target = Number(getComputedStyle(el).opacity) || 1;
	return {
		delay,
		duration,
		easing: cubicOut,
		tick: (t) => {
			el.style.opacity = String(t * target);
			if (t === 1) el.style.removeProperty('opacity');
		}
	};
}

/** Scale-and-bounce entrance (lobby avatars, badges). */
export function pop(node: Element, { delay = 0, duration = DUR.layout, from = 0.4 }: Opts & { from?: number } = {}): TransitionConfig {
	if (reduced()) return softFade(node, { delay, duration: DUR.base });
	return {
		delay,
		duration,
		easing: backOut,
		css: (t) => `transform: scale(${from + (1 - from) * t}); opacity: ${Math.min(1, t * 1.6)}`
	};
}

/** Rise into place (ease-out) — content entering. */
export function rise(node: Element, { delay = 0, duration = DUR.stage, y = 24 }: Opts & { y?: number } = {}): TransitionConfig {
	if (reduced()) return softFade(node, { delay, duration: DUR.base });
	return {
		delay,
		duration,
		easing: quartOut,
		css: (t, u) => `transform: translate3d(0, ${u * y}px, 0); opacity: ${t}`
	};
}

/** Leave (ease-in) — content exiting. */
export function sink(node: Element, { delay = 0, duration = DUR.base, y = -12 }: Opts & { y?: number } = {}): TransitionConfig {
	if (reduced()) return softFade(node, { delay, duration });
	return {
		delay,
		duration,
		easing: cubicIn,
		css: (t, u) => `transform: translate3d(0, ${u * y}px, 0); opacity: ${t}`
	};
}

/**
 * Cinematic scene entrance: arrives slightly small and out of focus, then
 * settles sharp. Used for whole presenter views (slide → slide, leaderboard).
 */
export function warpIn(node: Element, { delay = 0, duration = 900, scale = 0.94, blur = 14, y = 18 }: Opts & { scale?: number; blur?: number; y?: number } = {}): TransitionConfig {
	if (reduced()) return softFade(node, { delay, duration: DUR.layout });
	return {
		delay,
		duration,
		easing: expoOut,
		css: (t, u) => `transform: translate3d(0, ${u * y}px, 0) scale(${1 - u * (1 - scale)}); filter: blur(${u * blur}px); opacity: ${t}`
	};
}

/** Scene exit: pushes toward the viewer and dissolves. */
export function warpOut(node: Element, { delay = 0, duration = 460, scale = 1.06, blur = 10 }: Opts & { scale?: number; blur?: number } = {}): TransitionConfig {
	if (reduced()) return softFade(node, { delay, duration: DUR.base });
	return {
		delay,
		duration,
		easing: cubicIn,
		css: (t, u) => `transform: scale(${1 + u * (scale - 1)}); filter: blur(${u * blur}px); opacity: ${t}`
	};
}

/** Springy scale + slight rotation — words, chips, stickers. */
export function burst(node: Element, { delay = 0, duration = 700, rotate = 0 }: Opts & { rotate?: number } = {}): TransitionConfig {
	if (reduced()) return softFade(node, { delay, duration: DUR.base });
	return {
		delay,
		duration,
		easing: elasticOut,
		css: (t, u) => `transform: scale(${t}) rotate(${u * rotate}deg); opacity: ${Math.min(1, t * 2)}`
	};
}

/** Grow upward from the floor (columns, podium blocks). */
export function grow(node: Element, { delay = 0, duration = 900 }: Opts = {}): TransitionConfig {
	if (reduced()) return softFade(node, { delay, duration: DUR.base });
	return {
		delay,
		duration,
		easing: backOut,
		css: (t) => `transform-origin: bottom; transform: scaleY(${t}); opacity: ${Math.min(1, t * 3)}`
	};
}
