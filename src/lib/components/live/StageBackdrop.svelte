<script lang="ts">
	import { onMount, untrack } from 'svelte';
	import type * as T from 'three';
	import { reduced } from '$lib/live/motion';
	import { useGsap } from '$lib/live/gsap';

	/**
	 * Presenter backdrop, light and projector-friendly. A Three.js scene:
	 * a shader of slow, flowing pastel colour (one hue follows the current
	 * slide's accent) over a field of glowing dots rolling like an ocean
	 * across the lower stage. Each scene change (`pulse`) sends a ripple
	 * through the colour and a wave through the dots. The centre stays
	 * near-white so text is crisp.
	 * Falls back to a CSS wash when WebGL isn't available.
	 */
	let { accent = 'var(--color-brand)', pulse = '' }: { accent?: string; pulse?: string } = $props();

	let host: HTMLDivElement;
	let failed = $state(false);
	let api: { setAccent: (css: string) => void; kick: () => void } | null = null;

	/** 'var(--color-chart-3)' → the colour it resolves to on this stage. */
	function resolve(css: string): string {
		const name = /var\((--[\w-]+)\)/.exec(css)?.[1];
		const v = name ? getComputedStyle(host).getPropertyValue(name).trim() : css;
		return v || '#588c45';
	}

	onMount(() => {
		let disposed = false;
		let cleanup = () => {};
		(async () => {
			const THREE = await import('three');
			const gsap = useGsap();
			if (disposed) return;

			let renderer: T.WebGLRenderer;
			try {
				renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, powerPreference: 'low-power' });
			} catch {
				failed = true;
				return;
			}
			renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
			renderer.outputColorSpace = THREE.SRGBColorSpace;
			renderer.domElement.className = 'absolute inset-0 size-full';
			host.appendChild(renderer.domElement);

			// ---- Colour field (full-screen shader) ---------------------------------
			const col = (c: string) => new THREE.Color(resolve(c));
			const uniforms = {
				uTime: { value: 0 },
				uAspect: { value: 1 },
				uRipple: { value: -10 },
				uPaper: { value: col('var(--color-stage)') },
				uA: { value: col('var(--color-chart-3)') },
				uB: { value: col('var(--color-chart-5)') },
				uC: { value: col('var(--color-chart-6)') },
				uAccent: { value: col(untrack(() => accent)) }
			};
			const field = new THREE.Mesh(
				new THREE.PlaneGeometry(2, 2),
				new THREE.ShaderMaterial({
					uniforms,
					depthWrite: false,
					vertexShader: /* glsl */ `varying vec2 vUv; void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`,
					fragmentShader: /* glsl */ `
						precision highp float;
						varying vec2 vUv;
						uniform float uTime, uAspect, uRipple;
						uniform vec3 uPaper, uA, uB, uC, uAccent;
						// Simplex-ish value noise, cheap and smooth
						float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
						float noise(vec2 p) {
							vec2 i = floor(p), f = fract(p);
							vec2 u = f * f * (3.0 - 2.0 * f);
							return mix(mix(hash(i), hash(i + vec2(1, 0)), u.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), u.x), u.y);
						}
						float fbm(vec2 p) { float v = 0.0, a = 0.5; for (int i = 0; i < 4; i++) { v += a * noise(p); p *= 2.02; a *= 0.5; } return v; }
						void main() {
							vec2 p = vec2((vUv.x - 0.5) * uAspect, vUv.y - 0.5);
							float t = uTime * 0.035;
							// Ripple from the centre on each scene change
							float age = uTime - uRipple;
							float r = length(p);
							float wave = exp(-age * 1.4) * sin(r * 26.0 - age * 9.0) * (1.0 - smoothstep(age * 0.9 - 0.15, age * 0.9 + 0.15, r));
							// Domain-warped flow
							vec2 q = vec2(fbm(p * 1.4 + t), fbm(p * 1.4 - t + 3.1));
							float n = fbm(p * 1.1 + q * 1.6 + wave * 0.12);
							vec3 c = mix(uA, uB, smoothstep(0.25, 0.75, q.x));
							c = mix(c, uC, smoothstep(0.55, 0.9, q.y) * 0.7);
							c = mix(c, uAccent, smoothstep(0.45, 0.85, n) * 0.85);
							// Keep the middle near-white for text; colour lives toward the edges
							float edge = smoothstep(0.18, 0.85, length(p * vec2(0.85, 1.25)));
							float amount = 0.06 + 0.34 * edge + wave * 0.06;
							vec3 col = mix(uPaper, c, clamp(amount, 0.0, 0.42));
							// Faint paper grain
							col += (hash(vUv * 900.0 + uTime) - 0.5) * 0.006;
							gl_FragColor = vec4(col, 1.0);
							#include <colorspace_fragment>
						}`
				})
			);
			const bgScene = new THREE.Scene();
			bgScene.add(field);
			const bgCam = new THREE.Camera();

			// ---- Dot-wave field: an ocean of glowing points across the lower stage ----
			const scene = new THREE.Scene();
			const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 100);
			camera.position.set(0, 2.2, 9);
			camera.lookAt(0, -0.6, -6);

			const COLS = 200;
			const ROWS = 80;
			const grid = new Float32Array(COLS * ROWS * 2);
			for (let r = 0, i = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++, i += 2) ((grid[i] = c / (COLS - 1)), (grid[i + 1] = r / (ROWS - 1)));
			const dotsGeo = new THREE.BufferGeometry();
			dotsGeo.setAttribute('aGrid', new THREE.BufferAttribute(grid, 2));
			// Positions come from the shader; give the geometry a bound so it's never culled
			dotsGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(COLS * ROWS * 3), 3));
			dotsGeo.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, -3, -10), 60);
			const dotUniforms = { uTime: uniforms.uTime, uRipple: uniforms.uRipple, uA: uniforms.uA, uB: uniforms.uB, uAccent: uniforms.uAccent, uScale: { value: 1 } };
			const dots = new THREE.Points(
				dotsGeo,
				new THREE.ShaderMaterial({
					uniforms: dotUniforms,
					transparent: true,
					depthWrite: false,
					vertexShader: /* glsl */ `
						attribute vec2 aGrid;
						uniform float uTime, uRipple, uScale;
						uniform vec3 uA, uB, uAccent;
						varying vec3 vColor;
						varying float vAlpha;
						void main() {
							float u = aGrid.x, v = aGrid.y;
							float x = (u - 0.5) * 40.0;
							float z = mix(4.0, -28.0, v);
							float t = uTime;
							// Rolling swell: three crossing waves
							float y = sin(x * 0.32 + t * 0.55) * 0.38 + sin(z * 0.42 - t * 0.75) * 0.32 + sin((x + z) * 0.18 + t * 0.35) * 0.45;
							// Scene-change wave rolling out from the front centre
							float age = t - uRipple;
							float d = length(vec2(x, z + 2.0));
							float ring = age < 0.0 ? 0.0 : exp(-age * 0.55) * exp(-pow(d - age * 10.0, 2.0) * 0.12);
							y += ring * 1.8;
							vec4 mv = modelViewMatrix * vec4(x, y - 4.4, z, 1.0);
							gl_Position = projectionMatrix * mv;
							gl_PointSize = uScale * (46.0 + ring * 36.0) / -mv.z;
							float crest = smoothstep(-0.6, 0.9, y);
							vColor = mix(mix(uA, uB, u), uAccent, crest * 0.75 + ring * 0.6);
							// Fade toward the horizon and the sides
							vAlpha = (0.4 + 0.6 * crest + ring) * (1.0 - smoothstep(0.25, 0.7, v)) * smoothstep(0.0, 0.12, u) * (1.0 - smoothstep(0.88, 1.0, u));
						}`,
					fragmentShader: /* glsl */ `
						precision highp float;
						varying vec3 vColor;
						varying float vAlpha;
						void main() {
							float d = length(gl_PointCoord - 0.5);
							float a = (1.0 - smoothstep(0.15, 0.5, d)) * clamp(vAlpha, 0.0, 1.0);
							if (a < 0.01) discard;
							gl_FragColor = vec4(vColor, a);
							#include <colorspace_fragment>
						}`
				})
			);
			scene.add(dots);

			// ---- Sizing, loop, pulses --------------------------------------------------
			const resize = () => {
				const w = host.clientWidth || 1;
				const h = host.clientHeight || 1;
				renderer.setSize(w, h, false);
				uniforms.uAspect.value = w / h;
				camera.aspect = w / h;
				camera.updateProjectionMatrix();
				// Dots keep the same on-screen size at any resolution
				dotUniforms.uScale.value = (h / 1080) * renderer.getPixelRatio() * 2;
			};
			const ro = new ResizeObserver(resize);
			ro.observe(host);
			resize();

			const still = reduced();
			const clock = new THREE.Clock();
			let raf = 0;
			const frame = () => {
				const t = clock.getElapsedTime();
				uniforms.uTime.value = t;
				renderer.autoClear = true;
				renderer.render(bgScene, bgCam);
				renderer.autoClear = false;
				renderer.render(scene, camera);
				if (!still) raf = requestAnimationFrame(frame);
			};
			frame();
			const onVis = () => {
				cancelAnimationFrame(raf);
				if (!document.hidden && !still) raf = requestAnimationFrame(frame);
			};
			document.addEventListener('visibilitychange', onVis);

			api = {
				setAccent(css) {
					const target = new THREE.Color(resolve(css));
					if (still) return void (uniforms.uAccent.value.copy(target), frame());
					gsap.to(uniforms.uAccent.value, { r: target.r, g: target.g, b: target.b, duration: 1.6, ease: 'sine.inOut' });
				},
				kick() {
					if (still) return;
					// One clock drives both the colour ripple and the wave through the dots
					uniforms.uRipple.value = uniforms.uTime.value;
				}
			};

			cleanup = () => {
				cancelAnimationFrame(raf);
				document.removeEventListener('visibilitychange', onVis);
				ro.disconnect();
				gsap.killTweensOf(uniforms.uAccent.value);
				dotsGeo.dispose();
				(dots.material as T.Material).dispose();
				field.geometry.dispose();
				(field.material as T.Material).dispose();
				renderer.dispose();
				renderer.domElement.remove();
				api = null;
			};
		})();
		return () => {
			disposed = true;
			cleanup();
		};
	});

	$effect(() => {
		const a = accent;
		untrack(() => api?.setAccent(a));
	});
	let lastPulse = untrack(() => pulse);
	$effect(() => {
		const p = pulse;
		if (p === lastPulse) return;
		lastPulse = p;
		untrack(() => api?.kick());
	});
</script>

<div bind:this={host} aria-hidden="true" class="pointer-events-none absolute inset-0 overflow-hidden">
	<!-- Fallback / first paint before WebGL is ready -->
	<div class="absolute inset-0" style:background="radial-gradient(130% 100% at 50% 0%, #ffffff 0%, var(--color-stage) 55%, #f3ecdf 100%)"></div>
	{#if failed}
		<div
			class="absolute inset-0 opacity-70"
			style:background="radial-gradient(40% 50% at 0% 0%, color-mix(in srgb, var(--color-chart-3) 30%, transparent), transparent), radial-gradient(40% 50% at 100% 0%, color-mix(in srgb, var(--color-chart-5) 28%, transparent), transparent), radial-gradient(50% 50% at 50% 110%, color-mix(in srgb, {accent} 30%, transparent), transparent)"
		></div>
	{/if}
</div>
