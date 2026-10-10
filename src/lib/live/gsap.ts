/**
 * GSAP for the presenter. Registered once, browser only. Everything here
 * collapses to "just show it" under prefers-reduced-motion.
 */
import { gsap } from 'gsap';
import { SplitText } from 'gsap/SplitText';
import { reduced } from './motion';

let ready = false;
export function useGsap() {
	if (!ready && typeof window !== 'undefined') {
		gsap.registerPlugin(SplitText);
		ready = true;
	}
	return gsap;
}

interface SplitOpts {
	text: string;
	delay?: number;
	/** 'chars' for short display text, 'words' for long questions. */
	by?: 'chars' | 'words';
	stagger?: number;
}

/**
 * Svelte action that owns its element's text: it rises out of a mask piece
 * by piece, tipping back like cards being dealt. Use on an empty element —
 * `<h1 use:splitReveal={{ text }}></h1>` — so SplitText never fights Svelte
 * over the same text nodes.
 */
export function splitReveal(node: HTMLElement, opts: SplitOpts) {
	let split: SplitText | null = null;
	let tween: gsap.core.Tween | null = null;

	const clear = () => {
		tween?.kill();
		split?.revert();
		tween = split = null;
	};

	const play = ({ text, delay = 0, by = 'words', stagger }: SplitOpts, animate: boolean) => {
		clear();
		node.textContent = text;
		if (!animate || reduced()) return;
		const g = useGsap();
		split = SplitText.create(node, { type: by === 'chars' ? 'words,chars' : 'words', mask: 'words' });
		tween = g.from(by === 'chars' ? split.chars : split.words, {
			yPercent: 120,
			rotationX: -70,
			transformOrigin: '50% 100%',
			opacity: 0,
			duration: 1,
			ease: 'expo.out',
			stagger: stagger ?? (by === 'chars' ? 0.025 : 0.06),
			delay: delay / 1000,
			onComplete: () => {
				split?.revert();
				split = null;
			}
		});
	};

	play(opts, true);
	return {
		update(next: SplitOpts) {
			if (next.text !== node.textContent) play(next, false);
		},
		destroy: clear
	};
}
