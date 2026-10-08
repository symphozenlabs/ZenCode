<script lang="ts">
	import { page } from '$app/state';
	import { fly, fade } from 'svelte/transition';
	import { Menu, X, ArrowRight } from '@lucide/svelte';
	import Logo from './Logo.svelte';
	import Button from '$lib/components/ui/Button.svelte';

	const links = [
		{ href: '/hackathon', label: 'Hackathon' },
		{ href: '/pitch-fest', label: 'Pitch Fest' },
		{ href: '/schedule', label: 'Schedule' },
		{ href: '/rules', label: 'Rules' }
	];

	let scrolled = $state(false);
	let menuOpen = $state(false);

	$effect(() => {
		page.url.pathname;
		menuOpen = false;
	});

	const isActive = (href: string) => page.url.pathname.startsWith(href);
</script>

<svelte:window onscroll={() => (scrolled = window.scrollY > 12)} />

<header
	class="fixed inset-x-0 top-0 z-40 transition-[background-color,border-color] duration-200
		{scrolled || menuOpen ? 'border-b border-stage-line bg-stage/92 backdrop-blur-md' : 'border-b border-transparent'}"
>
	<div class="shell flex h-16 items-center justify-between gap-6">
		<a href="/" aria-label="ZenCode home"><Logo /></a>

		<nav class="hidden items-center gap-1 md:flex" aria-label="Main">
			{#each links as l (l.href)}
				<a
					href={l.href}
					aria-current={isActive(l.href) ? 'page' : undefined}
					class="rounded-md px-3 py-2 text-sm text-cream/70 transition-colors duration-150 hover:text-cream
						aria-[current=page]:text-sun">{l.label}</a
				>
			{/each}
		</nav>

		<div class="flex items-center gap-2">
			<Button href="/register" variant="sun" size="md" class="hidden sm:inline-flex">
				Register <ArrowRight class="size-4" />
			</Button>
			<button
				type="button"
				class="grid size-10 place-items-center rounded-md text-cream md:hidden"
				aria-label={menuOpen ? 'Close menu' : 'Open menu'}
				aria-expanded={menuOpen}
				aria-controls="mobile-nav"
				onclick={() => (menuOpen = !menuOpen)}
			>
				{#if menuOpen}<X class="size-5" />{:else}<Menu class="size-5" />{/if}
			</button>
		</div>
	</div>

	{#if menuOpen}
		<nav
			id="mobile-nav"
			aria-label="Mobile"
			class="border-t border-stage-line bg-stage md:hidden"
			transition:fly={{ y: -8, duration: 180 }}
		>
			<div class="shell flex flex-col py-3">
				{#each links as l, i (l.href)}
					<a
						href={l.href}
						aria-current={isActive(l.href) ? 'page' : undefined}
						class="flex h-12 items-center border-b border-stage-line/60 font-display text-lg text-cream aria-[current=page]:text-sun"
						in:fade={{ delay: 30 * i, duration: 150 }}>{l.label}</a
					>
				{/each}
				<Button href="/register" variant="sun" size="lg" class="mt-4 w-full">Register now</Button>
			</div>
		</nav>
	{/if}
</header>
