/**
 * Duration for Svelte transitions, collapsed to 0 when the visitor prefers
 * reduced motion (the CSS reduced-motion rule doesn't reach JS transitions).
 *
 * @param {number} ms
 */
export function motionMs(ms) {
  if (typeof window === 'undefined' || !window.matchMedia) return ms;
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : ms;
}

/** Smooth-scroll an element into view, respecting reduced motion. */
export function scrollIntoViewSmooth(el, block = 'center') {
  if (!el) return;
  el.scrollIntoView({ behavior: motionMs(1) ? 'smooth' : 'auto', block });
}
