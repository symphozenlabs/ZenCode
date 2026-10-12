<script>
	import { page } from '$app/state';
	import Logo from '$lib/components/site/Logo.svelte';
	import CertScope from '$lib/components/certificates/CertScope.svelte';
	import CertificatePage from '$lib/components/certificates/CertificatePage.svelte';
	import { verifyCode, verifyUrl } from '$lib/certificates/store';

	const code = $derived(String(page.params.code ?? '').toUpperCase());

	/** @type {import('$lib/certificates/store').PrintableCertificate | null} */
	let issue = $state(null);
	let failed = $state(false);
	let checking = $state(true);

	$effect(() => {
		const wanted = code;
		checking = true;
		failed = false;
		verifyCode(wanted)
			.then((found) => {
				if (wanted === code) issue = found;
			})
			.catch((error) => {
				console.error('Verifying a certificate failed:', error);
				failed = true;
			})
			.finally(() => (checking = false));
	});

	const status = $derived(
		checking ? 'checking' : failed ? 'error' : !issue ? 'unknown' : issue.revoked ? 'revoked' : 'valid'
	);
	const issuedOn = $derived(
		issue?.issuedAt
			? new Date(issue.issuedAt).toLocaleDateString('en-IN', {
					day: 'numeric',
					month: 'long',
					year: 'numeric'
				})
			: (issue?.values.issue_date ?? '')
	);

	let frameWidth = $state(720);
	const scale = $derived(issue ? Math.min(1, frameWidth / issue.design.page.width) : 1);
</script>

<svelte:head>
	<title>Verify certificate {code} — ZenCode</title>
	<meta name="robots" content="noindex" />
</svelte:head>

<CertScope class="min-h-dvh bg-background">
<main class="verify">
	<header class="top">
		<a href="/" class="brand"><Logo /></a>
		<span class="tag">Certificate check</span>
	</header>

	<section class="result result-{status}" aria-live="polite">
		<span class="icon material-symbols-outlined">
			{status === 'valid'
				? 'verified'
				: status === 'revoked'
					? 'gpp_bad'
					: status === 'error'
						? 'cloud_off'
						: status === 'checking'
							? 'hourglass_top'
							: 'help'}
		</span>
		<div class="min-w-0">
			<h1>
				{#if status === 'checking'}Checking certificate…
				{:else if status === 'valid'}Genuine certificate
				{:else if status === 'revoked'}This certificate was revoked
				{:else if status === 'error'}Could not check right now
				{:else}No certificate with this code{/if}
			</h1>
			<p>
				{#if status === 'checking'}
					Looking up <span class="mono">{code}</span>.
				{:else if status === 'valid'}
					Issued to <strong>{issue.name}</strong>{issue.teamName ? ` of team ${issue.teamName}` : ''} on {issuedOn}.
				{:else if status === 'revoked'}
					It was issued to {issue.name}{issue.teamName ? ` of team ${issue.teamName}` : ''} on {issuedOn}, and is no longer valid.
				{:else if status === 'error'}
					Please try again in a moment.
				{:else}
					Check the code printed on the certificate. It looks like <span class="mono"
						>ZC-XXXX-XXXX</span
					>.
				{/if}
			</p>
		</div>
	</section>

	{#if issue}
		<dl class="facts">
			<div>
				<dt>Certificate</dt>
				<dd class="mono">{issue.code}</dd>
			</div>
			{#if issue.values.event_title}<div>
					<dt>For</dt>
					<dd>{issue.values.event_title}</dd>
				</div>{/if}
			{#if issue.values.event_dates}<div>
					<dt>Held</dt>
					<dd>{issue.values.event_dates}</dd>
				</div>{/if}
			{#if issue.award}<div>
					<dt>Award</dt>
					<dd>{issue.award}</dd>
				</div>{/if}
		</dl>

		<div class="frame" bind:clientWidth={frameWidth} class:is-revoked={issue.revoked}>
			<CertificatePage
				design={issue.design}
				values={issue.values}
				qrText={verifyUrl(issue.code)}
				{scale}
			/>
		</div>
	{/if}
</main>
</CertScope>

<style>
	.verify {
		width: 100%;
		max-width: 60rem;
		margin: 0 auto;
		padding: 1.25rem 1rem 3rem;
	}

	.top {
		display: flex;
		align-items: center;
		justify-content: space-between;
	}

	.brand {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		font-size: 15px;
		font-weight: 600;
		color: var(--color-ink);
	}


	.tag {
		padding: 0.25rem 0.65rem;
		border-radius: 9999px;
		background: var(--color-surface-2);
		font-size: 12px;
		color: var(--color-ink-mute);
	}

	.result {
		display: flex;
		align-items: flex-start;
		gap: 0.9rem;
		margin-top: 2rem;
		padding: 1.25rem;
		border: 1px solid var(--color-line);
		border-radius: var(--radius-panel);
		background: var(--color-surface);
		box-shadow: var(--shadow-sm);
	}

	.icon {
		display: grid;
		place-items: center;
		width: 2.75rem;
		height: 2.75rem;
		flex-shrink: 0;
		border-radius: 9999px;
		font-size: 24px;
	}

	.result-valid .icon {
		background: var(--color-brand-soft);
		color: var(--color-brand-strong);
	}

	.result-valid {
		border-color: color-mix(in oklab, var(--color-brand) 40%, var(--color-line));
	}

	.result-checking .icon {
		background: var(--color-surface-2);
		color: var(--color-ink-mute);
	}

	.result-revoked .icon,
	.result-unknown .icon,
	.result-error .icon {
		background: var(--color-danger-faint);
		color: var(--color-danger-strong);
	}

	h1 {
		font-size: 1.25rem;
		font-weight: 600;
		letter-spacing: -0.02em;
		color: var(--color-ink);
	}

	.result p {
		margin-top: 0.25rem;
		font-size: 14px;
		line-height: 1.5;
		color: var(--color-ink-mute);
	}

	.result strong {
		color: var(--color-ink);
	}

	.mono {
		font-family: var(--font-mono);
	}

	.facts {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(12rem, 1fr));
		gap: 0.75rem 1.5rem;
		margin-top: 1rem;
		padding: 1rem 1.25rem;
		border: 1px solid var(--color-line);
		border-radius: var(--radius-card);
		background: var(--color-surface);
	}

	.facts dt {
		font-size: 12px;
		color: var(--color-ink-mute);
	}

	.facts dd {
		margin-top: 0.1rem;
		font-size: 14px;
		font-weight: 500;
		color: var(--color-ink);
	}

	.frame {
		display: flex;
		justify-content: center;
		margin-top: 1.5rem;
	}

	.frame :global(.cp-frame) {
		box-shadow: var(--shadow-lg);
	}

	.frame.is-revoked {
		filter: grayscale(1);
		opacity: 0.6;
	}
</style>
