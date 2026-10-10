<script lang="ts">
	import { pop } from '$lib/live/motion';

	/**
	 * Countdown drawn from the server's `endsAt` (+ measured clock offset).
	 * The server closes responses; this ring only shows it. Last 5 seconds
	 * switch to the attention colour and pulse once per second.
	 */
	interface Props {
		endsAt: number | null;
		clockOffset: number;
		totalMs: number;
		tone?: 'stage' | 'light';
		class?: string;
		/** Out: true during the last five seconds. */
		warn?: boolean;
	}
	let { endsAt, clockOffset, totalMs, tone = 'stage', class: cls = 'size-24', warn = $bindable(false) }: Props = $props();

	let remaining = $state(0);

	$effect(() => {
		if (endsAt == null) {
			remaining = totalMs;
			return;
		}
		let raf = 0;
		const loop = () => {
			remaining = Math.max(0, endsAt - (Date.now() + clockOffset));
			if (remaining > 0) raf = requestAnimationFrame(loop);
		};
		loop();
		return () => cancelAnimationFrame(raf);
	});

	const R = 44;
	const C = 2 * Math.PI * R;
	const frac = $derived(totalMs > 0 ? remaining / totalMs : 0);
	const secs = $derived(Math.ceil(remaining / 1000));
	const warning = $derived(endsAt != null && remaining > 0 && secs <= 5);
	$effect(() => {
		warn = warning;
	});
	const color = $derived(warning ? 'var(--color-attention)' : tone === 'stage' ? 'var(--color-sun)' : 'var(--color-primary)');
</script>

<div class="relative grid shrink-0 place-items-center {cls}" role="timer" aria-label="{secs} seconds left">
	<svg viewBox="0 0 100 100" class="absolute inset-0 -rotate-90" aria-hidden="true">
		<circle cx="50" cy="50" r={R} fill="none" stroke-width="7" class={tone === 'stage' ? 'stroke-stage-line' : 'stroke-muted'} />
		<circle
			cx="50"
			cy="50"
			r={R}
			fill="none"
			stroke-width="7"
			stroke-linecap="round"
			stroke={color}
			stroke-dasharray={C}
			stroke-dashoffset={C * (1 - frac)}
			style="transition: stroke 300ms ease-out"
		/>
	</svg>
	{#key warning ? secs : -1}
		<span
			class="relative font-display font-semibold tabular {tone === 'stage' ? 'text-cream' : 'text-foreground'}"
			style:color={warning ? color : undefined}
			style:font-size="calc(var(--ring-text, 1) * 38cqi)"
			in:pop={{ duration: warning ? 380 : 0, from: 1.35 }}
			aria-hidden="true">{secs}</span
		>
	{/key}
</div>

<style>
	div {
		container-type: inline-size;
	}
</style>
