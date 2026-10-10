<script lang="ts" module>
	export type ButtonVariant =
		| 'default'
		| 'outline'
		| 'secondary'
		| 'ghost'
		| 'destructive'
		| 'link'
		| 'sun'
		| 'stage';
	export type ButtonSize = 'sm' | 'md' | 'lg' | 'xl' | 'icon';
</script>

<script lang="ts">
	import type { Snippet } from 'svelte';
	import type { HTMLButtonAttributes } from 'svelte/elements';
	import Spinner from './Spinner.svelte';

	interface Props extends Omit<HTMLButtonAttributes, 'class'> {
		variant?: ButtonVariant;
		size?: ButtonSize;
		href?: string;
		loading?: boolean;
		class?: string;
		children: Snippet;
	}

	let {
		variant = 'default',
		size = 'md',
		href,
		loading = false,
		disabled,
		type = 'button',
		class: cls = '',
		children,
		...rest
	}: Props = $props();

	const variants: Record<ButtonVariant, string> = {
		default: 'bg-primary text-primary-foreground hover:bg-primary-hover',
		outline: 'border border-input bg-card text-foreground hover:bg-muted',
		secondary: 'bg-secondary text-secondary-foreground hover:bg-accent',
		ghost: 'text-foreground hover:bg-muted',
		destructive: 'bg-destructive text-white hover:bg-destructive/90',
		link: 'text-forest-700 underline-offset-4 hover:underline px-0!',
		// Public site
		sun: 'bg-sun text-forest-950 hover:bg-sun-light font-semibold',
		stage: 'border border-green-300/30 text-cream hover:border-green-300/60 hover:bg-cream/5'
	};

	const sizes: Record<ButtonSize, string> = {
		sm: 'h-8 px-3 text-[13px] gap-1.5',
		md: 'h-9 px-4 text-sm gap-2',
		lg: 'h-11 px-5 text-sm gap-2',
		xl: 'h-13 px-7 text-[15px] gap-2.5 tracking-wide',
		icon: 'size-9'
	};

	const classes = $derived(
		[
			'inline-flex shrink-0 items-center justify-center rounded-md font-medium whitespace-nowrap select-none',
			'transition-[background-color,border-color,color,opacity] duration-150 active:translate-y-px',
			'disabled:pointer-events-none disabled:opacity-50 aria-disabled:pointer-events-none aria-disabled:opacity-50',
			variants[variant],
			sizes[size],
			cls
		].join(' ')
	);
</script>

{#if href}
	<a {href} class={classes} aria-disabled={disabled || undefined}>
		{@render children()}
	</a>
{:else}
	<button {type} class={classes} disabled={disabled || loading} aria-busy={loading || undefined} {...rest}>
		{#if loading}<Spinner class="size-4" />{/if}
		{@render children()}
	</button>
{/if}
