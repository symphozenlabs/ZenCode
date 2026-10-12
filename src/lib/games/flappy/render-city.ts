import { GROUND_Y, PIPE_W, WORLD_H } from './engine';
import {
	drawClouds,
	drawParticles,
	drawSky,
	hash,
	hex,
	mixC,
	palette,
	rgb,
	roundRect,
	type Frame,
	type Palette,
	type RGB
} from './render';

/**
 * Symba Ride: the same game drawn as an Indian city. Pipes become glass
 * towers — one bright, sharp-edged style, so they never blend into the
 * hazy skyline behind (which carries the landmark silhouettes). The ground is
 * a road with a striped kerb. The mascot is drawn from five poses, chosen
 * from what the physics is doing.
 *
 * Collision is the plain rectangle the engine uses; the rooftop antenna is
 * decoration and never kills.
 */

type Pose = 'normal' | 'boost' | 'fall' | 'before-crash' | 'crashed';
const POSES: Pose[] = ['normal', 'boost', 'fall', 'before-crash', 'crashed'];
/** World units for the full sprite square; the mascot's body is roughly half that tall. */
const SPRITE = 88;
/** Where the mascot's body centre sits in each sprite (shared by all poses). */
const ANCHOR_X = 0.56;
const ANCHOR_Y = 0.52;
const CRASHED_BOTTOM = 0.856;

const TEX_H = WORLD_H;
const ROAD_TILE = 96;
const KERB_LIP = 4;

const KITES = [
	{ x: 0.18, y: 150, c: '#ff4f7a', p: 0.3 },
	{ x: 0.52, y: 95, c: '#ffd23f', p: 2.1 },
	{ x: 0.83, y: 190, c: '#36c9a0', p: 4.0 }
];

/** Painted-concrete tones of an Indian street, hazed toward the sky colour. */
const STREET_TONES: RGB[] = ['#c9a27e', '#a9b4bf', '#d3b48f', '#9fb0a6', '#c48f7a', '#b8a9c9'].map(hex);
const CITY_GREY = hex('#9aa6b4');

const loadImage = (src: string) => {
	const img = new Image();
	img.decoding = 'async';
	img.src = src;
	return img;
};

export function createCityRenderer(canvas: HTMLCanvasElement) {
	const ctx = canvas.getContext('2d', { alpha: false })!;
	let cssW = 1;
	let cssH = 1;
	let dpr = 1;
	let px = 1;
	let viewW = 400;
	let birdX = 120;
	let road: HTMLCanvasElement | null = null;
	let vignette: CanvasGradient | null = null;
	let tower: { body: HTMLCanvasElement; lights: HTMLCanvasElement } | null = null;
	const sprites = new Map<Pose, HTMLImageElement>(POSES.map((p) => [p, loadImage(`/games/symba/${p}.webp`)]));

	function makeCanvas(w: number, h: number, scale: number) {
		const c = document.createElement('canvas');
		c.width = Math.max(1, Math.ceil(w * scale));
		c.height = Math.max(1, Math.ceil(h * scale));
		const g = c.getContext('2d')!;
		g.scale(c.width / w, c.height / h);
		return [c, g] as const;
	}

	// ── Glass tower texture (roof at the top; hanging towers are drawn mirrored) ──

	function buildTower(scale: number) {
		const [b, g] = makeCanvas(PIPE_W, TEX_H, scale);
		const [l, lg] = makeCanvas(PIPE_W, TEX_H, scale);

		// Saturated teal-blue glass with a bright edge, so it reads in front of the haze.
		const grad = g.createLinearGradient(0, 0, PIPE_W, 0);
		grad.addColorStop(0, '#0f3a5c');
		grad.addColorStop(0.08, '#3fb4e6');
		grad.addColorStop(0.16, '#1f6f9e');
		grad.addColorStop(0.45, '#2b8fc4');
		grad.addColorStop(0.7, '#1a5f8c');
		grad.addColorStop(1, '#0b2a45');
		g.fillStyle = grad;
		g.fillRect(0, 0, PIPE_W, TEX_H);

		// Sky reflections sweeping across the glass
		for (let y = -220; y < TEX_H; y += 240) {
			const r = g.createLinearGradient(0, y, PIPE_W, y + 120);
			r.addColorStop(0, 'rgba(255,255,255,0)');
			r.addColorStop(0.5, 'rgba(220,245,255,0.22)');
			r.addColorStop(1, 'rgba(255,255,255,0)');
			g.fillStyle = r;
			g.beginPath();
			g.moveTo(0, y + 70);
			g.lineTo(PIPE_W, y);
			g.lineTo(PIPE_W, y + 46);
			g.lineTo(0, y + 116);
			g.fill();
		}

		// Mullions, floor bands, window cells
		g.fillStyle = 'rgba(4,20,36,0.55)';
		for (let x = 6; x < PIPE_W; x += 12) g.fillRect(x, 0, 1.3, TEX_H);
		let row = 0;
		for (let y = 14; y < TEX_H; y += 13, row++) {
			g.fillStyle = 'rgba(4,20,36,0.6)';
			g.fillRect(0, y, PIPE_W, 1.8);
			g.fillStyle = 'rgba(200,240,255,0.18)';
			g.fillRect(0, y + 1.8, PIPE_W, 0.7);
			for (let c = 0; c < 6; c++) {
				if (hash(row * 7.3 + c * 1.7) > 0.4) continue;
				lg.fillStyle = hash(row + c * 3) > 0.5 ? '#ffd98a' : '#fff1c9';
				lg.fillRect(7.5 + c * 12, y + 2.8, 9.5, 8.6);
			}
		}

		// Steel crown
		const cap = g.createLinearGradient(0, 0, 0, 11);
		cap.addColorStop(0, '#e6edf3');
		cap.addColorStop(0.35, '#9aa8b6');
		cap.addColorStop(1, '#3b4652');
		g.fillStyle = cap;
		g.fillRect(0, 0, PIPE_W, 11);
		g.fillStyle = '#7ee0ff';
		g.fillRect(0, 11, PIPE_W, 1.6);

		// Crisp dark frame down both sides, light rim just inside
		g.fillStyle = '#071a2c';
		g.fillRect(0, 0, 2.2, TEX_H);
		g.fillRect(PIPE_W - 2.2, 0, 2.2, TEX_H);
		g.fillStyle = 'rgba(180,235,255,0.55)';
		g.fillRect(2.2, 0, 1, TEX_H);
		return { body: b, lights: l };
	}

	function roofDetail(x: number, t: number, clock: number) {
		ctx.fillStyle = '#5d6772';
		ctx.fillRect(x + 12, t - 7, 22, 7);
		ctx.strokeStyle = '#4b5561';
		ctx.lineWidth = 2;
		ctx.beginPath();
		ctx.moveTo(x + 62, t);
		ctx.lineTo(x + 62, t - 18);
		ctx.stroke();
		ctx.fillStyle = Math.sin(clock * 3) > 0 ? '#ff3b30' : '#7a1d18';
		ctx.beginPath();
		ctx.arc(x + 62, t - 19, 2.2, 0, Math.PI * 2);
		ctx.fill();
	}

	function buildRoad() {
		const gh = WORLD_H - GROUND_Y + KERB_LIP;
		const [t, g] = makeCanvas(ROAD_TILE, gh, px);
		const asphalt = g.createLinearGradient(0, 16, 0, gh);
		asphalt.addColorStop(0, '#45474d');
		asphalt.addColorStop(1, '#2a2b2f');
		g.fillStyle = asphalt;
		g.fillRect(0, 16, ROAD_TILE, gh);
		for (let i = 0; i < 40; i++) {
			g.fillStyle = hash(i + 5) > 0.5 ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.12)';
			g.fillRect(hash(i + 7) * ROAD_TILE, 20 + hash(i + 9) * (gh - 22), 1.6, 1.6);
		}
		// Lane dashes (period 48 divides the tile)
		g.fillStyle = 'rgba(245,245,235,0.85)';
		for (let x = 0; x < ROAD_TILE; x += 48) g.fillRect(x + 6, 52, 26, 3.2);
		// Pavement
		g.fillStyle = '#cbbd9f';
		g.fillRect(0, 0, ROAD_TILE, 11);
		g.fillStyle = 'rgba(90,75,50,0.35)';
		for (let x = 0; x < ROAD_TILE; x += 24) g.fillRect(x, 0, 1, 11);
		g.fillStyle = 'rgba(255,255,255,0.35)';
		g.fillRect(0, 0, ROAD_TILE, 1.4);
		// Black-and-yellow kerb
		for (let x = 0; x < ROAD_TILE; x += 12) {
			g.fillStyle = (x / 12) % 2 ? '#1f1f1f' : '#f2c230';
			g.fillRect(x, 11, 12, 5);
		}
		g.fillStyle = 'rgba(0,0,0,0.35)';
		g.fillRect(0, 16, ROAD_TILE, 2);
		road = t;
	}

	function resize(width: number, height: number, ratio: number) {
		cssW = Math.max(1, width);
		cssH = Math.max(1, height);
		dpr = Math.min(ratio || 1, 2);
		canvas.width = Math.round(cssW * dpr);
		canvas.height = Math.round(cssH * dpr);
		const s = cssH / WORLD_H;
		px = s * dpr;
		viewW = cssW / s;
		birdX = Math.min(viewW * 0.3, 190);
		tower = buildTower(Math.min(px, 1.75));
		buildRoad();
		vignette = null;
	}

	// ── Skyline ──────────────────────────────────────────────────────────

	function farSkyline(p: Palette, offset: number) {
		const spacing = 34;
		const color = mixC(p.far, p.skyLow, 0.45);
		ctx.fillStyle = rgb(color);
		const first = Math.floor((offset - 60) / spacing);
		const last = Math.ceil((offset + viewW + 60) / spacing);
		for (let k = first; k <= last; k++) {
			const h = 70 + hash(k * 3.1) * 190;
			const w = 24 + hash(k * 5.7) * 22;
			const x = k * spacing - offset;
			ctx.fillRect(x, GROUND_Y - 40 - h, w, h + 40);
			if (hash(k * 9.3) > 0.7) ctx.fillRect(x + w / 2 - 1, GROUND_Y - 40 - h - 22, 2, 22);
		}
	}

	type Landmark = 'taj' | 'gate' | 'gopuram' | 'charminar' | 'lotus' | 'qutub';
	const LANDMARKS: Landmark[] = ['taj', 'gate', 'gopuram', 'charminar', 'lotus', 'qutub'];

	/** Arch opening, traced the opposite way so a nonzero fill cuts it out. */
	function opening(cx: number, base: number, halfW: number, springY: number) {
		ctx.moveTo(cx + halfW, base);
		ctx.lineTo(cx + halfW, base - springY);
		ctx.arc(cx, base - springY, halfW, 0, Math.PI, true);
		ctx.lineTo(cx - halfW, base);
		ctx.closePath();
	}

	/** Clockwise rectangle (rect() winds the same way), for bodies with openings. */
	function block(x: number, y: number, w: number, h: number) {
		ctx.moveTo(x, y);
		ctx.lineTo(x + w, y);
		ctx.lineTo(x + w, y + h);
		ctx.lineTo(x, y + h);
		ctx.closePath();
	}

	function landmark(kind: Landmark, cx: number, base: number) {
		// Each part is its own fill, so overlapping parts never cancel out.
		const part = (path: () => void) => {
			ctx.beginPath();
			path();
			ctx.fill();
		};
		if (kind === 'taj') {
			part(() => {
				ctx.rect(cx - 130, base - 16, 260, 16);
				ctx.rect(cx - 72, base - 96, 144, 80);
				ctx.rect(cx - 40, base - 110, 80, 14);
				ctx.rect(cx - 1.5, base - 214, 3, 16);
			});
			part(() => {
				ctx.moveTo(cx - 44, base - 108);
				ctx.bezierCurveTo(cx - 70, base - 150, cx - 22, base - 175, cx, base - 200);
				ctx.bezierCurveTo(cx + 22, base - 175, cx + 70, base - 150, cx + 44, base - 108);
				ctx.closePath();
			});
			for (const dx of [-56, 56]) part(() => ctx.arc(cx + dx, base - 96, 14, Math.PI, 0));
			for (const dx of [-118, 118]) {
				part(() => ctx.rect(cx + dx - 5, base - 150, 10, 134));
				part(() => ctx.arc(cx + dx, base - 150, 8, Math.PI, 0));
			}
		} else if (kind === 'gate') {
			part(() => {
				block(cx - 66, base - 160, 132, 160);
				opening(cx, base, 28, 92);
			});
			part(() => {
				ctx.rect(cx - 52, base - 182, 104, 23);
				ctx.rect(cx - 36, base - 196, 72, 15);
			});
			part(() => ctx.arc(cx, base - 195, 24, Math.PI, 0));
		} else if (kind === 'gopuram') {
			part(() => {
				for (let i = 0; i < 7; i++) {
					const w = 150 - i * 15;
					ctx.rect(cx - w / 2, base - 30 - i * 26, w, 30);
				}
			});
			part(() => {
				ctx.moveTo(cx - 38, base - 210);
				ctx.quadraticCurveTo(cx, base - 246, cx + 38, base - 210);
				ctx.closePath();
			});
			part(() => {
				for (const dx of [-24, -12, 0, 12, 24]) ctx.rect(cx + dx - 1.5, base - 238 + Math.abs(dx) * 0.6, 3, 10);
			});
		} else if (kind === 'charminar') {
			part(() => {
				block(cx - 56, base - 116, 112, 116);
				opening(cx, base, 30, 66);
			});
			part(() => ctx.rect(cx - 62, base - 128, 124, 13));
			for (const dx of [-62, 62]) {
				part(() => {
					ctx.rect(cx + dx - 8, base - 210, 16, 210);
					ctx.rect(cx + dx - 12, base - 150, 24, 6);
					ctx.rect(cx + dx - 12, base - 186, 24, 6);
				});
				part(() => ctx.arc(cx + dx, base - 210, 9, Math.PI, 0));
			}
		} else if (kind === 'lotus') {
			part(() => ctx.rect(cx - 120, base - 14, 240, 14));
			for (let i = -4; i <= 4; i++) {
				const x = cx + i * 24;
				const h = 104 - Math.abs(i) * 15;
				part(() => {
					ctx.moveTo(x - 26, base - 13);
					ctx.quadraticCurveTo(x - 20 + i * 2, base - 14 - h, x + i * 3, base - 24 - h);
					ctx.quadraticCurveTo(x + 20 + i * 2, base - 14 - h, x + 26, base - 13);
					ctx.closePath();
				});
			}
		} else {
			part(() => {
				ctx.moveTo(cx - 20, base);
				ctx.lineTo(cx - 9, base - 250);
				ctx.lineTo(cx + 9, base - 250);
				ctx.lineTo(cx + 20, base);
				ctx.closePath();
			});
			part(() => {
				for (const y of [70, 130, 185, 228]) ctx.rect(cx - 22 + y * 0.05, base - y, 44 - y * 0.1, 5);
				ctx.rect(cx - 3, base - 266, 6, 17);
			});
		}
	}

	function landmarks(p: Palette, offset: number) {
		const spacing = 560;
		ctx.fillStyle = rgb(mixC(mixC(CITY_GREY, p.near, 0.45), p.skyLow, 0.42));
		const first = Math.floor((offset - 300) / spacing);
		const last = Math.ceil((offset + viewW + 300) / spacing);
		for (let k = first; k <= last; k++) {
			const kind = LANDMARKS[((k % LANDMARKS.length) + LANDMARKS.length) % LANDMARKS.length];
			landmark(kind, k * spacing + 220 - offset, GROUND_Y - 34);
		}
	}

	function kites(p: Palette, scroll: number, clock: number) {
		const a = Math.max(0, 1 - p.night * 2.4);
		if (a < 0.02) return;
		ctx.globalAlpha = a;
		const span = viewW + 300;
		for (const k of KITES) {
			const x = ((((k.x * span - scroll * 0.18) % span) + span) % span) - 150 + Math.sin(clock * 0.8 + k.p) * 12;
			const y = k.y + Math.sin(clock * 1.3 + k.p) * 10;
			const tilt = Math.sin(clock * 1.1 + k.p) * 0.25;
			ctx.strokeStyle = 'rgba(255,255,255,0.45)';
			ctx.lineWidth = 0.7;
			ctx.beginPath();
			ctx.moveTo(x, y + 14);
			ctx.quadraticCurveTo(x - 40, y + 160, x - 120, GROUND_Y);
			ctx.stroke();
			ctx.save();
			ctx.translate(x, y);
			ctx.rotate(tilt);
			ctx.fillStyle = k.c;
			ctx.beginPath();
			ctx.moveTo(0, -14);
			ctx.lineTo(11, 0);
			ctx.lineTo(0, 14);
			ctx.lineTo(-11, 0);
			ctx.closePath();
			ctx.fill();
			ctx.strokeStyle = 'rgba(0,0,0,0.25)';
			ctx.beginPath();
			ctx.moveTo(0, -14);
			ctx.lineTo(0, 14);
			ctx.moveTo(-11, 0);
			ctx.lineTo(11, 0);
			ctx.stroke();
			ctx.fillStyle = k.c;
			ctx.beginPath();
			ctx.moveTo(-3, 18);
			ctx.lineTo(3, 18);
			ctx.lineTo(0, 13);
			ctx.fill();
			ctx.restore();
		}
		ctx.globalAlpha = 1;
	}

	interface Block {
		x: number;
		w: number;
		h: number;
		k: number;
	}
	const blocks: Block[] = [];

	function midCity(p: Palette, offset: number) {
		blocks.length = 0;
		const spacing = 50;
		const first = Math.floor((offset - 80) / spacing);
		const last = Math.ceil((offset + viewW + 80) / spacing);
		for (let k = first; k <= last; k++) {
			const w = 40 + hash(k * 2.3) * 22;
			const h = 46 + hash(k * 4.1) * 104;
			const x = k * spacing + hash(k) * 8 - offset;
			const base = mixC(mixC(STREET_TONES[Math.floor(hash(k * 6.7) * STREET_TONES.length)], p.near, 0.42), p.skyLow, 0.3);
			ctx.fillStyle = rgb(base);
			ctx.fillRect(x, GROUND_Y - h, w, h);
			ctx.fillStyle = 'rgba(0,0,0,0.18)';
			ctx.fillRect(x + w - 4, GROUND_Y - h, 4, h);
			if (hash(k * 8.9) > 0.5) {
				ctx.fillStyle = rgb(mixC(base, [20, 20, 22] as RGB, 0.6));
				roundRect(ctx, x + 6, GROUND_Y - h - 9, 11, 9, 2);
				ctx.fill();
			}
			blocks.push({ x, w, h, k });
		}
	}

	function midCityLights(alpha: number) {
		if (alpha < 0.15) return;
		ctx.fillStyle = `rgba(255,214,140,${alpha * 0.85})`;
		for (const b of blocks) {
			for (let y = GROUND_Y - b.h + 8; y < GROUND_Y - 8; y += 12) {
				for (let x = b.x + 5; x < b.x + b.w - 8; x += 9) {
					if (hash(b.k * 31 + x * 0.7 + y * 1.3) > 0.62) ctx.fillRect(x, y, 4, 5);
				}
			}
		}
	}

	// ── Obstacles ────────────────────────────────────────────────────────

	function buildings(f: Frame, lightAlpha: number, lightsOnly: boolean) {
		if (!tower) return;
		const t = tower;
		const img = lightsOnly ? t.lights : t.body;
		const scale = t.body.height / TEX_H;
		for (const p of f.world.pipes) {
			const x = birdX + p.d - f.distance;
			if (x > viewW + 50) break;
			if (x + PIPE_W < -50) continue;
			const top = p.gapY - p.gap / 2;
			const bottom = p.gapY + p.gap / 2;
			const bh = GROUND_Y - bottom + 2;

			if (!lightsOnly) {
				// A cast shadow and a soft dark halo lift the tower off the skyline.
				ctx.fillStyle = 'rgba(0,0,0,0.22)';
				ctx.fillRect(x + PIPE_W, 0, 10, top);
				ctx.fillRect(x + PIPE_W, bottom, 10, GROUND_Y - bottom);
				ctx.fillStyle = 'rgba(0,10,25,0.18)';
				ctx.fillRect(x - 4, 0, 4, top);
				ctx.fillRect(x - 4, bottom, 4, GROUND_Y - bottom);
			} else ctx.globalAlpha = lightAlpha;

			if (bh > 0) ctx.drawImage(img, 0, 0, t.body.width, Math.min(t.body.height, bh * scale), x, bottom, PIPE_W, Math.min(TEX_H, bh));
			if (top > 0) {
				ctx.save();
				ctx.translate(x, top);
				ctx.scale(1, -1);
				ctx.drawImage(img, 0, 0, t.body.width, Math.min(t.body.height, top * scale), 0, 0, PIPE_W, Math.min(TEX_H, top));
				ctx.restore();
			}

			if (!lightsOnly) {
				roofDetail(x, bottom, f.clock);
			} else {
				ctx.globalAlpha = 1;
				if (p.seed > 0.55) {
					ctx.save();
					ctx.font = 'bold 8px "Space Grotesk", sans-serif';
					ctx.textAlign = 'center';
					ctx.textBaseline = 'middle';
					ctx.shadowColor = '#8dff6a';
					ctx.shadowBlur = 8 * lightAlpha + 2;
					ctx.fillStyle = `rgba(160,255,120,${0.6 + lightAlpha * 0.4})`;
					ctx.fillText('SYMPHOZEN', x + PIPE_W / 2, top - 6);
					ctx.restore();
				}
			}
		}
	}

	function roadStrip(scroll: number, shakeX: number, shakeY: number) {
		if (!road) return;
		ctx.setTransform(1, 0, 0, 1, shakeX, shakeY);
		const tw = road.width;
		const y = Math.round((GROUND_Y - KERB_LIP) * px);
		let x = -Math.round((scroll * px) % tw);
		while (x < canvas.width) {
			ctx.drawImage(road, x, y, tw, road.height);
			x += tw;
		}
		ctx.setTransform(px, 0, 0, px, shakeX, shakeY);
	}

	const LAMP_GAP = 240;
	function lamps(scroll: number, glow: number) {
		const first = Math.floor((scroll - 40) / LAMP_GAP);
		const last = Math.ceil((scroll + viewW + 40) / LAMP_GAP);
		for (let k = first; k <= last; k++) {
			const x = k * LAMP_GAP - scroll + 30;
			if (glow <= 0) {
				ctx.fillStyle = '#3a3d44';
				ctx.fillRect(x - 1.5, GROUND_Y - 66, 3, 72);
				ctx.strokeStyle = '#3a3d44';
				ctx.lineWidth = 2.5;
				ctx.beginPath();
				ctx.moveTo(x, GROUND_Y - 64);
				ctx.quadraticCurveTo(x, GROUND_Y - 74, x + 14, GROUND_Y - 72);
				ctx.stroke();
				ctx.fillStyle = '#585c64';
				ctx.fillRect(x + 11, GROUND_Y - 74, 10, 4);
			} else {
				const g = ctx.createRadialGradient(x + 16, GROUND_Y - 70, 1, x + 16, GROUND_Y - 70, 46);
				g.addColorStop(0, `rgba(255,220,150,${glow})`);
				g.addColorStop(1, 'rgba(255,220,150,0)');
				ctx.fillStyle = g;
				ctx.fillRect(x - 30, GROUND_Y - 116, 92, 92);
				ctx.fillStyle = `rgba(255,236,190,${Math.min(1, glow * 1.4)})`;
				ctx.fillRect(x + 12, GROUND_Y - 70, 8, 2);
			}
		}
	}

	// ── The mascot ───────────────────────────────────────────────────────

	function pose(f: Frame): Pose {
		const w = f.world;
		if (w.phase === 'over') return w.hitAt >= 0 ? 'crashed' : 'normal';
		if (w.phase === 'dying') return 'before-crash';
		if (w.phase === 'playing') {
			if (w.time - w.flapAt < 0.3) return 'boost';
			if (w.vy > 430) return 'fall';
		}
		return 'normal';
	}

	function mascot(f: Frame) {
		const p = pose(f);
		const crashed = p === 'crashed';
		const y = crashed ? GROUND_Y + 6 - (CRASHED_BOTTOM - ANCHOR_Y) * SPRITE : f.y;
		// The poses are already tilted, so only a hint of the physics rotation.
		const rot = crashed ? 0 : p === 'before-crash' ? f.rot * 0.35 : f.rot * 0.3;

		const lift = Math.max(0, Math.min(1, (GROUND_Y - y) / 500));
		ctx.fillStyle = `rgba(0,0,0,${0.28 * (1 - lift)})`;
		ctx.beginPath();
		ctx.ellipse(birdX + 4, GROUND_Y + 4, 30 * (1 - lift * 0.6), 5 * (1 - lift * 0.6), 0, 0, Math.PI * 2);
		ctx.fill();

		const img = sprites.get(p)!;
		const ready = img.complete && img.naturalWidth > 0;
		ctx.save();
		ctx.translate(birdX, y);
		ctx.rotate(rot);
		const sq = p === 'boost' ? f.squash : 0;
		ctx.scale(1 + sq * 0.05, 1 - sq * 0.06);
		if (ready) ctx.drawImage(img, -ANCHOR_X * SPRITE, -ANCHOR_Y * SPRITE, SPRITE, SPRITE);
		else {
			ctx.fillStyle = '#f0a33a';
			ctx.beginPath();
			ctx.arc(0, 0, 18, 0, Math.PI * 2);
			ctx.fill();
		}
		ctx.restore();
	}

	// ── Frame ────────────────────────────────────────────────────────────

	function draw(f: Frame) {
		const p = palette(f.theme);
		const shakeX = f.shake ? (Math.random() - 0.5) * 14 * f.shake * dpr : 0;
		const shakeY = f.shake ? (Math.random() - 0.5) * 14 * f.shake * dpr : 0;
		ctx.setTransform(px, 0, 0, px, shakeX, shakeY);
		const lightAlpha = Math.min(1, Math.max(0, (f.theme - 0.8) / 1.5)) * 0.92 + 0.08;

		drawSky(ctx, viewW, p, f.clock);
		drawClouds(ctx, viewW, p, f.scroll, f.clock, 0);
		farSkyline(p, f.scroll * 0.05);
		const haze = ctx.createLinearGradient(0, 330, 0, GROUND_Y);
		haze.addColorStop(0, rgb(p.skyLow, 0));
		haze.addColorStop(1, rgb(p.skyLow, 0.5));
		ctx.fillStyle = haze;
		ctx.fillRect(-20, 330, viewW + 40, GROUND_Y - 330);
		landmarks(p, f.scroll * 0.11);
		kites(p, f.scroll, f.clock);
		drawClouds(ctx, viewW, p, f.scroll, f.clock, 1);
		midCity(p, f.scroll * 0.32);
		// Haze over the whole backdrop, so the foreground towers pop.
		ctx.fillStyle = rgb(p.skyLow, 0.16);
		ctx.fillRect(-20, -20, viewW + 40, GROUND_Y + 20);

		buildings(f, lightAlpha, false);
		roadStrip(f.scroll, shakeX, shakeY);
		lamps(f.scroll, 0);

		if (p.night > 0.01) {
			ctx.fillStyle = `rgba(8,12,40,${p.night})`;
			ctx.fillRect(-20, -20, viewW + 40, WORLD_H + 40);
		}
		// Lights go on after the dusk tint, so they glow.
		midCityLights(lightAlpha);
		buildings(f, lightAlpha, true);
		if (lightAlpha > 0.3) lamps(f.scroll, (lightAlpha - 0.3) * 0.9);

		mascot(f);
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
