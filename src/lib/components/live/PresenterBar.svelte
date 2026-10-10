<script lang="ts">
	import type { Snippet } from 'svelte';
	import { Maximize, Minimize, ArrowLeft, Expand, X } from '@lucide/svelte';
	import { toggleFullscreen as toggle, enterFullscreen } from '$lib/live/fullscreen';
	import { DUR, rise, sink } from '$lib/live/motion';

	/**
	 * Slim presenter control bar. In fullscreen it fades away after a few idle
	 * seconds and comes back on pointer move or keyboard focus.
	 */
	interface Props {
		backHref: string;
		title: string;
		center?: Snippet;
		actions?: Snippet;
	}
	let { backHref, title, center, actions }: Props = $props();

	let fullscreen = $state(false);
	let idle = $state(false);
	let hovering = $state(false);
	let timer: ReturnType<typeof setTimeout> | undefined;

	const hidden = $derived(fullscreen && idle && !hovering);
	/** Windowed: offer presentation mode until dismissed. */
	let dismissed = $state(false);

	// Presentation mode: the cursor disappears with the controls
	$effect(() => {
		document.documentElement.style.cursor = hidden ? 'none' : '';
		return () => (document.documentElement.style.cursor = '');
	});

	function wake() {
		idle = false;
		clearTimeout(timer);
		timer = setTimeout(() => (idle = true), 2600);
	}

	$effect(() => {
		const sync = () => (fullscreen = !!document.fullscreenElement);
		sync();
		document.addEventListener('fullscreenchange', sync);
		wake();
		return () => {
			document.removeEventListener('fullscreenchange', sync);
			clearTimeout(timer);
		};
	});

	export function toggleFullscreen() {
		toggle();
	}
</script>

<svelte:window onpointermove={wake} onkeydown={wake} />

{#if !fullscreen && !dismissed}
	<div class="fixed inset-x-0 top-4 z-40 flex justify-center" in:rise={{ y: -12, duration: DUR.stage, delay: 600 }} out:sink>
		<div class="flex items-center gap-1 rounded-full bg-stage-raised/90 p-1 text-cream shadow-lg ring-1 ring-stage-line backdrop-blur-md">
			<button
				type="button"
				onclick={enterFullscreen}
				class="inline-flex h-9 items-center gap-2 rounded-full bg-sun px-4 text-sm font-semibold text-forest-950 transition-colors duration-150 hover:bg-sun-light"
			>
				<Expand class="size-4" /> Present fullscreen
				<kbd class="rounded bg-forest-950/10 px-1.5 font-mono text-[11px]">F</kbd>
			</button>
			<button
				type="button"
				onclick={() => (dismissed = true)}
				class="grid size-9 place-items-center rounded-full text-cream/60 transition-colors duration-150 hover:bg-cream/5 hover:text-cream"
				aria-label="Stay windowed"
				title="Stay windowed"
			>
				<X class="size-4" />
			</button>
		</div>
	</div>
{/if}

<div
	class="fixed inset-x-0 bottom-0 z-40 flex justify-center px-4 pb-4 transition-[opacity,transform] ease-out-quart"
	style:transition-duration="{DUR.layout}ms"
	style:opacity={hidden ? 0 : 1}
	style:transform={hidden ? 'translate3d(0, 12px, 0)' : 'none'}
	style:pointer-events={hidden ? 'none' : 'auto'}
	onfocusin={() => ((hovering = true), wake())}
	onfocusout={() => (hovering = false)}
	onpointerenter={() => (hovering = true)}
	onpointerleave={() => (hovering = false)}
	role="toolbar"
	aria-label="Presenter controls"
	tabindex="-1"
>
	<div class="flex h-14 w-full max-w-5xl items-center gap-2 rounded-lg bg-stage-raised/90 px-2 text-cream shadow-lg ring-1 ring-stage-line backdrop-blur-md">
		<a
			href={backHref}
			class="inline-flex h-10 items-center gap-2 rounded-md px-3 text-sm text-cream/70 transition-colors duration-150 hover:bg-cream/5 hover:text-cream"
		>
			<ArrowLeft class="size-4" /> <span class="hidden max-w-48 truncate md:inline">{title}</span><span class="md:hidden">Back</span>
		</a>
		<div class="flex flex-1 items-center justify-center gap-2">{@render center?.()}</div>
		{@render actions?.()}
		<button
			type="button"
			onclick={toggleFullscreen}
			class="grid size-10 place-items-center rounded-md text-cream/70 transition-colors duration-150 hover:bg-cream/5 hover:text-cream"
			aria-label={fullscreen ? 'Exit fullscreen (F)' : 'Fullscreen (F)'}
			title={fullscreen ? 'Exit fullscreen (F)' : 'Fullscreen (F)'}
		>
			{#if fullscreen}<Minimize class="size-4" />{:else}<Maximize class="size-4" />{/if}
		</button>
	</div>
</div>
