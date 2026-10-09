<script lang="ts">
	import { Tween } from 'svelte/motion';
	import { cubicOut } from 'svelte/easing';

	/**
	 * Animated XP number; counts from the previous value to the new one.
	 * `from` makes the first render count up too (e.g. final scores).
	 */
	let { value, duration = 700, from, class: cls = '' }: { value: number; duration?: number; from?: number; class?: string } = $props();

	const shown = new Tween(0, { easing: cubicOut });
	let first = true;
	$effect(() => {
		const v = value;
		if (first) {
			first = false;
			shown.set(from ?? v, { duration: 0 });
			if (from === undefined) return;
		}
		shown.set(v, { duration: matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : duration });
	});
</script>

<span class="tabular {cls}">{Math.round(shown.current).toLocaleString('en-IN')}</span>
