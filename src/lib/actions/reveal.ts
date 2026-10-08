import type { Action } from 'svelte/action';

/** Fade/slide an element in the first time it scrolls into view. */
export const reveal: Action<HTMLElement, { delay?: number } | undefined> = (node, opts) => {
	if (opts?.delay) node.style.setProperty('--reveal-delay', `${opts.delay}ms`);
	node.dataset.reveal = '';
	if (typeof IntersectionObserver === 'undefined') {
		node.dataset.reveal = 'in';
		return;
	}
	const io = new IntersectionObserver(
		(entries) => {
			for (const e of entries) {
				if (e.isIntersecting) {
					node.dataset.reveal = 'in';
					io.disconnect();
				}
			}
		},
		{ rootMargin: '0px 0px -10% 0px', threshold: 0.1 }
	);
	io.observe(node);
	return { destroy: () => io.disconnect() };
};
