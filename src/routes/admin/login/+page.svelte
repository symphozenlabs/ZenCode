<script lang="ts">
	import { page } from '$app/state';
	import { goto } from '$app/navigation';
	import { fade } from 'svelte/transition';
	import { Eye, EyeOff, ShieldCheck, ArrowLeft } from '@lucide/svelte';
	import { adminAuth, authErrorMessage } from '$lib/stores/admin-auth.svelte';
	import Button from '$lib/components/ui/Button.svelte';
	import Field from '$lib/components/ui/Field.svelte';
	import Logo from '$lib/components/site/Logo.svelte';
	import AnimatedGrid from '$lib/components/motion/AnimatedGrid.svelte';
	import GlowBackground from '$lib/components/motion/GlowBackground.svelte';
	import NoiseOverlay from '$lib/components/motion/NoiseOverlay.svelte';

	let email = $state('');
	let password = $state('');
	let showPassword = $state(false);
	let busy = $state(false);
	let error = $state('');

	// Only allow redirects back into the admin area.
	const next = $derived.by(() => {
		const n = page.url.searchParams.get('next') ?? '';
		return n.startsWith('/admin') && !n.startsWith('/admin/login') && !n.startsWith('//') ? n : '/admin';
	});

	$effect(() => {
		if (adminAuth.status === 'admin') goto(next, { replaceState: true });
	});

	async function submit(e: SubmitEvent) {
		e.preventDefault();
		error = '';
		if (!email.trim() || !password) {
			error = 'Enter your email and password.';
			return;
		}
		busy = true;
		try {
			await adminAuth.signIn(email.trim(), password);
		} catch (err) {
			error = authErrorMessage(err);
			password = '';
		} finally {
			busy = false;
		}
	}
</script>

<svelte:head><title>Organiser sign in — ZenCode</title></svelte:head>

<div class="grid min-h-dvh bg-background lg:grid-cols-[1.1fr_1fr]">
	<!-- Brand panel -->
	<aside class="relative hidden overflow-hidden bg-stage text-cream lg:flex lg:flex-col">
		<AnimatedGrid />
		<GlowBackground class="opacity-70" />
		<NoiseOverlay />
		<div class="relative flex flex-1 flex-col justify-between p-12">
			<a href="/" aria-label="ZenCode home"><Logo variant="full" class="w-40" /></a>
			<div>
				<p class="eyebrow text-sun">Control center</p>
				<h1 class="mt-4 max-w-md font-display text-5xl leading-[1.05] font-semibold tracking-tight">
					Run the event from one place.
				</h1>
				<p class="mt-5 max-w-sm text-cream/60">Registrations, approvals, event settings and exports — for organisers only.</p>
			</div>
			<p class="flex items-center gap-2 font-mono text-xs text-cream/40">
				<ShieldCheck class="size-4" /> Access is restricted to approved organiser accounts.
			</p>
		</div>
	</aside>

	<!-- Form -->
	<main class="flex items-center justify-center p-6">
		<div class="w-full max-w-sm">
			<div class="mb-10 lg:hidden"><Logo tone="dark" /></div>
			<p class="text-xs font-semibold tracking-[0.1em] text-muted-foreground uppercase">Organiser access</p>
			<h2 class="mt-1 text-2xl font-semibold tracking-tight">Sign in</h2>
			<p class="mt-1 text-sm text-muted-foreground">Use the account an administrator set up for you.</p>

			{#if adminAuth.status === 'unconfigured'}
				<p class="mt-6 rounded-md border border-amber-200 bg-amber-50 px-3 py-2.5 text-sm text-amber-900" role="alert">
					Sign-in isn't available yet: Firebase hasn't been configured for this deployment.
				</p>
			{/if}

			<form class="mt-8 space-y-4" onsubmit={submit} novalidate>
				<Field label="Email" type="email" bind:value={email} autocomplete="username" inputmode="email" required class="[&_input]:h-10" />
				<div class="flex flex-col gap-1.5">
					<label for="password" class="text-[13px] font-medium">Password</label>
					<div class="relative">
						<input
							id="password"
							type={showPassword ? 'text' : 'password'}
							bind:value={password}
							autocomplete="current-password"
							required
							class="h-10 w-full rounded-md border border-input bg-card pr-10 pl-3 text-sm outline-none transition-[border-color,box-shadow] duration-150 focus:border-ring focus:ring-3 focus:ring-ring/20"
						/>
						<button
							type="button"
							class="absolute top-1/2 right-1 grid size-8 -translate-y-1/2 place-items-center rounded-md text-muted-foreground hover:text-foreground"
							aria-label={showPassword ? 'Hide password' : 'Show password'}
							onclick={() => (showPassword = !showPassword)}
						>
							{#if showPassword}<EyeOff class="size-4" />{:else}<Eye class="size-4" />{/if}
						</button>
					</div>
				</div>

				<div aria-live="polite">
					{#if error}
						<p class="rounded-md border border-red-200 bg-red-50 px-3 py-2.5 text-sm text-destructive" transition:fade={{ duration: 150 }}>{error}</p>
					{/if}
				</div>

				<Button type="submit" size="lg" class="w-full" loading={busy} disabled={adminAuth.status === 'unconfigured'}>
					{busy ? 'Signing in…' : 'Sign in'}
				</Button>
			</form>

			<a href="/" class="mt-10 inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
				<ArrowLeft class="size-4" /> Back to site
			</a>
		</div>
	</main>
</div>
