<script lang="ts">
	/**
	 * ZenCode brand logo (static/brand/*, generated from "HACKATHON LOGO.png").
	 * - tone: 'light' for dark backgrounds, 'dark' for light backgrounds.
	 * - variant: 'horizontal' (mark + wordmark, for headers) or 'full' (stacked lockup).
	 */
	interface Props {
		tone?: 'light' | 'dark';
		variant?: 'horizontal' | 'full';
		class?: string;
	}
	let { tone = 'light', variant = 'horizontal', class: cls = '' }: Props = $props();

	const suffix = $derived(tone === 'light' ? '-light' : '');
</script>

{#if variant === 'full'}
	<img
		src="/brand/logo{suffix}.png"
		alt="ZenCode Hackathon"
		width="900"
		height="687"
		class="h-auto w-48 select-none {cls}"
		draggable="false"
	/>
{:else}
	<span class="inline-flex items-center gap-2.5 {cls}">
		<img src="/brand/mark{suffix}.png" alt="" width="512" height="430" class="h-8 w-auto shrink-0 select-none" draggable="false" />
		<img src="/brand/wordmark{suffix}.png" alt="ZenCode" width="800" height="72" class="h-3.5 w-auto select-none" draggable="false" />
	</span>
{/if}
