<script lang="ts">
	import type { Snippet } from 'svelte';
	import { fade, scale } from 'svelte/transition';
	import { X } from '@lucide/svelte';

	interface Props {
		open: boolean;
		title: string;
		description?: string;
		size?: 'md' | 'lg';
		onclose: () => void;
		children: Snippet;
		footer?: Snippet;
	}
	let { open, title, description, size = 'md', onclose, children, footer }: Props = $props();

	let panel = $state<HTMLDivElement>();
	let restoreFocus: HTMLElement | null = null;

	$effect(() => {
		if (!open) return;
		restoreFocus = document.activeElement as HTMLElement | null;
		const prev = document.body.style.overflow;
		document.body.style.overflow = 'hidden';
		queueMicrotask(() => panel?.querySelector<HTMLElement>('input, select, textarea, button')?.focus());
		return () => {
			document.body.style.overflow = prev;
			restoreFocus?.focus?.();
		};
	});

	function onkeydown(e: KeyboardEvent) {
		if (!open) return;
		if (e.key === 'Escape') onclose();
		if (e.key === 'Tab' && panel) {
			const items = [...panel.querySelectorAll<HTMLElement>('a, button, input, select, textarea')].filter(
				(el) => !el.hasAttribute('disabled')
			);
			if (!items.length) return;
			const first = items[0];
			const last = items[items.length - 1];
			if (e.shiftKey && document.activeElement === first) {
				e.preventDefault();
				last.focus();
			} else if (!e.shiftKey && document.activeElement === last) {
				e.preventDefault();
				first.focus();
			}
		}
	}
</script>

<svelte:window {onkeydown} />

{#if open}
	<div class="fixed inset-0 z-50 flex items-end justify-center p-0 sm:items-center sm:p-6">
		<button
			type="button"
			aria-label="Close dialog"
			class="absolute inset-0 cursor-default bg-forest-950/55"
			transition:fade={{ duration: 150 }}
			onclick={onclose}
		></button>
		<div
			bind:this={panel}
			role="dialog"
			aria-modal="true"
			aria-labelledby="modal-title"
			class="relative flex max-h-[92dvh] w-full flex-col rounded-t-lg border border-border bg-card shadow-2xl sm:rounded-lg
				{size === 'lg' ? 'sm:max-w-3xl' : 'sm:max-w-lg'}"
			transition:scale={{ duration: 180, start: 0.96 }}
		>
			<header class="sticky top-0 flex items-start justify-between gap-4 border-b border-border px-5 py-4">
				<div>
					<h2 id="modal-title" class="text-base font-semibold text-foreground">{title}</h2>
					{#if description}<p class="mt-0.5 text-[13px] text-muted-foreground">{description}</p>{/if}
				</div>
				<button
					type="button"
					class="-mr-1 rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
					aria-label="Close"
					onclick={onclose}><X class="size-4" /></button
				>
			</header>
			<div class="overflow-y-auto px-5 py-5">{@render children()}</div>
			{#if footer}
				<footer class="flex flex-wrap justify-end gap-2 border-t border-border px-5 py-3">{@render footer()}</footer>
			{/if}
		</div>
	</div>
{/if}
