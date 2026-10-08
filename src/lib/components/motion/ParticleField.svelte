<script lang="ts">
	import { onMount } from 'svelte';

	interface Props {
		count?: number;
		/** Draw faint links between nearby particles */
		links?: boolean;
		class?: string;
	}
	let { count = 46, links = true, class: cls = '' }: Props = $props();

	let canvas: HTMLCanvasElement;

	onMount(() => {
		const ctx = canvas.getContext('2d');
		if (!ctx) return;
		const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
		const dpr = Math.min(devicePixelRatio || 1, 2);
		const color = getComputedStyle(canvas).getPropertyValue('--color-green-300').trim() || 'white';
		let w = 0;
		let h = 0;
		let raf = 0;
		let visible = true;

		const pts = Array.from({ length: count }, () => ({
			x: Math.random(),
			y: Math.random(),
			vx: (Math.random() - 0.5) * 0.00018,
			vy: (Math.random() - 0.5) * 0.00018,
			r: Math.random() * 1.4 + 0.6
		}));

		function resize() {
			w = canvas.clientWidth;
			h = canvas.clientHeight;
			canvas.width = w * dpr;
			canvas.height = h * dpr;
			ctx!.setTransform(dpr, 0, 0, dpr, 0, 0);
		}

		function draw() {
			const c = ctx!;
			c.clearRect(0, 0, w, h);
			if (!reduced) {
				for (const p of pts) {
					p.x = (p.x + p.vx + 1) % 1;
					p.y = (p.y + p.vy + 1) % 1;
				}
			}
			c.strokeStyle = color;
			c.fillStyle = color;
			if (links) {
				for (let i = 0; i < pts.length; i++) {
					for (let j = i + 1; j < pts.length; j++) {
						const d = Math.hypot((pts[i].x - pts[j].x) * w, (pts[i].y - pts[j].y) * h);
						if (d >= 120) continue;
						c.globalAlpha = (1 - d / 120) * 0.14;
						c.beginPath();
						c.moveTo(pts[i].x * w, pts[i].y * h);
						c.lineTo(pts[j].x * w, pts[j].y * h);
						c.stroke();
					}
				}
			}
			c.globalAlpha = 0.5;
			for (const p of pts) {
				c.beginPath();
				c.arc(p.x * w, p.y * h, p.r, 0, Math.PI * 2);
				c.fill();
			}
		}

		function loop() {
			draw();
			if (!reduced && visible) raf = requestAnimationFrame(loop);
		}

		const ro = new ResizeObserver(() => {
			resize();
			draw();
		});
		ro.observe(canvas);
		const io = new IntersectionObserver(([entry]) => {
			visible = entry.isIntersecting;
			cancelAnimationFrame(raf);
			if (visible) raf = requestAnimationFrame(loop);
		});
		io.observe(canvas);
		resize();
		raf = requestAnimationFrame(loop);

		return () => {
			cancelAnimationFrame(raf);
			ro.disconnect();
			io.disconnect();
		};
	});
</script>

<canvas
	bind:this={canvas}
	aria-hidden="true"
	class="pointer-events-none absolute inset-0 h-full w-full {cls}"
></canvas>
