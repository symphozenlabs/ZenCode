<script lang="ts">
	import { page } from '$app/state';
	import { goto } from '$app/navigation';
	import { adminAuth } from '$lib/stores/admin-auth.svelte';
	import AdminShell from '$lib/components/admin/AdminShell.svelte';
	import Spinner from '$lib/components/ui/Spinner.svelte';

	let { children } = $props();

	const isLogin = $derived(page.url.pathname === '/admin/login');
	// The live presenter is a full-bleed stage: same access check, no shell.
	const isPresenter = $derived(/^\/admin\/live\/[^/]+\/present\/?$/.test(page.url.pathname));

	adminAuth.start();

	// Route protection: anyone who isn't a verified admin is sent to login.
	$effect(() => {
		if (isLogin) return;
		const s = adminAuth.status;
		if (s === 'signed-out' || s === 'not-admin' || s === 'unconfigured') {
			const next = page.url.pathname + page.url.search;
			goto(`/admin/login?next=${encodeURIComponent(next)}`, { replaceState: true });
		}
	});
</script>

<svelte:head>
	<meta name="robots" content="noindex" />
</svelte:head>

{#if isLogin}
	{@render children()}
{:else if adminAuth.status === 'admin' && isPresenter}
	{@render children()}
{:else if adminAuth.status === 'admin'}
	<AdminShell>{@render children()}</AdminShell>
{:else}
	<div class="grid min-h-dvh place-items-center bg-background text-muted-foreground">
		<div class="flex items-center gap-3 text-sm"><Spinner /> Checking access…</div>
	</div>
{/if}
