<script>
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { Upload, Plus, CloudOff, RotateCcw } from '@lucide/svelte';
	import PageHeader from '$lib/components/admin/PageHeader.svelte';
	import Button from '$lib/components/ui/Button.svelte';
	import Spinner from '$lib/components/ui/Spinner.svelte';
	import StateMessage from '$lib/components/ui/StateMessage.svelte';
	import CertScope from '$lib/components/certificates/CertScope.svelte';
	import CertificatePage from '$lib/components/certificates/CertificatePage.svelte';
	import { SAMPLE_VALUES, STARTERS } from '$lib/certificates/design.js';
	import { readImage } from '$lib/certificates/imageData.js';
	import { createTemplate, deleteTemplate, listTemplates } from '$lib/certificates/store';
	import { certToast as appState } from '$lib/certificates/toast.svelte';

	/** @type {import('$lib/certificates/store').CertificateTemplate[]} */
	let templates = $state([]);
	let status = $state('loading'); // loading | ready | error

	let creating = $state('');
	let pickerOpen = $state(false);
	let busyId = $state('');
	let dragging = $state(false);
	/** @type {HTMLInputElement | undefined} */
	let fileInput = $state();

	// Thumbnails for the starter picker, built once.
	const starters = STARTERS.map((s) => ({ ...s, design: s.build() }));

	const updated = (at) =>
		at
			? new Date(at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })
			: 'just now';

	async function load() {
		status = 'loading';
		try {
			templates = await listTemplates();
			status = 'ready';
		} catch (error) {
			console.error('[certificates] loading failed', error);
			status = error?.code === 'permission-denied' ? 'denied' : 'error';
		}
	}

	onMount(load);

	async function create(body) {
		creating = body.upload ? 'upload' : (body.starter ?? body.copyOf ?? 'new');
		try {
			const template = await createTemplate(body);
			if (body.upload) {
				appState.showToast('Drag the name and QR code to where they belong.', 'success');
			}
			await goto(`/admin/certificates/${template.id}`);
		} catch (error) {
			appState.showToast(error.message || 'Could not create the certificate.', 'error');
		} finally {
			creating = '';
		}
	}

	/**
	 * A certificate someone already has (a sponsor's, say): it becomes the
	 * page, with the participant's name and a verification QR laid on top.
	 */
	async function upload(file) {
		if (!file || creating) return;
		creating = 'upload';
		try {
			const image = await readImage(file, 1600, { opaque: true });
			const name = file.name.replace(/\.[^.]+$/, '').replace(/[-_]+/g, ' ');
			await create({ upload: image, name });
		} catch (error) {
			appState.showToast(error.message || 'Could not read that image.', 'error');
			creating = '';
		}
	}

	function onDrop(event) {
		event.preventDefault();
		dragging = false;
		upload(event.dataTransfer?.files?.[0]);
	}

	async function remove(template) {
		if (
			!confirm(
				`Delete "${template.name}"? Certificates already issued from it stay valid and printable.`
			)
		)
			return;
		busyId = template.id;
		try {
			await deleteTemplate(template.id);
			templates = templates.filter((t) => t.id !== template.id);
			appState.showToast(`Deleted "${template.name}".`, 'success');
		} catch (error) {
			appState.showToast(error.message || 'Could not delete it.', 'error');
		} finally {
			busyId = '';
		}
	}
</script>

<svelte:head><title>Certificates — ZenCode Admin</title></svelte:head>

<CertScope>
<PageHeader
	eyebrow="Engage"
	title="Certificates"
	description="Design certificates, then issue them to Hackathon and Pitch Fest teams. Each carries a code anyone can verify."
>
	{#snippet actions()}
		<Button variant="outline" disabled={Boolean(creating)} onclick={() => fileInput?.click()}>
			<Upload class="size-4" /> Upload certificate
		</Button>
		<Button onclick={() => (pickerOpen = !pickerOpen)}><Plus class="size-4" /> New certificate</Button>
	{/snippet}
</PageHeader>

<div class="space-y-6">
	<input
		bind:this={fileInput}
		type="file"
		accept="image/png,image/jpeg,image/webp"
		class="sr-only"
		tabindex="-1"
		aria-hidden="true"
		onchange={(e) => {
			upload(e.currentTarget.files?.[0]);
			e.currentTarget.value = '';
		}}
	/>

	{#if pickerOpen || (status === 'ready' && !templates.length)}
		<section class="picker" aria-labelledby="starter-heading">
			<div class="flex items-center justify-between gap-3">
				<div>
					<h2 id="starter-heading" class="text-[15px] font-semibold text-foreground">Start from</h2>
					<p class="text-[13px] text-muted-foreground">Every part of it can be changed afterwards.</p>
				</div>
				{#if templates.length}
					<button
						type="button"
						class="icon-btn"
						aria-label="Close"
						onclick={() => (pickerOpen = false)}
					>
						<span class="material-symbols-outlined">close</span>
					</button>
				{/if}
			</div>
			<div class="starter-grid">
				<button
					type="button"
					class="starter"
					disabled={Boolean(creating)}
					onclick={() => fileInput?.click()}
					ondragover={(e) => {
						e.preventDefault();
						dragging = true;
					}}
					ondragleave={() => (dragging = false)}
					ondrop={onDrop}
				>
					<span class="thumb upload-drop" class:is-dragging={dragging}>
						<span class="material-symbols-outlined">upload_file</span>
						<span>Drop an image here or click to choose</span>
						{#if creating === 'upload'}<span class="thumb-busy"><span class="spinner"></span></span
							>{/if}
					</span>
					<span class="starter-name">Upload a certificate</span>
					<span class="starter-desc">
						Use a sponsor's or partner's certificate (PNG, JPEG or WebP). We add the participant's name
						and a verification QR code.
					</span>
				</button>
				{#each starters as s (s.id)}
					<button
						type="button"
						class="starter"
						disabled={Boolean(creating)}
						onclick={() => create({ starter: s.id })}
					>
						<span class="thumb">
							<span class="thumb-page">
								<CertificatePage design={s.design} values={SAMPLE_VALUES} fit />
							</span>
							{#if creating === s.id}<span class="thumb-busy"><span class="spinner"></span></span
								>{/if}
						</span>
						<span class="starter-name">{s.name}</span>
						<span class="starter-desc">{s.description}</span>
					</button>
				{/each}
			</div>
		</section>
	{/if}

	{#if status === 'loading'}
		<div class="flex items-center justify-center gap-3 py-16 text-sm text-muted-foreground"><Spinner /> Loading certificates…</div>
	{:else if status === 'denied'}
		<div class="rounded-lg border border-border bg-card">
			<StateMessage
				tone="error"
				icon={CloudOff}
				title="Firestore is blocking certificates."
				description="The certificate rules in firestore.rules are not published to Firebase yet. Publish them (Firebase console → Firestore → Rules), then retry."
			>
				<Button variant="outline" onclick={load}><RotateCcw class="size-4" /> Retry</Button>
			</StateMessage>
		</div>
	{:else if status === 'error'}
		<div class="rounded-lg border border-border bg-card">
			<StateMessage
				tone="error"
				icon={CloudOff}
				title="Could not load certificates."
				description="Check your connection, then retry."
			>
				<Button variant="outline" onclick={load}><RotateCcw class="size-4" /> Retry</Button>
			</StateMessage>
		</div>
	{:else if templates.length}
		<section aria-label="Your certificates">
			<div class="grid">
				{#each templates as t (t.id)}
					<article class="card" class:is-busy={busyId === t.id}>
						<a href="/admin/certificates/{t.id}" class="thumb" aria-label="Edit {t.name}">
							<span class="thumb-page">
								<CertificatePage design={t.design} values={SAMPLE_VALUES} fit />
							</span>
						</a>
						<div class="card-body">
							<div class="min-w-0">
								<a href="/admin/certificates/{t.id}" class="card-name">{t.name}</a>
								<p class="card-meta">
									{t.issued ?? 0} issued · edited {updated(t.updatedAt)}{t.updatedBy ? ` by ${t.updatedBy}` : ''}
								</p>
							</div>
							<div class="card-actions">
								<a href="/admin/certificates/{t.id}/issue" class="btn-sm is-solid">
									<span class="material-symbols-outlined">send</span> Issue
								</a>
								<a href="/admin/certificates/{t.id}" class="btn-sm">
									<span class="material-symbols-outlined">edit</span> Edit
								</a>
								<button
									type="button"
									class="icon-btn"
									title="Duplicate"
									aria-label="Duplicate {t.name}"
									disabled={Boolean(creating)}
									onclick={() => create({ copyOf: t.id })}
								>
									<span class="material-symbols-outlined">content_copy</span>
								</button>
								<button
									type="button"
									class="icon-btn danger"
									title="Delete"
									aria-label="Delete {t.name}"
									onclick={() => remove(t)}
								>
									<span class="material-symbols-outlined">delete</span>
								</button>
							</div>
						</div>
					</article>
				{/each}
			</div>
		</section>
	{/if}
</div>
</CertScope>

<style>
	/* Same footprint as a starter thumbnail, so the row lines up. */
	.upload-drop {
		align-content: center;
		padding: 1rem;
		gap: 0.4rem;
		border-style: dashed;
		border-width: 2px;
		font-size: 12.5px;
		color: var(--color-ink-mute);
		text-align: center;
	}

	.upload-drop .material-symbols-outlined {
		font-size: 32px;
		color: var(--color-brand);
	}

	.upload-drop.is-dragging {
		border-color: var(--color-brand);
		background: color-mix(in oklab, var(--color-brand) 8%, var(--color-surface-2));
	}

	.picker {
		padding: 1.25rem;
		border: 1px solid var(--color-line);
		border-radius: var(--radius-panel);
		background: var(--color-surface);
		box-shadow: var(--shadow-sm);
	}

	.starter-grid {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(240px, 1fr));
		gap: 1rem;
		margin-top: 1rem;
	}

	.starter {
		display: flex;
		flex-direction: column;
		align-items: flex-start;
		gap: 0.2rem;
		text-align: left;
	}

	.starter:disabled {
		cursor: progress;
	}

	.starter .thumb {
		margin-bottom: 0.5rem;
	}

	.starter:hover .thumb {
		border-color: var(--color-brand);
	}

	.starter-name {
		font-size: 14px;
		font-weight: 600;
		color: var(--color-ink);
	}

	.starter-desc {
		font-size: 12.5px;
		color: var(--color-ink-mute);
	}

	.grid {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));
		gap: 1rem;
	}

	.card {
		display: flex;
		flex-direction: column;
		overflow: hidden;
		border: 1px solid var(--color-line);
		border-radius: var(--radius-card);
		background: var(--color-surface);
		box-shadow: var(--shadow-sm);
		transition:
			border-color var(--duration-fast),
			box-shadow var(--duration-fast),
			opacity var(--duration-fast);
	}

	.card:hover {
		border-color: var(--color-line-2);
		box-shadow: var(--shadow-md);
	}

	.card.is-busy {
		opacity: 0.5;
		pointer-events: none;
	}

	.card .thumb {
		border: 0;
		border-bottom: 1px solid var(--color-line);
		border-radius: 0;
	}

	/*
	 * The page sits on a neutral mat of one fixed shape, fitted and centred
	 * whatever its size or orientation, so every card in a row lines up.
	 */
	.thumb {
		position: relative;
		display: grid;
		width: 100%;
		aspect-ratio: 3 / 2;
		place-items: center;
		overflow: hidden;
		border: 1px solid var(--color-line);
		border-radius: var(--radius-xl);
		background: var(--color-surface-2);
		transition: border-color var(--duration-fast);
	}

	.thumb-page {
		position: absolute;
		inset: 0.875rem;
	}

	.thumb :global(.cp-frame) {
		box-shadow: var(--shadow-md);
	}

	.thumb-busy {
		position: absolute;
		inset: 0;
		display: grid;
		place-items: center;
		background: color-mix(in oklab, var(--color-surface) 60%, transparent);
	}

	.spinner {
		width: 20px;
		height: 20px;
		border: 2px solid var(--color-brand);
		border-right-color: transparent;
		border-radius: 50%;
		animation: spin 0.65s linear infinite;
	}

	@keyframes spin {
		to {
			rotate: 360deg;
		}
	}

	.card-body {
		display: flex;
		flex-direction: column;
		gap: 0.75rem;
		padding: 0.9rem 1rem 1rem;
	}

	.card-name {
		display: block;
		overflow: hidden;
		font-size: 14.5px;
		font-weight: 600;
		color: var(--color-ink);
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.card-name:hover {
		text-decoration: underline;
	}

	.card-meta {
		margin-top: 0.1rem;
		font-size: 12px;
		color: var(--color-ink-mute);
	}

	.card-actions {
		display: flex;
		align-items: center;
		gap: 0.35rem;
	}

	.btn-sm {
		display: inline-flex;
		align-items: center;
		gap: 0.3rem;
		height: 2rem;
		padding: 0 0.7rem;
		border: 1px solid var(--color-line);
		border-radius: var(--radius-lg);
		font-size: 12.5px;
		font-weight: 550;
		color: var(--color-ink-soft);
		transition:
			background-color var(--duration-fast),
			color var(--duration-fast);
	}

	.btn-sm:hover {
		background: var(--color-surface-2);
		color: var(--color-ink);
	}

	.btn-sm.is-solid {
		border-color: transparent;
		background: var(--color-brand);
		color: #fff;
	}

	.btn-sm.is-solid:hover {
		background: var(--color-brand-mid);
	}

	.btn-sm .material-symbols-outlined {
		font-size: 16px;
	}

	.icon-btn {
		display: grid;
		place-items: center;
		width: 2rem;
		height: 2rem;
		border-radius: var(--radius-lg);
		color: var(--color-ink-mute);
		transition:
			background-color var(--duration-fast),
			color var(--duration-fast);
	}

	.card-actions .icon-btn:first-of-type {
		margin-left: auto;
	}

	.icon-btn:hover {
		background: var(--color-surface-2);
		color: var(--color-ink);
	}

	.icon-btn.danger:hover {
		color: var(--color-danger);
	}

	.icon-btn .material-symbols-outlined {
		font-size: 18px;
	}
</style>
