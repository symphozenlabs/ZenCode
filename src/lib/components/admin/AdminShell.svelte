<script lang="ts">
	import type { Snippet } from 'svelte';
	import { page } from '$app/state';
	import { goto } from '$app/navigation';
	import { fade, fly } from 'svelte/transition';
	import {
		LayoutDashboard,
		Code2,
		Presentation,
		Settings,
		LogOut,
		Menu,
		X,
		ExternalLink
	} from '@lucide/svelte';
	import { adminAuth } from '$lib/stores/admin-auth.svelte';
	import { registrations } from '$lib/stores/registrations.svelte';
	import Logo from '$lib/components/site/Logo.svelte';

	let { children }: { children: Snippet } = $props();

	let mobileOpen = $state(false);

	const sections = $derived([
		{
			label: 'Overview',
			items: [{ href: '/admin', label: 'Dashboard', icon: LayoutDashboard, exact: true }]
		},
		{
			label: 'Events',
			items: [
				{ href: '/admin/hackathon', label: 'Hackathon', icon: Code2 },
				{ href: '/admin/pitch-fest', label: 'Pitch Fest', icon: Presentation }
			]
		},
		{
			label: 'System',
			items: [{ href: '/admin/settings', label: 'Settings', icon: Settings }]
		}
	]);

	const isActive = (href: string, exact = false) =>
		exact ? page.url.pathname === href : page.url.pathname.startsWith(href);

	$effect(() => {
		page.url.pathname;
		mobileOpen = false;
	});

	$effect(() => registrations.subscribe());

	async function logout() {
		await adminAuth.signOut();
		goto('/admin/login');
	}
</script>

{#snippet nav()}
	<nav class="flex flex-1 flex-col gap-6 overflow-y-auto px-3 py-5" aria-label="Admin">
		{#each sections as section (section.label)}
			<div>
				<p class="px-3 pb-2 text-[11px] font-semibold tracking-[0.12em] text-white/40 uppercase">{section.label}</p>
				<ul class="space-y-0.5">
					{#each section.items as item (item.href)}
						{@const active = isActive(item.href, 'exact' in item && item.exact)}
						<li>
							<a
								href={item.href}
								aria-current={active ? 'page' : undefined}
								class="flex h-9 items-center gap-3 rounded-md px-3 text-sm transition-colors duration-150
									{active ? 'bg-sidebar-accent font-medium text-white' : 'text-white/70 hover:bg-white/5 hover:text-white'}"
							>
								<item.icon class="size-4 {active ? 'text-sidebar-primary' : ''}" />
								<span class="flex-1">{item.label}</span>
								{#if 'badge' in item && item.badge}
									<span class="min-w-5 rounded-md bg-attention px-1.5 text-center text-[11px] leading-5 font-semibold text-white tabular" aria-label="{item.badge} new">{item.badge}</span>
								{/if}
							</a>
						</li>
					{/each}
				</ul>
			</div>
		{/each}
	</nav>
	<div class="border-t border-white/10 p-3">
		<a href="/" target="_blank" class="flex h-9 items-center gap-3 rounded-md px-3 text-sm text-white/60 hover:bg-white/5 hover:text-white">
			<ExternalLink class="size-4" /> View public site
		</a>
	</div>
{/snippet}

<div class="min-h-dvh bg-background font-sans text-foreground">
	<!-- Desktop sidebar -->
	<aside class="fixed inset-y-0 left-0 z-30 hidden w-60 flex-col bg-sidebar lg:flex">
		<div class="flex h-14 items-center border-b border-white/10 px-5">
			<a href="/admin" aria-label="Dashboard"><Logo /></a>
		</div>
		{@render nav()}
	</aside>

	<!-- Mobile sidebar -->
	{#if mobileOpen}
		<button
			type="button"
			class="fixed inset-0 z-40 bg-forest-950/50 lg:hidden"
			aria-label="Close navigation"
			transition:fade={{ duration: 150 }}
			onclick={() => (mobileOpen = false)}
		></button>
		<aside class="fixed inset-y-0 left-0 z-50 flex w-64 flex-col bg-sidebar lg:hidden" transition:fly={{ x: -260, duration: 200, opacity: 1 }}>
			<div class="flex h-14 items-center justify-between border-b border-white/10 px-5">
				<Logo />
				<button type="button" class="rounded-md p-1.5 text-white/70 hover:text-white" aria-label="Close navigation" onclick={() => (mobileOpen = false)}>
					<X class="size-5" />
				</button>
			</div>
			{@render nav()}
		</aside>
	{/if}

	<div class="lg:pl-60">
		<header class="sticky top-0 z-20 flex h-14 items-center gap-3 border-b border-border bg-card/95 px-4 backdrop-blur md:px-6">
			<button
				type="button"
				class="-ml-1 grid size-9 place-items-center rounded-md hover:bg-muted lg:hidden"
				aria-label="Open navigation"
				aria-expanded={mobileOpen}
				onclick={() => (mobileOpen = true)}><Menu class="size-5" /></button
			>
			<div class="flex items-center gap-2 text-xs text-muted-foreground" aria-live="polite">
				{#if registrations.status === 'ready'}
					<span class="size-2 animate-pulse-dot rounded-full bg-brand"></span> Live
				{:else if registrations.status === 'error'}
					<span class="size-2 rounded-full bg-destructive"></span> Offline
				{:else}
					<span class="size-2 rounded-full bg-muted-foreground/40"></span> Connecting…
				{/if}
			</div>
			<div class="ml-auto flex items-center gap-2">
				<span class="hidden max-w-56 truncate text-sm text-muted-foreground sm:block">{adminAuth.user?.email}</span>
				<button
					type="button"
					onclick={logout}
					class="inline-flex h-9 items-center gap-2 rounded-md px-3 text-sm font-medium text-foreground hover:bg-muted"
				>
					<LogOut class="size-4" /> <span class="hidden sm:inline">Sign out</span>
				</button>
			</div>
		</header>
		{#key page.url.pathname}
			<main class="mx-auto max-w-[1520px] p-4 md:p-6 lg:p-8" in:fly={{ y: 6, duration: 180 }}>
				{@render children()}
			</main>
		{/key}
	</div>
</div>
