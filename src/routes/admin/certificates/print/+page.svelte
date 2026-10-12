<script>
	import { onMount } from 'svelte';
	import { page } from '$app/state';
	import CertScope from '$lib/components/certificates/CertScope.svelte';
	import CertificatePage from '$lib/components/certificates/CertificatePage.svelte';
	import { getIssues, verifyUrl } from '$lib/certificates/store';

	/**
	 * The print sheet: every certificate at true size, one to a sheet of paper.
	 * The browser's own dialog does the rest, including Save as PDF.
	 */
	const codes = (page.url.searchParams.get('codes') ?? '')
		.split(',')
		.map((code) => code.trim().toUpperCase())
		.filter(Boolean);

	/** @type {import('$lib/certificates/store').PrintableCertificate[]} */
	let issues = $state([]);
	let status = $state('loading'); // loading | ready | error

	const first = $derived(issues[0]?.design.page);
	const revoked = $derived(issues.filter((i) => i.revoked).length);

	let ready = $state(false);

	// The paper matches the design, so each certificate fills exactly one sheet.
	$effect(() => {
		if (!first) return;
		const style = document.createElement('style');
		style.textContent = `@page { size: ${first.width / 96}in ${first.height / 96}in; margin: 0; }`;
		document.head.append(style);
		return () => style.remove();
	});

	onMount(async () => {
		try {
			issues = await getIssues(codes);
			status = 'ready';
		} catch (error) {
			console.error('[certificates] loading for print failed', error);
			status = 'error';
			return;
		}
		// Wait for the certificate typefaces, or the first pages print in a fallback font.
		try {
			await document.fonts.ready;
		} catch {
			/* print anyway */
		}
		ready = true;
		if (issues.length) setTimeout(() => window.print(), 400);
	});
</script>

<svelte:head>
	<title>Print certificates — ZenCode Admin</title>
</svelte:head>

<CertScope>
<div class="sheet-bar no-print">
	<div>
		<p class="font-semibold text-foreground">
			{issues.length} certificate{issues.length === 1 ? '' : 's'}
		</p>
		<p class="text-xs text-muted-foreground">
			In the print dialog, choose “Save as PDF” for a file, and turn off headers and footers.
			{#if revoked}<span class="text-destructive">
					{revoked} revoked and marked as such.</span
				>{/if}
		</p>
	</div>
	<div class="flex gap-2">
		<button type="button" class="bar-btn" onclick={() => (history.length > 1 ? history.back() : window.close())}>Back</button>
		<button type="button" class="bar-btn solid" disabled={!ready} onclick={() => window.print()}>
			<span class="material-symbols-outlined">print</span> Print
		</button>
	</div>
</div>

{#if status === 'loading'}
	<p class="p-10 text-center text-sm text-muted-foreground">Loading certificates…</p>
{:else if status === 'error'}
	<p class="p-10 text-center text-sm text-destructive">Could not load the certificates. Check your connection and reload.</p>
{:else if !issues.length}
	<p class="p-10 text-center text-sm text-muted-foreground">No certificates to print.</p>
{:else}
	<div class="sheets">
		{#each issues as issue (issue.code)}
			<section
				class="sheet"
				class:is-revoked={issue.revoked}
				aria-label="Certificate for {issue.name}"
			>
				<CertificatePage
					design={issue.design}
					values={issue.values}
					qrText={verifyUrl(issue.code)}
				/>
				{#if issue.revoked}<span class="revoked-stamp">Revoked</span>{/if}
			</section>
		{/each}
	</div>
{/if}
</CertScope>

<style>
	.sheet-bar {
		position: sticky;
		top: 0;
		z-index: 10;
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		justify-content: space-between;
		gap: 1rem;
		padding: 0.85rem 1.5rem;
		border-bottom: 1px solid var(--color-line);
		background: var(--color-surface);
		font-size: 14px;
	}

	.bar-btn {
		display: inline-flex;
		align-items: center;
		gap: 0.35rem;
		height: 2.25rem;
		padding: 0 0.9rem;
		border: 1px solid var(--color-line);
		border-radius: var(--radius-xl);
		font-size: 13px;
		font-weight: 550;
		color: var(--color-ink);
	}

	.bar-btn.solid {
		border-color: transparent;
		background: var(--color-brand);
		color: #fff;
	}

	.bar-btn:disabled {
		opacity: 0.5;
	}

	.bar-btn .material-symbols-outlined {
		font-size: 18px;
	}

	.sheets {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 1.5rem;
		padding: 2rem 1rem 4rem;
		background: var(--color-surface-2);
		overflow-x: auto;
	}

	.sheet {
		position: relative;
		box-shadow: var(--shadow-lg);
	}

	.revoked-stamp {
		position: absolute;
		top: 50%;
		left: 50%;
		padding: 0.5rem 2rem;
		border: 6px solid #c0392b;
		border-radius: 12px;
		font-size: 64px;
		font-weight: 700;
		letter-spacing: 0.1em;
		text-transform: uppercase;
		color: #c0392b;
		opacity: 0.7;
		transform: translate(-50%, -50%) rotate(-18deg);
		pointer-events: none;
	}

	@media print {
		:global(html),
		:global(body) {
			background: #fff !important;
		}

		.no-print {
			display: none !important;
		}

		.sheets {
			display: block;
			padding: 0;
			background: none;
		}

		.sheet {
			box-shadow: none;
			break-after: page;
			page-break-after: always;
			print-color-adjust: exact;
			-webkit-print-color-adjust: exact;
		}

		.sheet:last-child {
			break-after: auto;
			page-break-after: auto;
		}
	}
</style>
