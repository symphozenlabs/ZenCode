<script lang="ts">
	import { Tween } from 'svelte/motion';
	import type { NumberInputSpec } from '$lib/live/slides';
	import type { NumberSeries } from '$lib/live/types';
	import { reduced } from '$lib/live/motion';
	import { fmtNum } from './text';

	/**
	 * One statement as a dial: each point on the scale is an arc segment that
	 * thickens and brightens with the people who chose it, and a needle swings
	 * (with a little overshoot) to the average.
	 */
	let {
		spec,
		series,
		color,
		show,
		delay = 0
	}: { spec: NumberInputSpec; series: NumberSeries | undefined; color: string; show: boolean; delay?: number } = $props();

	const CX = 120;
	const CY = 118;
	const R = 92;
	const GAP = 3; // degrees between segments

	const stops = $derived(Array.from({ length: spec.max - spec.min + 1 }, (_, i) => spec.min + i));
	const maxBin = $derived(Math.max(1, ...(series?.bins ?? [0])));
	const frac = (v: number) => (v - spec.min) / Math.max(1, spec.max - spec.min);

	/** Point on the arc; 0 = left end (180°), 1 = right end (360°). */
	const at = (t: number, r = R) => {
		const a = Math.PI * (1 + t);
		return [CX + r * Math.cos(a), CY + r * Math.sin(a)] as const;
	};
	const arc = (t0: number, t1: number) => {
		const [x0, y0] = at(t0);
		const [x1, y1] = at(t1);
		return `M ${x0} ${y0} A ${R} ${R} 0 0 1 ${x1} ${y1}`;
	};
	const seg = $derived(
		stops.map((v, k) => {
			const span = 1 / stops.length;
			const pad = GAP / 180 / 2;
			return { v, k, t0: k * span + pad, t1: (k + 1) * span - pad, mid: (k + 0.5) * span };
		})
	);

	const ease = (x: number) => {
		// easeOutBack: a needle that overshoots and settles
		const c1 = 1.4;
		return 1 + (c1 + 1) * Math.pow(x - 1, 3) + c1 * Math.pow(x - 1, 2);
	};
	const needle = new Tween(0, { easing: ease });
	const value = new Tween(0, { easing: (x) => 1 - Math.pow(1 - x, 4) });
	$effect(() => {
		const m = series?.mean;
		const on = show && m != null;
		const d = reduced() ? 0 : 1600;
		needle.set(on ? frac(m!) : 0, { duration: d, delay: on ? delay + 300 : 0 });
		value.set(on ? m! : spec.min, { duration: d, delay: on ? delay + 300 : 0 });
	});

	const tip = $derived(at(needle.current, R - 6));
	const hasMean = $derived(show && series?.mean != null);
</script>

<div class="relative flex h-full min-h-0 flex-col items-center justify-center rounded-2xl border border-stage-line bg-stage-raised/80 px-[1.5vw] py-[2vh] shadow-[0_18px_50px_-24px_color-mix(in_srgb,var(--color-cream)_30%,transparent)]">
	<!-- Glow pooled under the dial -->
	<div
		aria-hidden="true"
		class="pointer-events-none absolute inset-x-[15%] bottom-[10%] h-1/2 rounded-full blur-3xl transition-opacity duration-1000"
		style:background="radial-gradient(closest-side, color-mix(in srgb, {color} 45%, transparent), transparent)"
		style:opacity={hasMean ? 0.35 : 0.08}
	></div>

	<svg viewBox="0 0 240 140" class="relative w-full max-w-[min(100%,46vh)] overflow-visible" role="img" aria-label="{spec.label}: average {series?.mean != null ? fmtNum(series.mean) : 'not yet'}">
		<!-- Track -->
		<path d={arc(0, 1)} fill="none" stroke="var(--color-stage-line)" stroke-width="22" stroke-linecap="round" />
		{#each seg as s (s.v)}
			{@const n = series?.bins[s.k] ?? 0}
			{@const f = show ? n / maxBin : 0}
			<path
				d={arc(s.t0, s.t1)}
				fill="none"
				stroke={color}
				stroke-linecap="butt"
				style:stroke-width="{6 + f * 16}px"
				style:opacity={0.25 + f * 0.75}
				style:filter={f > 0.99 ? `drop-shadow(0 0 6px ${color})` : 'none'}
				style:transition="stroke-width 900ms var(--ease-spring) {delay + s.k * 70}ms, opacity 700ms {delay + s.k * 70}ms"
			/>
			{@const [lx, ly] = at(s.mid, R + 22)}
			<text x={lx} y={ly} text-anchor="middle" dominant-baseline="middle" class="fill-cream/65 font-mono text-[9px] tabular">{s.v}</text>
			{#if show && n}
				{@const [cx, cy] = at(s.mid, R - 24)}
				<text x={cx} y={cy} text-anchor="middle" dominant-baseline="middle" class="fill-cream/80 text-[9px] font-semibold tabular">{n}</text>
			{/if}
		{/each}

		<!-- Needle -->
		<g style:opacity={hasMean ? 1 : 0.25} style:transition="opacity 500ms">
			<line x1={CX} y1={CY} x2={tip[0]} y2={tip[1]} stroke="var(--color-cream)" stroke-width="3" stroke-linecap="round" style:filter="drop-shadow(0 1px 3px color-mix(in srgb, var(--color-cream) 35%, transparent))" />
			<circle cx={CX} cy={CY} r="9" fill="var(--color-stage-raised)" stroke={color} stroke-width="3" />
			<circle cx={tip[0]} cy={tip[1]} r="4" fill="var(--color-cream)" />
		</g>
	</svg>

	<p class="relative -mt-[1vh] font-display text-stage-xl font-bold text-cream tabular transition-opacity duration-500" style:opacity={hasMean ? 1 : 0.25}>
		{hasMean ? fmtNum(Math.round(value.current * 10) / 10) : '–'}
	</p>
	<p class="relative mt-[1vh] text-center text-stage-md font-medium text-balance text-cream">{spec.label}</p>
	<div class="relative mt-[1vh] flex w-full max-w-[min(100%,46vh)] justify-between font-mono text-stage-xs tracking-[0.16em] text-cream/45 uppercase">
		<span>{spec.minLabel || spec.min}</span><span>{spec.maxLabel || spec.max}</span>
	</div>
</div>
