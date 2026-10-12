import { BIRD_R, GROUND_Y, PIPE_W, WORLD_H, type World } from './engine';

/**
 * Canvas renderer for Flappy Bird. Everything is drawn in world units (the
 * field is WORLD_H tall) and scaled to the canvas, so it is crisp at any size.
 * Static textures (bamboo, ground) are drawn once per resize; the rest is
 * cheap vector work each frame.
 *
 * The sky moves through golden hour → sunset → twilight → night as `theme`
 * goes 0 → 3 (the game ties it to the score).
 */

export type RGB = [number, number, number];

export interface Palette {
	skyTop: RGB;
	skyMid: RGB;
	skyLow: RGB;
	sun: RGB;
	glow: RGB;
	sunH: number;
	sunA: number;
	moonA: number;
	far: RGB;
	near: RGB;
	hill: RGB;
	tree: RGB;
	cloud: RGB;
	stars: number;
	fireflies: number;
	night: number;
}

export const hex = (h: string): RGB => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];

const PALETTES: Palette[] = [
	// Golden hour
	{ skyTop: hex('#3d7fc0'), skyMid: hex('#8fc2e2'), skyLow: hex('#fbe3ad'), sun: hex('#fff6d8'), glow: hex('#ffd98a'), sunH: 0.78, sunA: 1, moonA: 0, far: hex('#86aac0'), near: hex('#5f8f7c'), hill: hex('#4b8a47'), tree: hex('#2c6a39'), cloud: hex('#ffffff'), stars: 0, fireflies: 0, night: 0 },
	// Sunset
	{ skyTop: hex('#344a8c'), skyMid: hex('#e0876e'), skyLow: hex('#ffcd84'), sun: hex('#ffe6a8'), glow: hex('#ff9650'), sunH: 0.42, sunA: 1, moonA: 0, far: hex('#9a7896'), near: hex('#6a5676'), hill: hex('#3e5d44'), tree: hex('#27442e'), cloud: hex('#ffd5c0'), stars: 0.05, fireflies: 0, night: 0.08 },
	// Twilight
	{ skyTop: hex('#151c47'), skyMid: hex('#59407c'), skyLow: hex('#d4706a'), sun: hex('#ffb27a'), glow: hex('#ff6656'), sunH: 0.08, sunA: 0.9, moonA: 0.2, far: hex('#483e69'), near: hex('#332c50'), hill: hex('#213347'), tree: hex('#162433'), cloud: hex('#c497b4'), stars: 0.55, fireflies: 0.4, night: 0.3 },
	// Night
	{ skyTop: hex('#040714'), skyMid: hex('#0d1535'), skyLow: hex('#26315f'), sun: hex('#ffb27a'), glow: hex('#ff6656'), sunH: -0.1, sunA: 0, moonA: 1, far: hex('#1d2446'), near: hex('#141a37'), hill: hex('#0f1e2a'), tree: hex('#08131b'), cloud: hex('#384471'), stars: 1, fireflies: 1, night: 0.4 }
];

const mixN = (a: number, b: number, t: number) => a + (b - a) * t;
export const mixC = (a: RGB, b: RGB, t: number): RGB => [mixN(a[0], b[0], t), mixN(a[1], b[1], t), mixN(a[2], b[2], t)];
export const rgb = (c: RGB, a = 1) => `rgba(${c[0] | 0},${c[1] | 0},${c[2] | 0},${a})`;

export function palette(theme: number): Palette {
	const t = Math.max(0, Math.min(PALETTES.length - 1, theme));
	const i = Math.min(PALETTES.length - 2, Math.floor(t));
	const f = t - i;
	const a = PALETTES[i];
	const b = PALETTES[i + 1];
	const out = {} as Record<string, unknown>;
	for (const k of Object.keys(a) as (keyof Palette)[]) {
		const va = a[k];
		const vb = b[k];
		out[k] = typeof va === 'number' ? mixN(va, vb as number, f) : mixC(va, vb as RGB, f);
	}
	return out as unknown as Palette;
}

/** Cheap deterministic hash → [0, 1). */
export const hash = (n: number) => {
	const x = Math.sin(n * 127.1 + 311.7) * 43758.5453;
	return x - Math.floor(x);
};

export interface Particle {
	kind: 'puff' | 'feather' | 'spark' | 'dust';
	x: number;
	y: number;
	vx: number;
	vy: number;
	life: number;
	ttl: number;
	size: number;
	rot: number;
	vr: number;
	color: string;
}

export interface Frame {
	world: World;
	/** Interpolated bird state and scroll. */
	y: number;
	rot: number;
	distance: number;
	scroll: number;
	/** Real seconds since start, for ambient animation. */
	clock: number;
	theme: number;
	wing: number;
	squash: number;
	particles: Particle[];
	shake: number;
	flash: number;
}

const STARS = Array.from({ length: 110 }, (_, i) => ({
	x: hash(i + 1),
	y: hash(i + 101) * 0.62,
	r: 0.5 + hash(i + 201) * 1.3,
	p: hash(i + 301) * Math.PI * 2
}));

const CLOUDS = Array.from({ length: 10 }, (_, i) => ({
	x: hash(i + 401) * 2200,
	y: 70 + hash(i + 501) * 250,
	s: 0.55 + hash(i + 601) * 0.9,
	par: 0.04 + hash(i + 701) * 0.12,
	drift: 4 + hash(i + 801) * 8
}));
const PUFFS: [number, number, number][] = [
	[0, 0, 26],
	[24, -12, 24],
	[50, -2, 27],
	[74, 6, 18],
	[26, 8, 24],
	[-22, 6, 17]
];

const FIREFLIES = Array.from({ length: 22 }, (_, i) => ({ x: hash(i + 901), y: 470 + hash(i + 1001) * 150, p: hash(i + 1101) * 6.28, s: 0.6 + hash(i + 1201) }));

const farY = (x: number) => 452 - (70 + 50 * Math.sin(x * 0.0071 + 1.3) + 32 * Math.sin(x * 0.0153 + 0.4) + 14 * Math.sin(x * 0.037 + 2.1));
const nearY = (x: number) => 520 - (42 + 30 * Math.sin(x * 0.0102 + 4.1) + 18 * Math.sin(x * 0.024 + 1.7) + 7 * Math.sin(x * 0.061));
const hillY = (x: number) => 590 - (20 + 12 * Math.sin(x * 0.0155 + 0.6) + 7 * Math.sin(x * 0.041 + 2.3));

const NODE_GAP = 92;
const CAP_H = 28;
const CAP_OVER = 6;
const GROUND_TILE = 96;
const GRASS_LIP = 9;

export function createRenderer(canvas: HTMLCanvasElement) {
	const ctx = canvas.getContext('2d', { alpha: false })!;
	let cssW = 1;
	let cssH = 1;
	let dpr = 1;
	/** CSS px per world unit. */
	let s = 1;
	let px = 1; // device px per world unit
	let viewW = 400;
	let birdX = 120;
	let bamboo: HTMLCanvasElement | null = null;
	let cap: HTMLCanvasElement | null = null;
	let ground: HTMLCanvasElement | null = null;
	let vignette: CanvasGradient | null = null;

	function makeCanvas(w: number, h: number) {
		const c = document.createElement('canvas');
		c.width = Math.max(1, Math.ceil(w * px));
		c.height = Math.max(1, Math.ceil(h * px));
		const g = c.getContext('2d')!;
		// Scale to the whole-pixel size, so repeating tiles meet exactly.
		g.scale(c.width / w, c.height / h);
		return [c, g] as const;
	}

	function bambooGradient(g: CanvasRenderingContext2D, x0: number, w: number, dark = 0) {
		const grad = g.createLinearGradient(x0, 0, x0 + w, 0);
		const d = (c: string) => (dark ? mixHex(c, '#0b2410', dark) : c);
		grad.addColorStop(0, d('#21461a'));
		grad.addColorStop(0.1, d('#3f7a2a'));
		grad.addColorStop(0.27, d('#9fd06a'));
		grad.addColorStop(0.36, d('#c9ec97'));
		grad.addColorStop(0.48, d('#86bd4f'));
		grad.addColorStop(0.78, d('#4d8a31'));
		grad.addColorStop(1, d('#1d3f16'));
		return grad;
	}

	function buildTextures() {
		// Bamboo stalk: nodes measured from the top, so the cap end lines up.
		const [b, bg] = makeCanvas(PIPE_W, WORLD_H);
		bg.fillStyle = bambooGradient(bg, 0, PIPE_W);
		bg.fillRect(0, 0, PIPE_W, WORLD_H);
		// Fibres
		for (let i = 0; i < 9; i++) {
			const x = 6 + hash(i + 31) * (PIPE_W - 12);
			bg.fillStyle = `rgba(20,50,10,${0.05 + hash(i + 41) * 0.06})`;
			bg.fillRect(x, 0, 0.8, WORLD_H);
		}
		for (let y = CAP_H + 40; y < WORLD_H; y += NODE_GAP) {
			const ng = bg.createLinearGradient(0, y - 4, 0, y + 6);
			ng.addColorStop(0, 'rgba(20,45,12,0)');
			ng.addColorStop(0.45, 'rgba(20,45,12,0.55)');
			ng.addColorStop(0.62, 'rgba(230,250,190,0.45)');
			ng.addColorStop(1, 'rgba(230,250,190,0)');
			bg.fillStyle = ng;
			bg.fillRect(0, y - 4, PIPE_W, 10);
			// Speckles near the node
			for (let k = 0; k < 5; k++) {
				bg.fillStyle = 'rgba(30,60,15,0.18)';
				bg.beginPath();
				bg.ellipse(8 + hash(y + k) * (PIPE_W - 16), y + 10 + hash(y * 3 + k) * 14, 1.6, 0.9, 0, 0, Math.PI * 2);
				bg.fill();
			}
		}
		bamboo = b;

		// Cap: a thicker joint at the mouth of the gap.
		const cw = PIPE_W + CAP_OVER * 2;
		const [c, cg] = makeCanvas(cw, CAP_H);
		cg.fillStyle = bambooGradient(cg, 0, cw, 0.15);
		roundRect(cg, 0, 0, cw, CAP_H, 5);
		cg.fill();
		const rim = cg.createLinearGradient(0, 0, 0, CAP_H);
		rim.addColorStop(0, 'rgba(240,255,200,0.5)');
		rim.addColorStop(0.18, 'rgba(240,255,200,0)');
		rim.addColorStop(0.8, 'rgba(10,30,5,0)');
		rim.addColorStop(1, 'rgba(10,30,5,0.45)');
		cg.fillStyle = rim;
		roundRect(cg, 0, 0, cw, CAP_H, 5);
		cg.fill();
		cg.strokeStyle = 'rgba(12,35,8,0.7)';
		cg.lineWidth = 1.5;
		roundRect(cg, 0.75, 0.75, cw - 1.5, CAP_H - 1.5, 5);
		cg.stroke();
		cap = c;

		// Ground tile: grass lip (drawn above GROUND_Y), turf, then soil.
		const gh = WORLD_H - GROUND_Y + GRASS_LIP;
		const [t, tg] = makeCanvas(GROUND_TILE, gh);
		const soil = tg.createLinearGradient(0, GRASS_LIP + 12, 0, gh);
		soil.addColorStop(0, '#6a4a2a');
		soil.addColorStop(1, '#3f2a17');
		tg.fillStyle = soil;
		tg.fillRect(0, GRASS_LIP + 10, GROUND_TILE, gh);
		tg.save();
		tg.beginPath();
		tg.rect(0, GRASS_LIP + 12, GROUND_TILE, gh);
		tg.clip();
		tg.strokeStyle = 'rgba(255,220,170,0.07)';
		tg.lineWidth = 9;
		for (let x = -GROUND_TILE; x < GROUND_TILE * 2; x += 24) {
			tg.beginPath();
			tg.moveTo(x, GRASS_LIP + 12);
			tg.lineTo(x + 40, gh);
			tg.stroke();
		}
		for (let i = 0; i < 14; i++) {
			const x = hash(i + 61) * GROUND_TILE;
			const y = GRASS_LIP + 22 + hash(i + 71) * (gh - GRASS_LIP - 26);
			const r = 1.2 + hash(i + 81) * 2.4;
			for (const dx of [0, -GROUND_TILE, GROUND_TILE]) {
				tg.fillStyle = 'rgba(30,18,8,0.35)';
				tg.beginPath();
				tg.ellipse(x + dx, y + 0.8, r, r * 0.7, 0, 0, Math.PI * 2);
				tg.fill();
				tg.fillStyle = 'rgba(190,160,120,0.35)';
				tg.beginPath();
				tg.ellipse(x + dx - 0.4, y - 0.3, r * 0.8, r * 0.55, 0, 0, Math.PI * 2);
				tg.fill();
			}
		}
		tg.restore();
		const turf = tg.createLinearGradient(0, GRASS_LIP, 0, GRASS_LIP + 14);
		turf.addColorStop(0, '#9be06f');
		turf.addColorStop(0.5, '#5fae42');
		turf.addColorStop(1, '#3c7d2c');
		tg.fillStyle = turf;
		tg.fillRect(0, GRASS_LIP, GROUND_TILE, 14);
		tg.fillStyle = 'rgba(20,40,10,0.45)';
		tg.fillRect(0, GRASS_LIP + 13, GROUND_TILE, 2);
		// Blades along the lip, wrapped so the tile is seamless.
		for (let i = 0; i < 26; i++) {
			const x = (i / 26) * GROUND_TILE + hash(i + 91) * 3;
			const h = 4 + hash(i + 111) * (GRASS_LIP - 2);
			const lean = (hash(i + 121) - 0.5) * 4;
			tg.fillStyle = hash(i + 131) > 0.5 ? '#8fd765' : '#6cbf4b';
			for (const dx of [0, -GROUND_TILE, GROUND_TILE]) {
				tg.beginPath();
				tg.moveTo(x + dx - 2, GRASS_LIP + 2);
				tg.lineTo(x + dx + lean, GRASS_LIP + 2 - h);
				tg.lineTo(x + dx + 2, GRASS_LIP + 2);
				tg.fill();
			}
		}
		ground = t;
	}

	function resize(width: number, height: number, ratio: number) {
		cssW = Math.max(1, width);
		cssH = Math.max(1, height);
		dpr = Math.min(ratio || 1, 2);
		canvas.width = Math.round(cssW * dpr);
		canvas.height = Math.round(cssH * dpr);
		s = cssH / WORLD_H;
		px = s * dpr;
		viewW = cssW / s;
		birdX = Math.min(viewW * 0.3, 190);
		buildTextures();
		vignette = null;
	}

	// ── Scene layers ─────────────────────────────────────────────────────



	function ridge(fn: (x: number) => number, offset: number, top: RGB, base: RGB, minY: number) {
		const g = ctx.createLinearGradient(0, minY, 0, GROUND_Y);
		g.addColorStop(0, rgb(top));
		g.addColorStop(1, rgb(base));
		ctx.fillStyle = g;
		ctx.beginPath();
		ctx.moveTo(-20, GROUND_Y + 2);
		for (let x = -20; x <= viewW + 20; x += 12) ctx.lineTo(x, fn(x + offset));
		ctx.lineTo(viewW + 20, GROUND_Y + 2);
		ctx.closePath();
		ctx.fill();
	}

	function trees(p: Palette, offset: number) {
		const spacing = 38;
		const first = Math.floor((offset - 40) / spacing);
		const last = Math.ceil((offset + viewW + 40) / spacing);
		ctx.fillStyle = rgb(p.tree);
		for (let k = first; k <= last; k++) {
			const r = hash(k);
			if (r < 0.28) continue;
			const lx = k * spacing + hash(k + 7) * 22;
			const x = lx - offset;
			const base = hillY(lx) + 6;
			const h = 26 + hash(k + 13) * 40;
			if (r > 0.62) {
				// Pine: stacked tiers
				for (let i = 0; i < 3; i++) {
					const w = (h * 0.42) * (1 - i * 0.22);
					const y0 = base - h * 0.18 - i * h * 0.24;
					ctx.beginPath();
					ctx.moveTo(x - w, y0);
					ctx.lineTo(x, y0 - h * 0.42);
					ctx.lineTo(x + w, y0);
					ctx.fill();
				}
				ctx.fillRect(x - 1.5, base - h * 0.2, 3, h * 0.2);
			} else {
				// Broadleaf
				const rr = h * 0.3;
				ctx.fillRect(x - 1.8, base - h * 0.45, 3.6, h * 0.45);
				ctx.beginPath();
				ctx.arc(x, base - h * 0.62, rr, 0, Math.PI * 2);
				ctx.arc(x - rr * 0.7, base - h * 0.48, rr * 0.75, 0, Math.PI * 2);
				ctx.arc(x + rr * 0.72, base - h * 0.5, rr * 0.72, 0, Math.PI * 2);
				ctx.fill();
			}
		}
	}


	function leaf(x: number, y: number, dir: 1 | -1, size: number, angle: number) {
		ctx.save();
		ctx.translate(x, y);
		ctx.rotate(angle * dir);
		ctx.scale(dir, 1);
		const g = ctx.createLinearGradient(0, -size * 0.2, size, size * 0.2);
		g.addColorStop(0, '#3f7f2c');
		g.addColorStop(1, '#8fcf5d');
		ctx.fillStyle = g;
		ctx.beginPath();
		ctx.moveTo(0, 0);
		ctx.quadraticCurveTo(size * 0.45, -size * 0.28, size, 0);
		ctx.quadraticCurveTo(size * 0.45, size * 0.24, 0, 0);
		ctx.fill();
		ctx.strokeStyle = 'rgba(25,60,15,0.55)';
		ctx.lineWidth = 0.8;
		ctx.beginPath();
		ctx.moveTo(0, 0);
		ctx.lineTo(size * 0.92, 0);
		ctx.stroke();
		ctx.restore();
	}

	function pipes(w: World, distance: number) {
		if (!bamboo || !cap) return;
		for (const p of w.pipes) {
			const x = birdX + p.d - distance;
			if (x > viewW + 40) break;
			if (x + PIPE_W < -40) continue;
			const top = p.gapY - p.gap / 2;
			const bottom = p.gapY + p.gap / 2;

			// Soft shadow cast to the right
			ctx.fillStyle = 'rgba(0,0,0,0.12)';
			ctx.fillRect(x + PIPE_W, 0, 7, top);
			ctx.fillRect(x + PIPE_W, bottom, 7, GROUND_Y - bottom);

			// Bottom stalk
			const bh = GROUND_Y - bottom;
			if (bh > 0) ctx.drawImage(bamboo, 0, 0, bamboo.width, Math.min(bamboo.height, bh * px), x, bottom, PIPE_W, Math.min(WORLD_H, bh));
			// Top stalk, mirrored so its nodes count from the cap
			if (top > 0) {
				ctx.save();
				ctx.translate(x, top);
				ctx.scale(1, -1);
				ctx.drawImage(bamboo, 0, 0, bamboo.width, Math.min(bamboo.height, top * px), 0, 0, PIPE_W, Math.min(WORLD_H, top));
				ctx.restore();
			}
			ctx.strokeStyle = 'rgba(10,30,6,0.55)';
			ctx.lineWidth = 1.2;
			ctx.strokeRect(x + 0.6, -2, PIPE_W - 1.2, top + 2);
			ctx.strokeRect(x + 0.6, bottom, PIPE_W - 1.2, GROUND_Y - bottom + 2);

			// Leaves sprouting from a node
			if (p.seed > 0.3 && bh > CAP_H + 60) leaf(x + PIPE_W - 2, bottom + CAP_H + 40, 1, 30 + p.seed * 12, -0.5 - p.seed * 0.4);
			if (p.seed < 0.75 && top > CAP_H + 60) leaf(x + 2, top - CAP_H - 40, -1, 26 + p.seed * 14, -0.35 - p.seed * 0.5);

			ctx.drawImage(cap, x - CAP_OVER, top - CAP_H, PIPE_W + CAP_OVER * 2, CAP_H);
			ctx.drawImage(cap, x - CAP_OVER, bottom, PIPE_W + CAP_OVER * 2, CAP_H);
		}
	}

	function groundStrip(scroll: number, shakeX: number, shakeY: number) {
		if (!ground) return;
		// Drawn in device pixels with whole-pixel steps, so tiles never seam.
		ctx.setTransform(1, 0, 0, 1, shakeX, shakeY);
		const tw = ground.width;
		const th = ground.height;
		const y = Math.round((GROUND_Y - GRASS_LIP) * px);
		let x = -Math.round((scroll * px) % tw);
		while (x < canvas.width) {
			ctx.drawImage(ground, x, y, tw, th);
			x += tw;
		}
		ctx.setTransform(px, 0, 0, px, shakeX, shakeY);
	}

	function bird(f: Frame) {
		const x = birdX;
		const { y, rot, wing, squash } = f;
		// Shadow on the ground, smaller the higher the bird flies
		const lift = Math.max(0, Math.min(1, (GROUND_Y - y) / 500));
		ctx.fillStyle = `rgba(0,0,0,${0.22 * (1 - lift)})`;
		ctx.beginPath();
		ctx.ellipse(x, GROUND_Y + 3, 18 * (1 - lift * 0.6), 4 * (1 - lift * 0.6), 0, 0, Math.PI * 2);
		ctx.fill();

		ctx.save();
		ctx.translate(x, y);
		ctx.rotate(rot);
		ctx.scale(1 + squash * 0.08, 1 - squash * 0.1);

		// Tail
		ctx.fillStyle = '#d9822a';
		ctx.beginPath();
		ctx.moveTo(-14, -3);
		ctx.lineTo(-28, -10);
		ctx.lineTo(-24, -1);
		ctx.lineTo(-29, 7);
		ctx.lineTo(-13, 5);
		ctx.closePath();
		ctx.fill();

		// Body
		const body = ctx.createRadialGradient(-5, -7, 2, 0, 0, 23);
		body.addColorStop(0, '#fff6c2');
		body.addColorStop(0.4, '#ffd34e');
		body.addColorStop(1, '#ee9b22');
		ctx.fillStyle = body;
		ctx.beginPath();
		ctx.ellipse(0, 0, BIRD_R + 4, BIRD_R + 0.5, 0, 0, Math.PI * 2);
		ctx.fill();
		ctx.strokeStyle = 'rgba(110,55,8,0.6)';
		ctx.lineWidth = 1.6;
		ctx.stroke();

		// Belly
		ctx.fillStyle = 'rgba(255,245,215,0.9)';
		ctx.beginPath();
		ctx.ellipse(3, 6.5, 11, 7, -0.1, 0, Math.PI * 2);
		ctx.fill();

		// Wing
		ctx.save();
		ctx.translate(-5, 2);
		ctx.rotate(wing);
		const wg = ctx.createLinearGradient(0, -7, 0, 8);
		wg.addColorStop(0, '#ffe796');
		wg.addColorStop(1, '#e48a24');
		ctx.fillStyle = wg;
		ctx.beginPath();
		ctx.ellipse(-3, 0, 12, 7, 0, 0, Math.PI * 2);
		ctx.fill();
		ctx.strokeStyle = 'rgba(110,55,8,0.65)';
		ctx.lineWidth = 1.3;
		ctx.stroke();
		ctx.strokeStyle = 'rgba(150,75,10,0.45)';
		ctx.lineWidth = 1;
		ctx.beginPath();
		ctx.moveTo(-11, 1);
		ctx.lineTo(3, 1);
		ctx.moveTo(-9, 4);
		ctx.lineTo(2, 4);
		ctx.stroke();
		ctx.restore();

		// Cheek
		ctx.fillStyle = 'rgba(255,110,90,0.35)';
		ctx.beginPath();
		ctx.arc(7, 3, 3.4, 0, Math.PI * 2);
		ctx.fill();

		// Eye
		ctx.fillStyle = '#ffffff';
		ctx.beginPath();
		ctx.ellipse(8.5, -6, 6.4, 7, 0, 0, Math.PI * 2);
		ctx.fill();
		ctx.strokeStyle = 'rgba(80,40,5,0.55)';
		ctx.lineWidth = 1.2;
		ctx.stroke();
		const dead = f.world.phase === 'dying' || f.world.phase === 'over';
		if (dead && f.world.hitAt >= 0) {
			ctx.strokeStyle = '#1b1b1b';
			ctx.lineWidth = 1.8;
			ctx.beginPath();
			ctx.moveTo(7.5, -9);
			ctx.lineTo(12.5, -3.5);
			ctx.moveTo(12.5, -9);
			ctx.lineTo(7.5, -3.5);
			ctx.stroke();
		} else {
			ctx.fillStyle = '#18181b';
			ctx.beginPath();
			ctx.arc(10.5, -5.5, 3.1, 0, Math.PI * 2);
			ctx.fill();
			ctx.fillStyle = '#ffffff';
			ctx.beginPath();
			ctx.arc(11.6, -7, 1.1, 0, Math.PI * 2);
			ctx.fill();
		}

		// Beak
		ctx.fillStyle = '#ff7b2e';
		ctx.beginPath();
		ctx.moveTo(12, -1.5);
		ctx.quadraticCurveTo(22, -1, 26, 1.5);
		ctx.lineTo(12, 3.5);
		ctx.closePath();
		ctx.fill();
		ctx.fillStyle = '#e1561a';
		ctx.beginPath();
		ctx.moveTo(12, 3);
		ctx.lineTo(23, 4.5);
		ctx.quadraticCurveTo(18, 8, 12, 7.5);
		ctx.closePath();
		ctx.fill();
		ctx.restore();
	}


	function draw(f: Frame) {
		const p = palette(f.theme);
		const shakeX = f.shake ? (Math.random() - 0.5) * 14 * f.shake * dpr : 0;
		const shakeY = f.shake ? (Math.random() - 0.5) * 14 * f.shake * dpr : 0;
		ctx.setTransform(px, 0, 0, px, shakeX, shakeY);

		drawSky(ctx, viewW, p, f.clock);
		drawClouds(ctx, viewW, p, f.scroll, f.clock, 0);
		ridge(farY, f.scroll * 0.06, p.far, mixC(p.far, p.skyLow, 0.55), 280);
		// Atmospheric haze between ridges
		const haze = ctx.createLinearGradient(0, 380, 0, GROUND_Y);
		haze.addColorStop(0, rgb(p.skyLow, 0));
		haze.addColorStop(1, rgb(p.skyLow, 0.45));
		ctx.fillStyle = haze;
		ctx.fillRect(-20, 380, viewW + 40, GROUND_Y - 380);
		ridge(nearY, f.scroll * 0.14, p.near, mixC(p.near, p.skyLow, 0.35), 400);
		drawClouds(ctx, viewW, p, f.scroll, f.clock, 1);
		ridge(hillY, f.scroll * 0.35, p.hill, mixC(p.hill, p.tree, 0.5), 540);
		trees(p, f.scroll * 0.35);
		drawFireflies(ctx, viewW, p, f.clock);

		pipes(f.world, f.distance);
		groundStrip(f.scroll, shakeX, shakeY);

		if (p.night > 0.01) {
			ctx.fillStyle = `rgba(8,12,40,${p.night})`;
			ctx.fillRect(-20, -20, viewW + 40, WORLD_H + 40);
		}

		bird(f);
		drawParticles(ctx, f.particles);

		if (f.flash > 0.01) {
			ctx.fillStyle = `rgba(255,255,255,${f.flash * 0.7})`;
			ctx.fillRect(-20, -20, viewW + 40, WORLD_H + 40);
		}

		if (!vignette) {
			const r = Math.max(viewW, WORLD_H);
			vignette = ctx.createRadialGradient(viewW / 2, WORLD_H * 0.45, r * 0.35, viewW / 2, WORLD_H * 0.45, r * 0.85);
			vignette.addColorStop(0, 'rgba(0,0,0,0)');
			vignette.addColorStop(1, 'rgba(0,0,0,0.38)');
		}
		ctx.fillStyle = vignette;
		ctx.fillRect(-20, -20, viewW + 40, WORLD_H + 40);
	}

	return {
		resize,
		draw,
		get birdX() {
			return birdX;
		},
		get viewW() {
			return viewW;
		}
	};
}

export function roundRect(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
	g.beginPath();
	g.moveTo(x + r, y);
	g.arcTo(x + w, y, x + w, y + h, r);
	g.arcTo(x + w, y + h, x, y + h, r);
	g.arcTo(x, y + h, x, y, r);
	g.arcTo(x, y, x + w, y, r);
	g.closePath();
}

function mixHex(a: string, b: string, t: number) {
	return rgb(mixC(hex(a), hex(b), t));
}

// ── Shared scene pieces (also used by the Symba Ride city) ──────────────────

export function drawSky(ctx: CanvasRenderingContext2D, viewW: number, p: Palette, clock: number) {
	const g = ctx.createLinearGradient(0, 0, 0, GROUND_Y);
	g.addColorStop(0, rgb(p.skyTop));
	g.addColorStop(0.55, rgb(p.skyMid));
	g.addColorStop(1, rgb(p.skyLow));
	ctx.fillStyle = g;
	ctx.fillRect(-20, -20, viewW + 40, WORLD_H + 40);

	if (p.stars > 0.01) {
		for (const st of STARS) {
			const a = p.stars * (0.55 + 0.45 * Math.sin(clock * 2.2 + st.p));
			ctx.fillStyle = `rgba(255,255,240,${a})`;
			ctx.beginPath();
			ctx.arc(st.x * viewW, st.y * GROUND_Y, st.r, 0, Math.PI * 2);
			ctx.fill();
		}
	}

	// Sun sinks toward the horizon as the theme advances.
	if (p.sunA > 0.01) {
		const sx = viewW * 0.74;
		const sy = 470 - p.sunH * 380;
		const glow = ctx.createRadialGradient(sx, sy, 10, sx, sy, 330);
		glow.addColorStop(0, rgb(p.glow, 0.75 * p.sunA));
		glow.addColorStop(0.3, rgb(p.glow, 0.25 * p.sunA));
		glow.addColorStop(1, rgb(p.glow, 0));
		ctx.fillStyle = glow;
		ctx.fillRect(sx - 340, sy - 340, 680, 680);
		ctx.fillStyle = rgb(p.sun, p.sunA);
		ctx.beginPath();
		ctx.arc(sx, sy, 40, 0, Math.PI * 2);
		ctx.fill();
	}
	if (p.moonA > 0.01) {
		const mx = viewW * 0.24;
		const my = 120;
		const glow = ctx.createRadialGradient(mx, my, 20, mx, my, 170);
		glow.addColorStop(0, `rgba(190,205,255,${0.35 * p.moonA})`);
		glow.addColorStop(1, 'rgba(190,205,255,0)');
		ctx.fillStyle = glow;
		ctx.fillRect(mx - 180, my - 180, 360, 360);
		ctx.fillStyle = `rgba(246,243,226,${p.moonA})`;
		ctx.beginPath();
		ctx.arc(mx, my, 27, 0, Math.PI * 2);
		ctx.fill();
		ctx.fillStyle = `rgba(200,195,175,${0.5 * p.moonA})`;
		for (const [dx, dy, r] of [
			[-8, -6, 5],
			[7, 4, 6.5],
			[-4, 11, 3.5],
			[10, -11, 3]
		]) {
			ctx.beginPath();
			ctx.arc(mx + dx, my + dy, r, 0, Math.PI * 2);
			ctx.fill();
		}
	}
}

export function drawClouds(ctx: CanvasRenderingContext2D, viewW: number, p: Palette, scroll: number, clock: number, layer: 0 | 1) {
	const span = viewW + 400;
	for (const c of CLOUDS) {
		if ((c.par > 0.1 ? 1 : 0) !== layer) continue;
		const x = ((((c.x - scroll * c.par - clock * c.drift) % span) + span) % span) - 200;
		ctx.fillStyle = rgb(mixC(p.cloud, p.skyTop, 0.35), 0.35);
		for (const [dx, dy, r] of PUFFS) {
			ctx.beginPath();
			ctx.arc(x + dx * c.s, c.y + (dy + 7) * c.s, r * c.s, 0, Math.PI * 2);
			ctx.fill();
		}
		ctx.fillStyle = rgb(p.cloud, 0.92);
		for (const [dx, dy, r] of PUFFS) {
			ctx.beginPath();
			ctx.arc(x + dx * c.s, c.y + dy * c.s, r * c.s, 0, Math.PI * 2);
			ctx.fill();
		}
	}
}

export function drawFireflies(ctx: CanvasRenderingContext2D, viewW: number, p: Palette, clock: number) {
	if (p.fireflies < 0.02) return;
	for (const f of FIREFLIES) {
		const x = (((f.x * viewW + Math.sin(clock * 0.4 * f.s + f.p) * 40) % viewW) + viewW) % viewW;
		const y = f.y + Math.sin(clock * 0.9 * f.s + f.p * 2) * 14;
		const a = p.fireflies * (0.4 + 0.6 * Math.max(0, Math.sin(clock * 2.4 * f.s + f.p)));
		const g = ctx.createRadialGradient(x, y, 0, x, y, 9);
		g.addColorStop(0, `rgba(230,255,150,${a})`);
		g.addColorStop(1, 'rgba(230,255,150,0)');
		ctx.fillStyle = g;
		ctx.fillRect(x - 9, y - 9, 18, 18);
	}
}

export function drawParticles(ctx: CanvasRenderingContext2D, list: Particle[]) {
	for (const p of list) {
		const a = Math.max(0, p.life / p.ttl);
		if (p.kind === 'puff' || p.kind === 'dust') {
			ctx.fillStyle = p.kind === 'puff' ? `rgba(255,255,255,${a * 0.55})` : `rgba(140,110,70,${a * 0.5})`;
			ctx.beginPath();
			ctx.arc(p.x, p.y, p.size * (1.6 - a * 0.6), 0, Math.PI * 2);
			ctx.fill();
		} else if (p.kind === 'feather') {
			ctx.save();
			ctx.translate(p.x, p.y);
			ctx.rotate(p.rot);
			ctx.globalAlpha = Math.min(1, a * 1.6);
			ctx.fillStyle = p.color;
			ctx.beginPath();
			ctx.ellipse(0, 0, p.size, p.size * 0.38, 0, 0, Math.PI * 2);
			ctx.fill();
			ctx.restore();
		} else {
			ctx.save();
			ctx.translate(p.x, p.y);
			ctx.rotate(p.rot);
			ctx.globalAlpha = a;
			ctx.fillStyle = p.color;
			const r = p.size;
			ctx.beginPath();
			ctx.moveTo(0, -r);
			ctx.quadraticCurveTo(0, 0, r, 0);
			ctx.quadraticCurveTo(0, 0, 0, r);
			ctx.quadraticCurveTo(0, 0, -r, 0);
			ctx.quadraticCurveTo(0, 0, 0, -r);
			ctx.fill();
			ctx.restore();
		}
	}
	ctx.globalAlpha = 1;
}

