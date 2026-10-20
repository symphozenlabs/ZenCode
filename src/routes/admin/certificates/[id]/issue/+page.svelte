<script lang="ts">
	import { page } from '$app/state';
	import { SvelteSet } from 'svelte/reactivity';
	import {
		ArrowLeft,
		ChevronDown,
		CloudOff,
		Code2,
		FileArchive,
		Presentation,
		Save,
		Search,
		Ban,
		RotateCcw,
		TriangleAlert,
		Users,
		Mail,
		MailCheck,
		MailWarning
	} from '@lucide/svelte';
	import { EVENT_LABELS, type EventId } from '$lib/config/site';
	import { registrations } from '$lib/stores/registrations.svelte';
	import { siteConfig } from '$lib/stores/site-config.svelte';
	import { referenceId, teamLabel, type Registration } from '$lib/registrations/model';
	import Button from '$lib/components/ui/Button.svelte';
	import Spinner from '$lib/components/ui/Spinner.svelte';
	import StateMessage from '$lib/components/ui/StateMessage.svelte';
	import StatusBadge from '$lib/components/ui/StatusBadge.svelte';
	import CertScope from '$lib/components/certificates/CertScope.svelte';
	import CertificatePage from '$lib/components/certificates/CertificatePage.svelte';
	import { fieldsUsed, localDate, valuesFor } from '$lib/certificates/design.js';
	import {
		emailCertificate,
		getIssues,
		getTemplate,
		issueCertificates,
		issuedFor,
		recipientKey,
		setRevoked,
		verifyUrl,
		type CertificateTemplate,
		type EventFacts,
		type IssuedCertificate,
		type Recipient
	} from '$lib/certificates/store';
	import { certificatePng } from '$lib/certificates/render.js';
	import { saveBlob, zipBlob } from '$lib/certificates/zip.js';
	import { certToast } from '$lib/certificates/toast.svelte';

	$effect(() => siteConfig.subscribe());

	// ── The certificate ──
	let template = $state<CertificateTemplate | null>(null);
	let templateStatus = $state<'loading' | 'ready' | 'missing' | 'error'>('loading');

	$effect(() => {
		const id = page.params.id ?? '';
		templateStatus = 'loading';
		getTemplate(id)
			.then((t) => {
				template = t;
				templateStatus = t ? 'ready' : 'missing';
			})
			.catch((err) => {
				console.error('[certificates] loading template failed', err);
				templateStatus = 'error';
			});
	});

	// ── The event ──
	const EVENTS: { id: EventId; icon: typeof Code2 }[] = [
		{ id: 'hackathon', icon: Code2 },
		{ id: 'pitch-fest', icon: Presentation }
	];
	let event = $state<EventId>(page.url.searchParams.get('event') === 'pitch-fest' ? 'pitch-fest' : 'hackathon');

	const facts = $derived<EventFacts>({
		title: siteConfig.value.events[event]?.title || EVENT_LABELS[event],
		startDate: siteConfig.value.events[event]?.startDate ?? '',
		endDate: siteConfig.value.events[event]?.endDate ?? '',
		venue: siteConfig.value.venue ?? ''
	});

	function chooseEvent(id: EventId) {
		if (id === event) return;
		event = id;
		selected.clear();
		expanded.clear();
		previewKey = '';
		const url = new URL(page.url);
		url.searchParams.set('event', id);
		history.replaceState(history.state, '', url);
	}

	// Certificates already issued from this template at this event.
	let existing = $state(new Map<string, IssuedCertificate>());
	let existingStatus = $state<'loading' | 'ready' | 'error'>('loading');

	async function loadExisting() {
		if (!template) return;
		existingStatus = 'loading';
		try {
			existing = await issuedFor(template.id, event);
			existingStatus = 'ready';
		} catch (err) {
			console.error('[certificates] loading issued failed', err);
			existingStatus = 'error';
		}
	}

	$effect(() => {
		// Reload whenever the template or the event changes.
		void template?.id;
		void event;
		loadExisting();
	});

	// ── Teams and their members ──
	type Row = Recipient & { key: string; email: string; issue: IssuedCertificate | null };
	type Team = { reg: Registration; label: string; rows: Row[] };

	const teams = $derived<Team[]>(
		registrations.items
			.filter((r) => r.event === event)
			.map((reg) => {
				const label = teamLabel(reg);
				const members = reg.members.length
					? reg.members
					: [{ memberNumber: 1, name: reg.teamLeader.name, admissionNumber: reg.teamLeader.admissionNumber, email: reg.teamLeader.email }];
				const rows = [...members]
					.sort((a, b) => a.memberNumber - b.memberNumber)
					.map((m) => {
						const base = {
							registrationId: reg.id,
							memberNumber: m.memberNumber,
							name: m.name || '(no name)',
							admissionNumber: m.admissionNumber.trim().toUpperCase(),
							teamName: reg.teamName || label
						};
						const key = recipientKey(base);
						return { ...base, key, email: m.email, issue: existing.get(key) ?? null };
					});
				return { reg, label, rows };
			})
			.sort((a, b) => a.label.localeCompare(b.label))
	);

	let query = $state('');
	let show = $state<'all' | 'issued' | 'pending' | 'unsent'>('all');
	const selected = new SvelteSet<string>();
	const expanded = new SvelteSet<string>();

	const held = (r: Row) => Boolean(r.issue && !r.issue.revoked);
	/** Issued and saved, but not emailed to its holder yet. */
	const unsent = (r: Row) => held(r) && !r.issue!.emailedAt;

	const counts = $derived({
		all: teams.length,
		pending: teams.filter((t) => !t.rows.every(held)).length,
		issued: teams.filter((t) => t.rows.some(held)).length,
		unsent: teams.filter((t) => t.rows.some(unsent)).length
	});

	const visible = $derived.by(() => {
		const q = query.trim().toLowerCase();
		return teams.filter((t) => {
			if (show === 'issued' && !t.rows.some(held)) return false;
			if (show === 'pending' && t.rows.every(held)) return false;
			if (show === 'unsent' && !t.rows.some(unsent)) return false;
			if (!q) return true;
			return [t.label, referenceId(t.reg.id), ...t.rows.flatMap((r) => [r.name, r.admissionNumber, r.email, r.issue?.code])].some((v) =>
				String(v ?? '').toLowerCase().includes(q)
			);
		});
	});

	const allRows = $derived(teams.flatMap((t) => t.rows));
	const chosen = $derived(allRows.filter((r) => selected.has(r.key)));
	const chosenTeams = $derived(new Set(chosen.map((r) => r.registrationId)).size);
	const alreadyHeld = $derived(chosen.filter(held).length);

	const teamState = (t: Team) => {
		const n = t.rows.filter((r) => selected.has(r.key)).length;
		return n === 0 ? 'none' : n === t.rows.length ? 'all' : 'some';
	};

	function toggleTeam(t: Team) {
		const on = teamState(t) !== 'all';
		for (const r of t.rows) on ? selected.add(r.key) : selected.delete(r.key);
		previewKey = t.rows[0]?.key ?? '';
	}

	function toggleMember(r: Row) {
		if (selected.has(r.key)) selected.delete(r.key);
		else selected.add(r.key);
		previewKey = r.key;
	}

	const allVisibleChosen = $derived(visible.length > 0 && visible.every((t) => teamState(t) === 'all'));

	function toggleAllVisible() {
		const clear = allVisibleChosen;
		for (const t of visible) for (const r of t.rows) clear ? selected.delete(r.key) : selected.add(r.key);
	}

	function toggleExpanded(id: string) {
		if (expanded.has(id)) expanded.delete(id);
		else expanded.add(id);
	}

	// ── Award ──
	let award = $state('');
	const AWARDS = ['Winner', 'First Place', 'Second Place', 'Third Place', 'Runner-up', 'Best Innovation', 'Special Mention'];

	// ── Preview ──
	let previewKey = $state('');
	const previewing = $derived(
		allRows.find((r) => r.key === previewKey) ?? chosen[0] ?? teams[0]?.rows[0] ?? null
	);
	const previewValues = $derived(
		previewing
			? valuesFor({
					event: facts,
					recipient: previewing,
					award: award.trim() || previewing.issue?.award || '',
					code: previewing.issue?.code ?? 'ZC-····-····',
					issuedOn: localDate()
				})
			: null
	);
	const empties = $derived.by(() => {
		if (!template || !previewValues) return [];
		const values = previewValues as Record<string, string>;
		return fieldsUsed(template.design).filter((k: string) => !String(values[k] ?? '').trim());
	});
	let previewWidth = $state(416);

	// ── Issue, download and email ──
	let issuing = $state(false);
	/** Emailing progress, while it runs */
	let sending = $state<{ done: number; total: number; failed: number } | null>(null);
	/** Drawing images for the ZIP, while it runs */
	let zipping = $state<{ done: number; total: number } | null>(null);
	const busy = $derived(issuing || sending !== null || zipping !== null);
	const notIssued = $derived(chosen.filter((r) => !r.issue).length);
	const revokedChosen = $derived(chosen.filter((r) => r.issue?.revoked).length);

	const asRecipient = ({ registrationId, memberNumber, name, admissionNumber, teamName }: Row): Recipient => ({
		registrationId,
		memberNumber,
		name,
		admissionNumber,
		teamName
	});
	const noEmail = $derived(chosen.filter((r) => !r.email.trim()).length);

	/**
	 * Issues the selection. 'save' only stores the certificates: nobody is
	 * emailed, and the selection stays so they can be downloaded and checked
	 * before the soft copies go out with "Email issued".
	 */
	async function issue(then: 'save' | 'email') {
		if (!template || !chosen.length) return;
		issuing = true;
		let codes: string[] = [];
		try {
			codes = await issueCertificates({
				template,
				event,
				facts,
				recipients: chosen.map(asRecipient),
				award,
				existing
			});
			const many = `${codes.length} certificate${codes.length === 1 ? '' : 's'}`;
			if (then === 'save') {
				certToast.showToast(`${many} saved. Nobody has been emailed yet — download to check, then email them.`, 'success');
			} else {
				certToast.showToast(`${many} issued.`, 'success');
				selected.clear();
			}
			await loadExisting();
		} catch (err) {
			console.error('[certificates] issuing failed', err);
			certToast.showToast((err as Error).message || 'Could not issue the certificates.', 'error');
			return;
		} finally {
			issuing = false;
		}
		if (then === 'email') await sendEmails(codes);
	}

	/**
	 * Emails each certificate to its holder's registered address, a few at a
	 * time. Every PDF is drawn here in the browser, so the tab must stay open.
	 */
	async function sendEmails(codes: string[]) {
		if (!codes.length) return;
		const progress = { done: 0, total: codes.length, failed: 0 };
		sending = progress;
		const failures: string[] = [];
		try {
			const issues = await getIssues(codes);
			let next = 0;
			const worker = async () => {
				while (next < issues.length) {
					const one = issues[next++];
					try {
						await emailCertificate(one);
					} catch (err) {
						failures.push((err as Error).message);
						progress.failed++;
					}
					progress.done++;
					sending = { ...progress };
				}
			};
			await Promise.all([worker(), worker(), worker()]);
			const sent = progress.done - progress.failed;
			if (failures.length) {
				const more = failures.length > 1 ? ` (+${failures.length - 1} more)` : '';
				certToast.showToast(`Emailed ${sent} of ${codes.length}. ${failures[0]}${more}`, 'error');
			} else {
				certToast.showToast(`Emailed ${sent} certificate${sent === 1 ? '' : 's'}.`, 'success');
			}
		} catch (err) {
			console.error('[certificates] emailing failed', err);
			certToast.showToast((err as Error).message || 'Could not email the certificates.', 'error');
		} finally {
			sending = null;
			await loadExisting();
		}
	}

	const safeName = (s: string) =>
		s.replace(/[\\/:*?"<>|\x00-\x1f]+/g, '-').replace(/\s+/g, ' ').trim().slice(0, 100) || 'certificate';

	/**
	 * Downloads the selection as one ZIP of full-quality PNGs, one per person.
	 * Anyone selected who doesn't hold the certificate yet is issued it first
	 * (a revoked one is restored, keeping its code), so every image carries a
	 * real code; nobody is emailed.
	 */
	async function downloadZip() {
		if (!template || !chosen.length) return;
		const rows = chosen;
		const missing = rows.filter((r) => !held(r));
		zipping = { done: 0, total: rows.length };
		try {
			const fresh = missing.length
				? await issueCertificates({ template, event, facts, recipients: missing.map(asRecipient), award, existing })
				: [];
			const issues = await getIssues([...rows.flatMap((r) => (held(r) ? [r.issue!.code] : [])), ...fresh]);
			const files: { name: string; data: Blob }[] = [];
			for (const one of issues) {
				files.push({
					name: `${safeName(one.teamName)} - ${safeName(one.name)} - ${one.code}.png`,
					data: await certificatePng(one.design, one.values, verifyUrl(one.code))
				});
				zipping = { done: files.length, total: issues.length };
			}
			saveBlob(await zipBlob(files), `${safeName(`${template.name} - ${facts.title}`)}.zip`);
			const saved = missing.length ? ` ${missing.length} newly saved (not emailed).` : '';
			certToast.showToast(`Downloaded ${files.length} certificate${files.length === 1 ? '' : 's'}.${saved}`, 'success');
		} catch (err) {
			console.error('[certificates] zip download failed', err);
			certToast.showToast((err as Error).message || 'Could not make the ZIP.', 'error');
		} finally {
			zipping = null;
			if (missing.length) await loadExisting();
		}
	}

	/** Issued certificates among the selection, or every issued one when nothing is selected. */
	function issuedCodes() {
		return allRows.filter((r) => held(r) && (selected.size ? selected.has(r.key) : true)).map((r) => r.issue!.code);
	}

	function emailIssued() {
		const codes = issuedCodes();
		if (!codes.length) {
			certToast.showToast('Nobody selected holds this certificate yet.', 'info');
			return;
		}
		const many = codes.length === 1 ? 'certificate to its holder' : 'certificates to their holders';
		if (!confirm(`Email ${codes.length} ${many}?`)) return;
		sendEmails(codes);
	}

	async function toggleRevoked(r: Row) {
		const issue = r.issue;
		if (!issue) return;
		const revoke = !issue.revoked;
		if (revoke && !confirm(`Revoke ${r.name}'s certificate ${issue.code}? Verifying it will then show it as revoked.`)) return;
		try {
			await setRevoked(issue.code, revoke);
			existing.set(r.key, { ...issue, revoked: revoke });
			existing = new Map(existing);
			certToast.showToast(revoke ? `Revoked ${issue.code}.` : `Restored ${issue.code}.`, 'success');
		} catch (err) {
			certToast.showToast((err as Error).message || 'Could not update it.', 'error');
		}
	}
</script>

<svelte:head><title>Issue certificate — ZenCode Admin</title></svelte:head>

<CertScope>
	{#if templateStatus === 'loading'}
		<div class="flex items-center justify-center gap-3 py-24 text-sm text-muted-foreground"><Spinner /> Loading…</div>
	{:else if templateStatus !== 'ready' || !template}
		<div class="rounded-lg border border-border bg-card">
			<StateMessage
				tone={templateStatus === 'error' ? 'error' : 'empty'}
				icon={CloudOff}
				title={templateStatus === 'error' ? 'Could not load the certificate.' : 'That certificate does not exist.'}
			>
				<Button variant="outline" href="/admin/certificates"><ArrowLeft class="size-4" /> All certificates</Button>
			</StateMessage>
		</div>
	{:else}
		<div class="mb-6 flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
			<div class="min-w-0">
				<a href="/admin/certificates/{template.id}" class="inline-flex items-center gap-1 text-[13px] text-muted-foreground hover:text-foreground">
					<ArrowLeft class="size-3.5" /> Back to the design
				</a>
				<h1 class="mt-2 truncate text-2xl font-semibold tracking-tight text-foreground">Issue “{template.name}”</h1>
				<p class="mt-1 max-w-2xl text-sm text-muted-foreground">
					Choose the event, then tick the teams (or single members) who should get this certificate. Every member gets their own
					certificate and verification code. Save them or download them as images to check them; nobody is emailed until you choose to send
					the PDF to the address they registered with.
				</p>
			</div>
		</div>

		<div class="grid items-start gap-5 xl:grid-cols-[minmax(0,1fr)_26rem]">
			<div class="min-w-0 space-y-4">
				<!-- Event -->
				<div class="grid grid-cols-2 gap-2 sm:max-w-md" role="radiogroup" aria-label="Event">
					{#each EVENTS as e (e.id)}
						{@const on = event === e.id}
						<button
							type="button"
							role="radio"
							aria-checked={on}
							onclick={() => chooseEvent(e.id)}
							class="flex h-12 items-center gap-2.5 rounded-lg border px-4 text-sm font-medium transition-colors
								{on ? 'border-primary bg-accent text-accent-foreground' : 'border-border bg-card text-foreground hover:bg-muted'}"
						>
							<e.icon class="size-4 {on ? 'text-primary' : 'text-muted-foreground'}" />
							{siteConfig.value.events[e.id]?.title || EVENT_LABELS[e.id]}
						</button>
					{/each}
				</div>

				<section class="overflow-hidden rounded-lg border border-border bg-card">
					<div class="flex flex-wrap items-center justify-between gap-3 border-b border-border p-3">
						<div class="inline-flex rounded-md border border-border bg-muted p-0.5" role="tablist" aria-label="Show">
							{#each [['all', 'All teams'], ['pending', 'Not issued'], ['issued', 'Issued'], ['unsent', 'Not emailed']] as const as [key, label] (key)}
								<button
									type="button"
									role="tab"
									aria-selected={show === key}
									onclick={() => (show = key)}
									class="inline-flex h-7 items-center gap-1.5 rounded px-2.5 text-[12.5px] font-medium
										{show === key ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'}"
								>
									{label} <span class="text-[11px] text-muted-foreground tabular">{counts[key]}</span>
								</button>
							{/each}
						</div>
						<label class="relative min-w-48 flex-1 sm:max-w-80">
							<span class="sr-only">Search</span>
							<Search class="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
							<input
								type="search"
								bind:value={query}
								placeholder="Team, member, admission no. or code"
								class="h-9 w-full rounded-md border border-input bg-card pr-3 pl-8 text-[13px] outline-none focus:border-ring"
							/>
						</label>
					</div>

					{#if registrations.status === 'error'}
						<StateMessage tone="error" icon={CloudOff} title="Could not load the teams.">
							<Button variant="outline" onclick={() => registrations.retry()}><RotateCcw class="size-4" /> Retry</Button>
						</StateMessage>
					{:else if registrations.status !== 'ready' || existingStatus === 'loading'}
						<div class="flex items-center justify-center gap-3 py-14 text-sm text-muted-foreground"><Spinner /> Loading teams…</div>
					{:else if existingStatus === 'error'}
						<StateMessage
							tone="error"
							icon={CloudOff}
							title="Could not load issued certificates."
							description="If this is a new setup, deploy the latest firestore.rules."
						>
							<Button variant="outline" onclick={loadExisting}><RotateCcw class="size-4" /> Retry</Button>
						</StateMessage>
					{:else if visible.length}
						<div class="flex items-center gap-3 border-b border-border bg-muted/60 px-3 py-2 text-[12px] font-semibold text-muted-foreground">
							<input
								type="checkbox"
								class="size-4 accent-primary"
								checked={allVisibleChosen}
								onchange={toggleAllVisible}
								aria-label="Select every team shown"
							/>
							<span class="flex-1">Team</span>
							<span class="hidden w-28 sm:block">Certificates</span>
							<span class="w-8"></span>
						</div>
						<ul class="max-h-[36rem] overflow-y-auto">
							{#each visible as t (t.reg.id)}
								{@const state = teamState(t)}
								{@const open = expanded.has(t.reg.id)}
								{@const issuedHere = t.rows.filter(held).length}
								{@const revokedHere = t.rows.filter((r) => r.issue?.revoked).length}
								<li class="border-b border-border last:border-b-0">
									<div
										class="flex items-center gap-3 px-3 py-2.5 transition-colors
											{state !== 'none' ? 'bg-accent/60' : 'hover:bg-muted/60'}"
									>
										<input
											type="checkbox"
											class="size-4 accent-primary"
											checked={state === 'all'}
											indeterminate={state === 'some'}
											onchange={() => toggleTeam(t)}
											aria-label="Select team {t.label}"
										/>
										<button type="button" class="min-w-0 flex-1 text-left" onclick={() => toggleExpanded(t.reg.id)}>
											<span class="flex items-center gap-2">
												<span class="truncate text-sm font-medium text-foreground">{t.label}</span>
												{#if t.reg.status === 'rejected'}<StatusBadge status="rejected" />{/if}
											</span>
											<span class="block truncate text-[12px] text-muted-foreground">
												{referenceId(t.reg.id)} · {t.rows.length} member{t.rows.length === 1 ? '' : 's'} · {t.rows.map((r) => r.name).join(', ')}
											</span>
										</button>
										<span class="hidden w-28 text-[12px] sm:block {issuedHere ? 'text-primary' : 'text-muted-foreground'}">
											{issuedHere ? `${issuedHere} of ${t.rows.length} issued` : revokedHere ? 'Revoked' : 'Not issued'}
										</span>
										<button
											type="button"
											class="grid size-8 place-items-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
											aria-label="{open ? 'Hide' : 'Show'} members of {t.label}"
											aria-expanded={open}
											onclick={() => toggleExpanded(t.reg.id)}
										>
											<ChevronDown class="size-4 transition-transform {open ? 'rotate-180' : ''}" />
										</button>
									</div>
									{#if open}
										<ul class="border-t border-dashed border-border bg-muted/30 py-1">
											{#each t.rows as r (r.key)}
												<li
													class="flex items-center gap-3 py-1.5 pr-3 pl-9 text-[13px]
														{previewing?.key === r.key ? 'shadow-[inset_3px_0_0_var(--color-primary)]' : ''}"
												>
													<input
														type="checkbox"
														class="size-4 accent-primary"
														checked={selected.has(r.key)}
														onchange={() => toggleMember(r)}
														aria-label="Select {r.name}"
													/>
													<button type="button" class="min-w-0 flex-1 text-left" onclick={() => (previewKey = r.key)}>
														<span class="font-medium text-foreground">{r.name}</span>
														{#if r.memberNumber === 1}<span class="ml-1 text-[11px] text-muted-foreground">Leader</span>{/if}
														<span class="block truncate text-[12px] text-muted-foreground">
															{r.admissionNumber || '—'} ·
															{#if r.email}{r.email}{:else}<span class="text-destructive">no email</span>{/if}
														</span>
													</button>
													{#if r.issue}
														<span class="text-right font-mono text-[12px] {r.issue.revoked ? 'text-muted-foreground line-through' : 'text-foreground'}">
															{r.issue.code}
															{#if r.issue.emailError}
																<span class="flex items-center justify-end gap-1 font-sans text-[11px] text-destructive" title={r.issue.emailError}>
																	<MailWarning class="size-3" /> Email failed
																</span>
															{:else if r.issue.emailedAt}
																<span class="flex items-center justify-end gap-1 font-sans text-[11px] text-primary" title="Emailed to {r.issue.emailedTo}">
																	<MailCheck class="size-3" /> Emailed
																</span>
															{:else if !r.issue.revoked}
															<span class="block font-sans text-[11px] text-muted-foreground">
																{r.issue.award ? `${r.issue.award} · ` : ''}Saved, not emailed
															</span>
														{:else if r.issue.award}<span class="block font-sans text-[11px] text-muted-foreground">{r.issue.award}</span>{/if}
														</span>
														<button
															type="button"
															class="grid size-7 place-items-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
															title={r.issue.revoked ? 'Restore' : 'Revoke'}
															aria-label="{r.issue.revoked ? 'Restore' : 'Revoke'} {r.name}'s certificate"
															onclick={() => toggleRevoked(r)}
														>
															{#if r.issue.revoked}<RotateCcw class="size-3.5" />{:else}<Ban class="size-3.5" />{/if}
														</button>
													{:else}
														<span class="text-[12px] text-muted-foreground">Not issued</span>
														<span class="size-7"></span>
													{/if}
												</li>
											{/each}
										</ul>
									{/if}
								</li>
							{/each}
						</ul>
					{:else}
						<StateMessage
							icon={Users}
							title={query
								? 'No team matches that search.'
								: show === 'issued'
									? 'None issued yet.'
									: show === 'unsent'
										? 'Every issued certificate has been emailed.'
										: 'No teams registered yet.'}
						/>
					{/if}
				</section>
			</div>

			<!-- Preview and actions -->
			<aside class="xl:sticky xl:top-20">
				<div class="overflow-hidden rounded-lg border border-border bg-card">
					<div class="flex items-baseline justify-between gap-2 border-b border-border px-4 py-3">
						<span class="text-[13px] font-semibold text-foreground">Preview</span>
						{#if previewing}<span class="truncate text-xs text-muted-foreground">{previewing.name} · {previewing.teamName}</span>{/if}
					</div>
					<div class="preview bg-muted p-4" bind:clientWidth={previewWidth}>
						<CertificatePage
							design={template.design}
							values={previewValues}
							qrText={verifyUrl(previewing?.issue?.code ?? 'ZC-0000-0000')}
							scale={Math.max(0.1, (previewWidth - 32) / template.design.page.width)}
						/>
					</div>
					{#if empties.length}
						<p class="flex items-start gap-1.5 border-t border-border bg-[#fdf6e3] px-4 py-2.5 text-[12px] text-[#8a5a00]">
							<TriangleAlert class="mt-px size-3.5 shrink-0" />
							<span>
								Empty on this certificate: {empties.join(', ').replaceAll('_', ' ')}.
								{#if empties.includes('event_dates') || empties.includes('venue')}Set them in <a class="underline" href="/admin/settings">Settings</a>.{/if}
								{#if empties.includes('award')}Type an award below.{/if}
							</span>
						</p>
					{/if}

					<div class="space-y-3 border-t border-border p-4">
						<label class="block">
							<span class="text-[12.5px] font-medium text-foreground">Award <span class="font-normal text-muted-foreground">(optional)</span></span>
							<input
								bind:value={award}
								list="award-suggestions"
								maxlength="80"
								placeholder="e.g. First Place — leave empty for participation"
								class="mt-1 h-9 w-full rounded-md border border-input bg-card px-3 text-[13px] outline-none focus:border-ring"
							/>
							<datalist id="award-suggestions">
								{#each AWARDS as a (a)}<option value={a}></option>{/each}
							</datalist>
							<span class="mt-1 block text-[11.5px] text-muted-foreground">Fills the <code>{'{{award}}'}</code> field for everyone issued now.</span>
						</label>

						{#if sending}
							<div class="rounded-md border border-border bg-muted px-3 py-2.5 text-[12.5px]" aria-live="polite">
								<div class="flex items-center justify-between gap-2 font-medium text-foreground">
									<span class="flex items-center gap-2"><Spinner class="size-3.5" /> Emailing certificates…</span>
									<span class="tabular">{sending.done} / {sending.total}</span>
								</div>
								<div class="mt-2 h-1.5 overflow-hidden rounded-full bg-border">
									<div class="h-full bg-primary transition-[width]" style:width="{(sending.done / sending.total) * 100}%"></div>
								</div>
								<p class="mt-1.5 text-muted-foreground">
									Keep this tab open until it finishes.{sending.failed ? ` ${sending.failed} failed so far.` : ''}
								</p>
							</div>
						{/if}

						{#if zipping}
							<div class="rounded-md border border-border bg-muted px-3 py-2.5 text-[12.5px]" aria-live="polite">
								<div class="flex items-center justify-between gap-2 font-medium text-foreground">
									<span class="flex items-center gap-2"><Spinner class="size-3.5" /> Drawing certificates…</span>
									<span class="tabular">{zipping.done} / {zipping.total}</span>
								</div>
								<div class="mt-2 h-1.5 overflow-hidden rounded-full bg-border">
									<div class="h-full bg-primary transition-[width]" style:width="{(zipping.done / zipping.total) * 100}%"></div>
								</div>
								<p class="mt-1.5 text-muted-foreground">Keep this tab open; the ZIP downloads when it finishes.</p>
							</div>
						{/if}

						<Button class="w-full" size="lg" disabled={!chosen.length || busy} loading={issuing} onclick={() => issue('save')}>
							{#if !issuing}<Save class="size-4" />{/if}
							{#if issuing}Issuing…{:else if chosen.length}Save {chosen.length} ({chosenTeams} team{chosenTeams === 1 ? '' : 's'}) — don’t email yet{:else}Select teams to issue{/if}
						</Button>
						<Button class="w-full" variant="outline" disabled={!chosen.length || busy} onclick={() => issue('email')}>
							<Mail class="size-4" /> Save &amp; email
						</Button>
						{#if chosen.length}
							<Button class="w-full" variant="outline" disabled={busy} loading={zipping !== null} onclick={downloadZip}>
								{#if !zipping}<FileArchive class="size-4" />{/if}
								Download {chosen.length} as ZIP (PNG images)
							</Button>
							{#if notIssued || revokedChosen}
								<p class="-mt-1 text-center text-[12px] text-muted-foreground">
									{#if notIssued}{notIssued} not issued yet will be saved first (not emailed).{/if}
									{#if revokedChosen}{revokedChosen} revoked will be restored.{/if}
								</p>
							{/if}
						{/if}
						{#if noEmail}
							<p class="text-center text-[12px] text-destructive">
								{noEmail} selected {noEmail === 1 ? 'person has' : 'people have'} no email on their registration. Download theirs as a ZIP instead.
							</p>
						{/if}
						{#if alreadyHeld}
							<p class="text-center text-[12px] text-muted-foreground">
								{alreadyHeld} of these already hold it. They keep their code and get the latest design{award.trim() ? ' and award' : ''}.
							</p>
						{/if}
						<div class="border-t border-border pt-3">
							<p class="mb-2 text-[12px] text-muted-foreground">
								Already saved{selected.size ? ' (selected)' : ''}: download to check them, then send the soft copies.
							</p>
							<Button class="w-full" variant="outline" size="sm" disabled={!allRows.some(held) || busy} onclick={emailIssued}>
								<Mail class="size-4" /> Email issued{selected.size ? ' (selected)' : ''}
							</Button>
						</div>
					</div>
				</div>
			</aside>
		</div>
	{/if}
</CertScope>

<style>
	.preview :global(.cp-frame) {
		box-shadow: var(--shadow-md);
	}
</style>
