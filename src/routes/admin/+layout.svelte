<script lang="ts">
	import { page } from '$app/state';
	import { goto } from '$app/navigation';
	import { adminAuth } from '$lib/stores/admin-auth.svelte';
	import Spinner from '$lib/components/ui/Spinner.svelte';

	let { children } = $props();

	const isLogin = $derived(page.url.pathname === '/admin/login');
	// Presenter screens are projected full-screen, so they skip the admin shell
	// (but keep the same admin check below).
	const isPresenter = $derived(page.url.pathname.startsWith('/admin/games/tech-word-rush/live/'));

	adminAuth.start();

	// Loaded on demand so the login page doesn't download the admin shell
	// (and the Firestore SDK it pulls in).
	const loadShell = () => import('$lib/components/admin/AdminShell.svelte');

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
	{#await loadShell()}
		<div class="grid min-h-dvh place-items-center bg-background text-muted-foreground">
			<div class="flex items-center gap-3 text-sm"><Spinner /> Loading…</div>
		</div>
	{:then { default: AdminShell }}
		<AdminShell>{@render children()}</AdminShell>
	{/await}
{:else}
	<div class="grid min-h-dvh place-items-center bg-background text-muted-foreground">
		<div class="flex items-center gap-3 text-sm"><Spinner /> Checking access…</div>
	</div>
{/if}
