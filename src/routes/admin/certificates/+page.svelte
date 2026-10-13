<script>
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { Upload, Plus, CloudOff, RotateCcw, FileCode, TriangleAlert } from '@lucide/svelte';
	import PageHeader from '$lib/components/admin/PageHeader.svelte';
	import Button from '$lib/components/ui/Button.svelte';
	import Spinner from '$lib/components/ui/Spinner.svelte';
	import StateMessage from '$lib/components/ui/StateMessage.svelte';
	import Modal from '$lib/components/ui/Modal.svelte';
	import Field from '$lib/components/ui/Field.svelte';
	import CertScope from '$lib/components/certificates/CertScope.svelte';
	import CertificatePage from '$lib/components/certificates/CertificatePage.svelte';
	import { MERGE_FIELDS, SAMPLE_VALUES, STARTERS, uploadedHtmlDesign } from '$lib/certificates/design.js';
	import { applyFields, guessName, importHtml } from '$lib/certificates/htmlImport.js';
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
	/** @type {HTMLInputElement | undefined} */
	let htmlInput = $state();

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
		creating = body.upload ? 'upload' : body.html ? 'html' : (body.starter ?? body.copyOf ?? 'new');
		try {
			const template = await createTemplate(body);
			if (body.upload) {
				appState.showToast('Drag the name and QR code to where they belong.', 'success');
			} else if (body.html) {
				appState.showToast('HTML certificate ready. Drag the QR code (and anything else added) into place.', 'success');
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

	// ── HTML certificates ──
	// The HTML becomes the page and keeps its own fonts and styles; the texts
	// chosen below become merge fields, so each participant's details appear in
	// exactly that text's style.
	const MAPPABLE = ['participant_name', 'team_name', 'award', 'event_title', 'event_dates', 'issue_date', 'certificate_id'];
	const fieldLabel = (key) => MERGE_FIELDS.find((f) => f.key === key)?.label ?? key;

	/** @type {null | { html: string, viewW: number, viewH: number, crop: { x: number, y: number, w: number, h: number }, texts: { text: string, size: number }[], warnings: string[], name: string }} */
	let imported = $state(null);
	/** @type {Record<string, string>} */
	let mapping = $state({});

	async function uploadHtml(files) {
		if (!files?.length || creating) return;
		creating = 'html';
		try {
			const result = await importHtml([...files]);
			mapping = Object.fromEntries(MAPPABLE.map((k) => [k, k === 'participant_name' ? guessName(result.texts) : '']));
			imported = result;
		} catch (error) {
			appState.showToast(error.message || 'Could not read that HTML file.', 'error');
		} finally {
			creating = '';
		}
	}

	/** The certificate as it will be, with the sample participant filled in. */
	const preview = $derived.by(() => {
		if (!imported) return null;
		const { html, missing } = applyFields(imported.html, mapping);
		return { design: uploadedHtmlDesign({ ...imported, html }), missing };
	});
	const alreadyThere = (key) => imported?.html.includes(`{{${key}}}`);

	async function createFromHtml() {
		if (!imported) return;
		const { html } = applyFields(imported.html, mapping);
		const { viewW, viewH, crop, name } = imported;
		await create({ html: { html, viewW, viewH, crop }, name });
		imported = null;
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
			<Upload class="size-4" /> Upload image
		</Button>
		<Button variant="outline" disabled={Boolean(creating)} loading={creating === 'html' && !imported} onclick={() => htmlInput?.click()}>
			<FileCode class="size-4" /> Upload HTML
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

	<input
		bind:this={htmlInput}
		type="file"
		multiple
		accept=".html,.htm,text/html,.css,image/*,.woff,.woff2,.ttf,.otf"
		class="sr-only"
		tabindex="-1"
		aria-hidden="true"
		onchange={(e) => {
			uploadHtml(e.currentTarget.files);
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
				<button type="button" class="starter" disabled={Boolean(creating)} onclick={() => htmlInput?.click()}>
					<span class="thumb upload-drop">
						<span class="material-symbols-outlined">html</span>
						<span>Choose the .html file — and its images or fonts, if they are separate files</span>
						{#if creating === 'html'}<span class="thumb-busy"><span class="spinner"></span></span>{/if}
					</span>
					<span class="starter-name">Upload an HTML certificate</span>
					<span class="starter-desc">
						Keeps your HTML's fonts and styles. Pick the text that is the participant's name and it fills
						in for everyone in that same style.
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

<Modal
	open={Boolean(imported)}
	title="Set up your HTML certificate"
	description="Choose which text on it changes for each participant. The new text keeps that text's font, size and colour."
	size="lg"
	onclose={() => creating !== 'html' && (imported = null)}
>
	{#if imported && preview}
		<div class="html-setup">
			<div class="html-preview">
				<CertificatePage design={preview.design} values={SAMPLE_VALUES} fit />
			</div>
			<p class="text-[12px] text-muted-foreground">Preview with a sample participant, {SAMPLE_VALUES.participant_name}.</p>

			<datalist id="html-texts">
				{#each imported.texts as t (t.text)}<option value={t.text}></option>{/each}
			</datalist>
			<div class="grid gap-3 sm:grid-cols-2">
				{#each MAPPABLE as key (key)}
					{#if alreadyThere(key)}
						<p class="rounded-md bg-muted px-3 py-2 text-[13px]">
							<span class="font-medium">{fieldLabel(key)}</span> — already in the HTML as <code>{`{{${key}}}`}</code>
						</p>
					{:else}
						<Field
							label={fieldLabel(key) + (key === 'participant_name' ? '' : ' (optional)')}
							bind:value={mapping[key]}
							list="html-texts"
							placeholder="Text on the certificate to replace"
							error={preview.missing.includes(key) ? 'That text isn’t on the certificate.' : undefined}
						/>
					{/if}
				{/each}
			</div>
			<ul class="space-y-1 text-[12.5px] text-muted-foreground">
				{#if !alreadyThere('participant_name') && !mapping.participant_name?.trim()}
					<li>• No name text chosen: a name box is added on top instead, for you to style and drag.</li>
				{/if}
				{#if !alreadyThere('qr_code')}
					<li>• A verification QR code is added for you to drag into place. (Or write <code>{'{{qr_code}}'}</code> inside a sized box in the HTML.)</li>
				{/if}
			</ul>
			{#if imported.warnings.length}
				<div class="flex gap-2 rounded-md border border-orange-200 bg-orange-50 px-3 py-2 text-[12.5px] text-orange-900" role="status">
					<TriangleAlert class="mt-0.5 size-4 shrink-0" />
					<div>
						<p class="font-medium">Some files couldn’t be included</p>
						<ul class="mt-0.5">{#each imported.warnings.slice(0, 6) as w (w)}<li>{w}</li>{/each}</ul>
						<p class="mt-1">Upload them together with the HTML file (select them all at once) to include them.</p>
					</div>
				</div>
			{/if}
		</div>
	{/if}
	{#snippet footer()}
		<Button variant="ghost" onclick={() => (imported = null)} disabled={creating === 'html'}>Cancel</Button>
		<Button onclick={createFromHtml} loading={creating === 'html'}>Create certificate</Button>
	{/snippet}
</Modal>
</CertScope>

<style>
	.html-setup {
		display: flex;
		flex-direction: column;
		gap: 0.85rem;
	}

	.html-preview {
		position: relative;
		aspect-ratio: 3 / 2;
		padding: 0.75rem;
		border: 1px solid var(--color-line, var(--color-border));
		border-radius: 0.75rem;
		background: var(--color-surface-2, var(--color-muted));
	}

	.html-preview :global(.cp-frame) {
		box-shadow: 0 4px 18px rgb(0 0 0 / 0.12);
	}

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
