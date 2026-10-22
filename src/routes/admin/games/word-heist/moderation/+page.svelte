<script lang="ts">
	import { ArrowLeft, Plus, X, ShieldCheck, Search, CloudOff } from '@lucide/svelte';
	import { adminAuth } from '$lib/stores/admin-auth.svelte';
	import { getModeration, saveModeration, testWord } from '$lib/games/word-heist/api';
	import { DEFAULT_BLOCKLIST, type ModerationConfig } from '$lib/games/word-heist/types';
	import { formatTimestamp } from '$lib/utils/format';
	import PageHeader from '$lib/components/admin/PageHeader.svelte';
	import Button from '$lib/components/ui/Button.svelte';
	import Spinner from '$lib/components/ui/Spinner.svelte';
	import StateMessage from '$lib/components/ui/StateMessage.svelte';
	import Toggle from '$lib/components/admin/Toggle.svelte';

	let loadState = $state<'loading' | 'ready' | 'error'>('loading');
	let saved = $state<ModerationConfig | null>(null);
	let list = $state<string[]>([]);
	let obfuscation = $state(true);
	let entry = $state('');
	let entryError = $state('');
	let saving = $state(false);
	let message = $state<{ tone: 'ok' | 'error'; text: string } | null>(null);
	let attempt = $state(0);

	const token = async () => {
		const t = await adminAuth.user?.getIdToken();
		if (!t) throw new Error('Your session expired. Sign in again.');
		return t;
	};

	$effect(() => {
		attempt;
		if (!adminAuth.user) return;
		loadState = 'loading';
		token()
			.then(getModeration)
			.then((c) => {
				saved = c;
				list = [...c.blocklist];
				obfuscation = c.detectObfuscation;
				loadState = 'ready';
			})
			.catch(() => (loadState = 'error'));
	});

	const dirty = $derived(!!saved && (saved.detectObfuscation !== obfuscation || saved.blocklist.join() !== [...list].sort().join()));

	function add(e: SubmitEvent) {
		e.preventDefault();
		const w = entry.trim().toLowerCase();
		entryError = '';
		if (!/^[a-z]{2,30}\*?$/.test(w)) {
			entryError = 'Use 2–30 letters, optionally ending in * to block every word starting with it.';
			return;
		}
		if (!list.includes(w)) list = [...list, w].sort();
		entry = '';
	}

	async function save() {
		saving = true;
		message = null;
		try {
			saved = await saveModeration(await token(), { blocklist: list, detectObfuscation: obfuscation });
			list = [...saved.blocklist];
			message = { tone: 'ok', text: 'Saved. New moves use the updated list within 10 seconds.' };
		} catch (err) {
			message = { tone: 'error', text: (err as Error).message };
		} finally {
			saving = false;
		}
	}

	let probe = $state('');
	let probing = $state(false);
	let probeResult = $state<{ ok: boolean; message: string } | null>(null);
	async function check(e: SubmitEvent) {
		e.preventDefault();
		if (!probe.trim()) return;
		probing = true;
		try {
			probeResult = await testWord(await token(), probe);
		} catch (err) {
			probeResult = { ok: false, message: (err as Error).message };
		} finally {
			probing = false;
		}
	}
</script>

<svelte:head><title>Word Heist moderation — ZenCode Admin</title></svelte:head>

<a href="/admin/games" class="mb-4 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"><ArrowLeft class="size-4" /> Games</a>

<PageHeader
	eyebrow="Word Heist"
	title="Word moderation"
	description="Two separate checks run on every new and stolen word: the site's general profanity filter, and this event blocklist."
/>

{#if loadState === 'loading'}
	<div class="flex items-center gap-3 py-12 text-muted-foreground" role="status"><Spinner /> Loading…</div>
{:else if loadState === 'error'}
	<StateMessage tone="error" icon={CloudOff} title="Unable to load moderation settings." description="Check your connection, then retry.">
		<Button variant="outline" onclick={() => attempt++}>Retry</Button>
	</StateMessage>
{:else}
	<div class="grid gap-6 lg:grid-cols-[1fr_22rem]">
		<section class="rounded-lg border border-border bg-card p-5" aria-labelledby="bl-h">
			<h2 id="bl-h" class="text-[15px] font-semibold">Event blocklist</h2>
			<p class="mt-1 text-sm text-muted-foreground">
				Whole words only, plus their -s, -es, -ed and -ing forms: <span class="font-mono">bra</span> blocks BRAS but not BRAIN. End an entry with
				<span class="font-mono">*</span> to block every word that starts with it.
			</p>
			<form class="mt-4 flex gap-2" onsubmit={add} novalidate>
				<input
					bind:value={entry}
					placeholder="Add a word"
					aria-label="Word to block"
					aria-invalid={entryError ? 'true' : undefined}
					class="h-9 min-w-0 flex-1 rounded-md border border-input bg-background px-3 text-sm focus:ring-2 focus:ring-ring focus:outline-hidden"
				/>
				<Button type="submit" variant="outline"><Plus class="size-4" /> Add</Button>
			</form>
			{#if entryError}<p class="mt-2 text-[13px] text-destructive">{entryError}</p>{/if}
			<ul class="mt-4 flex flex-wrap gap-2" aria-label="Blocked words">
				{#each list as w (w)}
					<li class="inline-flex items-center gap-1 rounded-md border border-border bg-secondary px-2 py-1 font-mono text-sm">
						{w}
						<button type="button" class="rounded p-0.5 text-muted-foreground hover:text-destructive" aria-label="Remove {w}" onclick={() => (list = list.filter((x) => x !== w))}><X class="size-3.5" /></button>
					</li>
				{:else}
					<li class="text-sm text-muted-foreground">The event blocklist is empty — only the general filter applies.</li>
				{/each}
			</ul>
			<div class="mt-6 border-t border-border pt-4">
				<Toggle bind:checked={obfuscation} label="Detect disguised words" description="Undo look-alike characters and separators (s3x, s-e-x) before checking." />
			</div>
			<div class="mt-6 flex flex-wrap items-center gap-2">
				<Button onclick={save} loading={saving} disabled={!dirty}>Save changes</Button>
				<Button variant="ghost" onclick={() => (list = [...DEFAULT_BLOCKLIST].sort())}>Restore starting list</Button>
				{#if saved?.updatedAt}<span class="text-xs text-muted-foreground">Last saved {formatTimestamp(saved.updatedAt, true)} by {saved.updatedBy}</span>{/if}
			</div>
			{#if message}<p class="mt-3 text-[13px] {message.tone === 'ok' ? 'text-emerald-700' : 'text-destructive'}" role="status">{message.text}</p>{/if}
		</section>

		<aside class="space-y-4">
			<section class="rounded-lg border border-border bg-card p-5" aria-labelledby="test-h">
				<h2 id="test-h" class="flex items-center gap-2 text-[15px] font-semibold"><Search class="size-4" /> Test a word</h2>
				<p class="mt-1 text-sm text-muted-foreground">Checks the dictionary and both filters with the saved settings.</p>
				<form class="mt-3 flex gap-2" onsubmit={check}>
					<input bind:value={probe} aria-label="Word to test" class="h-9 min-w-0 flex-1 rounded-md border border-input bg-background px-3 font-mono text-sm uppercase focus:ring-2 focus:ring-ring focus:outline-hidden" />
					<Button type="submit" variant="outline" loading={probing}>Test</Button>
				</form>
				{#if probeResult}<p class="mt-2 text-[13px] {probeResult.ok ? 'text-emerald-700' : 'text-destructive'}">{probeResult.message}</p>{/if}
			</section>
			<section class="rounded-lg border border-border bg-card p-5 text-sm text-muted-foreground">
				<h2 class="flex items-center gap-2 text-[15px] font-semibold text-foreground"><ShieldCheck class="size-4" /> Limits</h2>
				<ul class="mt-2 list-disc space-y-1 pl-4">
					<li>No filter catches every evasion. Words must also be A–Z dictionary words, which rules out most disguises.</li>
					<li>The general filter can block ordinary words that double as slang (for example COCK or ASS).</li>
					<li>Entries ending in * can block legitimate words — test them first.</li>
				</ul>
			</section>
		</aside>
	</div>
{/if}
