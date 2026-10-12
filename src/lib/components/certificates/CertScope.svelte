<script lang="ts">
	import type { Snippet } from 'svelte';
	import { fly } from 'svelte/transition';
	import { FONTS_HREF } from '$lib/certificates/design.js';
	import { certToast } from '$lib/certificates/toast.svelte';

	/**
	 * Wraps every certificate page. The editor and print sheet came from
	 * SymphoTrack and are styled with its token names (--color-ink-mute,
	 * --color-surface…); they are mapped onto ZenCode's palette here, so those
	 * components stay as they were. Also loads the certificate typefaces and
	 * the icon font they use.
	 */
	let { children, class: cls = '' }: { children: Snippet; class?: string } = $props();
</script>

<svelte:head>
	<link rel="preconnect" href="https://fonts.googleapis.com" />
	<link rel="stylesheet" href={FONTS_HREF} />
	<link
		rel="stylesheet"
		href="https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:opsz,wght,FILL,GRAD@20..48,300..500,0..1,0&display=block"
	/>
</svelte:head>

<div class="cert-scope {cls}">
	{@render children()}
</div>

{#if certToast.current}
	{@const t = certToast.current}
	<div class="pointer-events-none fixed inset-x-0 bottom-5 z-[60] flex justify-center px-4" aria-live="polite">
		{#key t.id}
			<p
				class="pointer-events-auto max-w-lg rounded-md border px-4 py-2.5 text-sm shadow-lg
					{t.tone === 'error' ? 'border-red-200 bg-red-50 text-destructive' : 'border-border bg-forest-900 text-white'}"
				in:fly={{ y: 8, duration: 160 }}
			>
				{t.text}
			</p>
		{/key}
	</div>
{/if}

<style>
	.cert-scope {
		--color-ink: var(--color-foreground);
		--color-ink-soft: #3b4a3e;
		--color-ink-mute: var(--color-muted-foreground);
		--color-ink-faint: #97a297;
		--color-line: var(--color-border);
		--color-line-2: var(--color-input);
		--color-surface: var(--color-card);
		--color-surface-2: var(--color-muted);
		--color-surface-3: var(--color-accent);
		--color-brand: var(--color-primary);
		--color-brand-mid: var(--color-primary-hover);
		--color-brand-strong: var(--color-forest-700);
		--color-brand-soft: var(--color-green-100);
		--color-brand-ink: var(--color-forest-800);
		--color-danger: var(--color-destructive);
		--color-danger-strong: var(--color-destructive);
		--color-danger-faint: #fef3f2;
		--color-danger-soft2: #fecdca;
		--color-warn-soft: #fdf6e3;
		--color-warn-ink: #8a5a00;
		--radius-lg: 0.5rem;
		--radius-xl: 0.625rem;
		--radius-card: 0.75rem;
		--radius-panel: 0.75rem;
		--shadow-sm: 0 1px 2px rgb(16 24 16 / 0.06);
		--shadow-md: 0 4px 12px rgb(16 24 16 / 0.08);
		--shadow-lg: 0 12px 28px rgb(16 24 16 / 0.12);
		--shadow-xl: 0 20px 48px rgb(16 24 16 / 0.16);
		--duration-fast: 150ms;
	}

	.cert-scope :global(.material-symbols-outlined) {
		font-family: 'Material Symbols Outlined';
		font-weight: normal;
		font-style: normal;
		line-height: 1;
		letter-spacing: normal;
		text-transform: none;
		display: inline-block;
		white-space: nowrap;
		direction: ltr;
		font-feature-settings: 'liga';
		-webkit-font-smoothing: antialiased;
	}
</style>
