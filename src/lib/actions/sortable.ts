import { tick } from 'svelte';
import type { Action } from 'svelte/action';

export interface SortableParams {
	onsort: (from: number, to: number) => void;
	disabled?: boolean;
}

/**
 * Vertical drag-to-reorder with pointer events (mouse, touch, pen).
 *
 *   <ol use:sortable={{ onsort }}>
 *     <li data-sort-item> <button data-sort-handle>…</button> … </li>
 *
 * The lifted item follows the pointer and gets `data-lifted`; siblings slide
 * aside with a transform transition. Only transform is animated. On drop the
 * caller reorders its array; transforms are cleared after the DOM updates so
 * nothing jumps. Handles need `touch-action: none` (set here).
 */
export const sortable: Action<HTMLElement, SortableParams> = (list, initial) => {
	let params = initial;
	let drag: {
		item: HTMLElement;
		items: HTMLElement[];
		from: number;
		to: number;
		startY: number;
		mids: number[];
		size: number;
		pointerId: number;
	} | null = null;

	const items = () => [...list.querySelectorAll<HTMLElement>(':scope > [data-sort-item]')];

	function setHandles() {
		for (const h of list.querySelectorAll<HTMLElement>('[data-sort-handle]')) h.style.touchAction = 'none';
	}
	setHandles();
	const observer = new MutationObserver(setHandles);
	observer.observe(list, { childList: true, subtree: true });

	function down(e: PointerEvent) {
		if (params.disabled || drag || e.button > 0) return;
		const handle = (e.target as HTMLElement).closest<HTMLElement>('[data-sort-handle]');
		const item = handle?.closest<HTMLElement>('[data-sort-item]');
		if (!handle || !item || item.parentElement !== list) return;
		e.preventDefault();
		const all = items();
		const rects = all.map((el) => el.getBoundingClientRect());
		const from = all.indexOf(item);
		const gap = rects.length > 1 ? Math.max(0, rects[1].top - rects[0].bottom) : 0;
		drag = {
			item,
			items: all,
			from,
			to: from,
			startY: e.clientY,
			mids: rects.map((r) => r.top + r.height / 2),
			size: rects[from].height + gap,
			pointerId: e.pointerId
		};
		handle.setPointerCapture(e.pointerId);
		item.dataset.lifted = '';
		item.style.zIndex = '10';
		item.style.transition = 'none';
		for (const el of all) if (el !== item) el.style.transition = 'transform var(--motion-base) var(--ease-out-quart)';
		handle.addEventListener('pointermove', move);
		handle.addEventListener('pointerup', up);
		handle.addEventListener('pointercancel', up);
	}

	function move(e: PointerEvent) {
		if (!drag || e.pointerId !== drag.pointerId) return;
		const dy = e.clientY - drag.startY;
		drag.item.style.transform = `translate3d(0, ${dy}px, 0)`;
		const y = drag.mids[drag.from] + dy;
		let to = drag.from;
		while (to < drag.mids.length - 1 && y > drag.mids[to + 1]) to++;
		while (to > 0 && y < drag.mids[to - 1]) to--;
		if (to === drag.to) return;
		drag.to = to;
		drag.items.forEach((el, i) => {
			if (el === drag!.item) return;
			let shift = 0;
			if (drag!.from < to && i > drag!.from && i <= to) shift = -drag!.size;
			if (drag!.from > to && i < drag!.from && i >= to) shift = drag!.size;
			el.style.transform = shift ? `translate3d(0, ${shift}px, 0)` : '';
		});
	}

	async function up(e: PointerEvent) {
		if (!drag || e.pointerId !== drag.pointerId) return;
		const { item, items: all, from, to } = drag;
		const handle = e.currentTarget as HTMLElement;
		handle.removeEventListener('pointermove', move);
		handle.removeEventListener('pointerup', up);
		handle.removeEventListener('pointercancel', up);
		drag = null;
		delete item.dataset.lifted;

		const reset = () => {
			for (const el of all) {
				el.style.transition = 'none';
				el.style.transform = '';
				el.style.zIndex = '';
			}
			requestAnimationFrame(() => all.forEach((el) => (el.style.transition = '')));
		};

		if (from !== to && e.type === 'pointerup') {
			params.onsort(from, to);
			await tick();
			reset();
		} else {
			// Cancelled or dropped in place: glide back
			for (const el of all) {
				el.style.transition = 'transform var(--motion-base) var(--ease-out-quart)';
				el.style.transform = '';
			}
			setTimeout(reset, 260);
		}
	}

	list.addEventListener('pointerdown', down);
	return {
		update(p) {
			params = p;
		},
		destroy() {
			observer.disconnect();
			list.removeEventListener('pointerdown', down);
		}
	};
};

/** Move an array element in place (helper for onsort handlers). */
export function moveItem<T>(list: T[], from: number, to: number) {
	const [x] = list.splice(from, 1);
	list.splice(to, 0, x);
}
