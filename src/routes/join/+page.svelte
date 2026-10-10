<script lang="ts">
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import { ArrowRight } from '@lucide/svelte';
	import { JOIN_CODE_RE } from '$lib/live/session';
	import { liveApi } from '$lib/live/origin';
	import GameStage from '$lib/components/games/GameStage.svelte';
	import Logo from '$lib/components/site/Logo.svelte';
	import Button from '$lib/components/ui/Button.svelte';

	/**
	 * Fallback for players who can't scan: type the code shown on screen.
	 * One door for both: a Tech Word Rush game code (ZC7K42) or a live
	 * session's 6-digit code (482 913).
	 */
	let code = $state(page.url.searchParams.get('code') ?? '');
	let error = $state('');
	let busy = $state(false);

	async function submit(e: SubmitEvent) {
		e.preventDefault();
		const c = code.trim().toUpperCase().replace(/\s+/g, '');
		if (/^ZC[A-Z2-9]{4}$/.test(c)) return goto(`/join/${c}`);
		if (!JOIN_CODE_RE.test(c)) {
			error = 'Enter the code shown on the big screen.';
			return;
		}
		busy = true;
		error = '';
		try {
			const res = await fetch(liveApi(`/join/${c}`));
			if (res.ok) return goto(`/play/${c}`);
			const data = await res.json().catch(() => null);
			error = data?.message ?? 'That code doesn’t match a live session.';
		} catch {
			error = 'Network problem — check your connection.';
		}
		busy = false;
	}
</script>

<svelte:head><title>Join a game — ZenCode</title></svelte:head>

<GameStage>
	<header class="px-4 py-4"><Logo /></header>
	<main class="mx-auto flex w-full max-w-md flex-1 flex-col justify-center px-4 pb-16">
		<p class="eyebrow text-green-300">Live game</p>
		<h1 class="mt-2 font-display text-4xl font-bold tracking-tight uppercase">Join a game</h1>
		<p class="mt-2 text-cream/60">Game code or live session code — it’s on the big screen.</p>
		<form class="mt-8 space-y-3" onsubmit={submit} novalidate>
			<label for="code" class="eyebrow block text-cream/60">Join code</label>
			<input
				id="code"
				bind:value={code}
				placeholder="ZC7K42"
				maxlength="8"
				autocomplete="off"
				autocapitalize="characters"
				spellcheck="false"
				aria-invalid={error ? 'true' : undefined}
				aria-describedby={error ? 'code-err' : undefined}
				class="h-16 w-full rounded-lg border-2 border-stage-line bg-stage-raised px-4 text-center font-mono text-3xl font-bold tracking-[0.3em] text-cream uppercase outline-none transition-colors duration-150 placeholder:text-cream/20 focus:border-green-300"
			/>
			{#if error}<p id="code-err" class="text-sm text-attention">{error}</p>{/if}
			<Button type="submit" variant="sun" size="xl" class="w-full" loading={busy}>Continue <ArrowRight class="size-4" /></Button>
		</form>
	</main>
</GameStage>
