<script lang="ts">
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import { ArrowRight } from '@lucide/svelte';
	import { JOIN_CODE_RE } from '$lib/live/session';
	import { DUR, rise } from '$lib/live/motion';
	import Logo from '$lib/components/site/Logo.svelte';
	import Button from '$lib/components/ui/Button.svelte';

	let code = $state((page.url.searchParams.get('code') ?? '').replace(/\D/g, '').slice(0, 6));
	let busy = $state(false);
	let error = $state('');

	function oninput(e: Event) {
		const el = e.currentTarget as HTMLInputElement;
		code = el.value.replace(/\D/g, '').slice(0, 6);
		el.value = code;
		error = '';
	}

	async function submit(e: SubmitEvent) {
		e.preventDefault();
		if (!JOIN_CODE_RE.test(code)) {
			error = 'Enter the 6-digit code on the big screen.';
			return;
		}
		busy = true;
		error = '';
		try {
			const res = await fetch(`/api/live/join/${code}`);
			if (res.ok) return goto(`/play/${code}`);
			const data = await res.json().catch(() => null);
			error = data?.message ?? 'That code doesn’t match a live session.';
		} catch {
			error = 'Network problem — check your connection.';
		}
		busy = false;
	}
</script>

<svelte:head><title>Join a live session — ZenCode</title></svelte:head>

<div class="flex min-h-dvh flex-col bg-cream text-ink">
	<header class="px-4 pt-5"><Logo tone="dark" /></header>

	<form class="mx-auto flex w-full max-w-sm flex-1 flex-col px-4 pt-[12vh] pb-6" onsubmit={submit} novalidate>
		<div in:rise={{ y: 14, duration: DUR.stage }}>
			<p class="eyebrow text-forest-700">Live session</p>
			<h1 class="mt-2 font-display text-3xl font-semibold tracking-tight text-forest-950">Enter the join code</h1>
			<p class="mt-2 text-[15px] text-muted-foreground">It’s on the big screen.</p>
		</div>

		<div class="mt-8" in:rise={{ y: 14, duration: DUR.stage, delay: 80 }}>
			<label for="code" class="sr-only">Join code</label>
			<input
				id="code"
				value={code}
				{oninput}
				inputmode="numeric"
				autocomplete="off"
				pattern="[0-9]*"
				maxlength="6"
				placeholder="000000"
				aria-invalid={error ? 'true' : undefined}
				aria-describedby={error ? 'code-err' : undefined}
				class="h-16 w-full rounded-lg border bg-card text-center font-display text-4xl font-semibold tracking-[0.3em] text-forest-950 tabular outline-none transition-[border-color,box-shadow] duration-150 placeholder:text-input focus:border-ring focus:ring-4 focus:ring-ring/20
					{error ? 'border-destructive' : 'border-input'}"
			/>
			<p id="code-err" class="mt-2 min-h-5 text-sm text-destructive" aria-live="polite">{error}</p>
		</div>

		<div class="mt-auto pt-6">
			<Button type="submit" size="xl" class="w-full" loading={busy} disabled={code.length !== 6}>
				Continue <ArrowRight class="size-4" />
			</Button>
		</div>
	</form>
</div>
