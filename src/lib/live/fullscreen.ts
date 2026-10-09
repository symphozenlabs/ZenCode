/**
 * Presentation mode. Must run inside a user gesture (click / key). SvelteKit
 * navigations keep the same document, so entering fullscreen just before
 * `goto` carries it into the presenter screen.
 */
export function enterFullscreen() {
	if (document.fullscreenElement) return;
	document.documentElement.requestFullscreen?.().catch(() => {});
}

export function toggleFullscreen() {
	if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
	else enterFullscreen();
}
