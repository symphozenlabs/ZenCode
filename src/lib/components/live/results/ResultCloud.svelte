<script lang="ts">
	import type { SlideResults, TextGroup } from '$lib/live/types';
	import { burst } from '$lib/live/motion';
	import { hashTint } from './text';

	/**
	 * Word cloud. Words are packed along a spiral from the centre, biggest
	 * first; as counts change every word glides to its new spot and size.
	 * The whole cloud scales down to fit the stage.
	 */
	let { results, show }: { results: SlideResults | null; show: boolean } = $props();

	const groups = $derived<TextGroup[]>(results?.input === 'text' ? results.groups : []);

	let w = $state(0);
	let h = $state(0);

	let ctx: CanvasRenderingContext2D | null = null;
	function measure(text: string, size: number) {
		ctx ??= document.createElement('canvas').getContext('2d');
		if (!ctx) return text.length * size * 0.56;
		ctx.font = `600 ${size}px "Space Grotesk", Inter, sans-serif`;
		return ctx.measureText(text).width;
	}

	interface Placed {
		g: TextGroup;
		x: number;
		y: number;
		size: number;
		bw: number;
		bh: number;
	}

	const layout = $derived.by(() => {
		if (!w || !h || !groups.length) return { words: [] as Placed[], fit: 1 };
		const maxCount = groups[0].count;
		const base = Math.min(110, Math.min(w, h) * 0.17);
		const ordered = [...groups].sort((a, b) => b.count - a.count || a.at - b.at);
		const placed: Placed[] = [];
		const pad = 6;
		const ratio = w / h;
		for (const g of ordered) {
			const size = Math.round(base * (0.3 + 0.7 * Math.sqrt(g.count / maxCount)));
			const bw = measure(g.text, size) + pad * 2;
			const bh = size * 1.15 + pad;
			let x = 0;
			let y = 0;
			for (let t = 0; t < 600; t += 0.18) {
				const r = 4 * t;
				x = r * Math.cos(t) * ratio;
				y = r * Math.sin(t);
				const hit = placed.some((p) => Math.abs(p.x - x) * 2 < p.bw + bw && Math.abs(p.y - y) * 2 < p.bh + bh);
				if (!hit) break;
			}
			placed.push({ g, x, y, size, bw, bh });
		}
		let ex = 0;
		let ey = 0;
		for (const p of placed) {
			ex = Math.max(ex, Math.abs(p.x) + p.bw / 2);
			ey = Math.max(ey, Math.abs(p.y) + p.bh / 2);
		}
		const fit = Math.min(1, w / 2 / Math.max(1, ex), h / 2 / Math.max(1, ey));
		return { words: placed, fit };
	});
	const top = $derived(groups[0]?.key);
</script>

<div class="stage-panel relative h-full overflow-hidden rounded-2xl" bind:clientWidth={w} bind:clientHeight={h}>
	{#if !groups.length}
		<div class="grid h-full place-items-center">
			<p class="flex items-center gap-3 text-stage-md text-cream/65">
				<span class="flex gap-1.5" aria-hidden="true">
					{#each [0, 1, 2] as i (i)}<span class="size-2 animate-pulse-dot rounded-full bg-chart-3" style:animation-delay="{i * 200}ms"></span>{/each}
				</span>
				Waiting for the first words
			</p>
		</div>
	{:else}
		<div
			class="absolute top-1/2 left-1/2 transition-[transform,filter] duration-1000 ease-out-quart"
			style:transform="scale({layout.fit})"
			style:filter={show ? 'none' : 'blur(18px)'}
			aria-hidden={!show}
		>
			{#each layout.words as p (p.g.key)}
				<span
					class="absolute top-0 left-0 font-display leading-none font-semibold whitespace-nowrap"
					style:transform="translate({p.x - p.bw / 2 + 6}px, {p.y - p.bh / 2}px)"
					style:font-size="{p.size}px"
					style:color="var(--color-chart-{hashTint(p.g.key)})"
					style:text-shadow={p.g.key === top ? '0 0 40px color-mix(in srgb, currentColor 55%, transparent)' : 'none'}
					style:transition="transform 900ms var(--ease-spring), font-size 900ms var(--ease-spring)"
				>
					<span class="inline-block" in:burst={{ duration: 900, rotate: -12 }}>{p.g.text}</span>
				</span>
			{/each}
		</div>
		<ul class="sr-only">
			{#each groups as g (g.key)}<li>{g.text}: {g.count}</li>{/each}
		</ul>
	{/if}
</div>
