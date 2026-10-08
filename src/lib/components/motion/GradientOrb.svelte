<script lang="ts">
	interface Props {
		tone?: 'green' | 'sun';
		size?: string;
		class?: string;
	}
	let { tone = 'green', size = '28rem', class: cls = '' }: Props = $props();
	const color = $derived(tone === 'sun' ? 'var(--color-sun)' : 'var(--color-green-500)');
</script>

<div
	aria-hidden="true"
	class="pointer-events-none absolute animate-orb rounded-full opacity-30 blur-3xl {cls}"
	style:width={size}
	style:height={size}
	style:background="radial-gradient(closest-side, {color}, transparent)"
></div>
