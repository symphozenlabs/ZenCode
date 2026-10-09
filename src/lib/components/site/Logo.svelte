<script lang="ts">
	import logo from '../../../assets/logo.png';

	/**
	 * ZenCode logo — always the official src/assets/logo.png, shown as it is.
	 * - variant: 'horizontal' (compact, for headers) or 'full' (larger, for hero panels).
	 * - tone is accepted for existing callers but no longer changes the logo.
	 */
	interface Props {
		tone?: 'light' | 'dark';
		variant?: 'horizontal' | 'full';
		class?: string;
	}
	let { variant = 'horizontal', class: cls = '' }: Props = $props();
</script>

<span class="inline-flex shrink-0 items-center justify-center {cls}">
	<img
		src={logo}
		alt="ZEN CODE Hackathon"
		width="1024"
		height="780"
		class="select-none {variant === 'full' ? 'h-auto w-full' : 'h-10 w-auto'}"
		draggable="false"
	/>
</span>
