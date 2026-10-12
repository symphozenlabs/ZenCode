<script lang="ts">
	import logo from '../../../assets/logo.png';
	import logoWhite from '../../../assets/ZENCODE_logo_white_centered.png';

	/**
	 * ZenCode logo — official src/assets/logo.png, or the white variant for dark surfaces.
	 * - variant: 'horizontal' (compact, for headers) or 'full' (larger, for hero panels).
	 * - tone: 'light' renders the white logo (use on dark backgrounds), 'dark' the standard logo.
	 */
	interface Props {
		tone?: 'light' | 'dark';
		variant?: 'horizontal' | 'full';
		class?: string;
	}
	let { tone = 'dark', variant = 'horizontal', class: cls = '' }: Props = $props();

	const src = $derived(tone === 'light' ? logoWhite : logo);
	const width = $derived(tone === 'light' ? 2126 : 1024);
	const height = $derived(tone === 'light' ? 612 : 780);
</script>

<span class="inline-flex shrink-0 items-center justify-center {cls}">
	<img
		{src}
		alt="ZEN CODE Hackathon"
		{width}
		{height}
		class="select-none {variant === 'full' ? 'h-auto w-full' : 'h-10 w-auto'}"
		draggable="false"
	/>
</span>
