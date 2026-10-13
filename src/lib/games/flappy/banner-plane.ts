/**
 * Every so often a light aircraft tows a SymphoZen Labs banner across the
 * Soar & Roar sky. It is scenery: drawn behind the towers, never collides.
 *
 * Everything moves on real time (`clock`) and scroll deltas, never per frame,
 * so it glides the same at 60, 120 or 144 Hz. The banner follows the plane's
 * own path through the air (a point d behind the nose is where the nose was
 * d / speed seconds ago), and its cloth carries a travelling wave that is held
 * still at the pole and flutters toward the free tail.
 */

const LOGO_SRC = '/games/symba/symphozen-labs.svg';
const LOGO_RATIO = 1352 / 216;
const BRAND = '#5A8A45';

/** World units. */
const PLANE_L = 66;
const ROPE = 46;
const BANNER_W = 216;
const BANNER_H = 46;
const LOGO_W = BANNER_W - 22;
/** Vertical strips the cloth is cut into for the wave; more is smoother. */
const SLICES = 60;
/** How far away the plane is: it drifts with this share of the ground scroll. */
const PARALLAX = 0.1;

interface Flight {
	start: number;
	/** Cruising altitude (world y of the fuselage). */
	alt: number;
	/** Own airspeed, world units per second, leftward. */
	speed: number;
	seed: number;
}

export function createBannerPlane() {
	const logo = new Image();
	logo.decoding = 'async';
	logo.src = LOGO_SRC;

	let cloth: HTMLCanvasElement | null = null;
	let clothScale = 0;
	let clothHasLogo = false;

	let flight: Flight | null = null;
	/** First pass comes early so the audience sees it; later ones are spaced out. */
	let nextAt = 4 + Math.random() * 6;
	let drift = 0;
	let lastScroll: number | null = null;

	function buildCloth(scale: number) {
		const c = document.createElement('canvas');
		c.width = Math.ceil(BANNER_W * scale);
		c.height = Math.ceil(BANNER_H * scale);
		const g = c.getContext('2d')!;
		g.scale(scale, scale);
		// Off-white nylon with brand hems top and bottom
		const bg = g.createLinearGradient(0, 0, 0, BANNER_H);
		bg.addColorStop(0, '#ffffff');
		bg.addColorStop(1, '#eeece4');
		g.fillStyle = bg;
		g.fillRect(0, 0, BANNER_W, BANNER_H);
		g.fillStyle = BRAND;
		g.fillRect(0, 0, BANNER_W, 3);
		g.fillRect(0, BANNER_H - 3, BANNER_W, 3);
		const ready = logo.complete && logo.naturalWidth > 0;
		if (ready) {
			const h = LOGO_W / LOGO_RATIO;
			g.drawImage(logo, (BANNER_W - LOGO_W) / 2, (BANNER_H - h) / 2, LOGO_W, h);
		}
		cloth = c;
		clothScale = scale;
		clothHasLogo = ready;
	}

	/** Altitude of the nose `t` seconds into the flight: a slow, uneven bob. */
	const pathY = (f: Flight, t: number) => f.alt + 6 * Math.sin(t * 0.75 + f.seed * 6) + 3 * Math.sin(t * 0.29 + f.seed * 11);

	function plane(ctx: CanvasRenderingContext2D, x: number, y: number, pitch: number, clock: number) {
		ctx.save();
		ctx.translate(x + PLANE_L / 2, y);
		ctx.rotate(pitch);

		// Tailplane, far side (sits behind the fuselage)
		ctx.fillStyle = '#9aa3ad';
		ctx.beginPath();
		ctx.ellipse(26, -2, 8, 1.6, 0, 0, Math.PI * 2);
		ctx.fill();

		// Fin
		ctx.fillStyle = BRAND;
		ctx.beginPath();
		ctx.moveTo(18, -4);
		ctx.lineTo(28, -17);
		ctx.lineTo(33, -17);
		ctx.lineTo(32, -2);
		ctx.closePath();
		ctx.fill();

		// Fuselage: lit from above, shaded underneath
		const body = ctx.createLinearGradient(0, -9, 0, 7);
		body.addColorStop(0, '#ffffff');
		body.addColorStop(0.55, '#e4e7ea');
		body.addColorStop(1, '#a7aeb6');
		ctx.fillStyle = body;
		ctx.beginPath();
		ctx.moveTo(-29, -4);
		ctx.quadraticCurveTo(-34, 0, -30, 5);
		ctx.lineTo(-6, 7);
		ctx.lineTo(24, 2.5);
		ctx.lineTo(32, -1);
		ctx.lineTo(29, -4.5);
		ctx.lineTo(-4, -8.5);
		ctx.quadraticCurveTo(-20, -9.5, -29, -4);
		ctx.closePath();
		ctx.fill();
		ctx.strokeStyle = 'rgba(40,48,58,0.35)';
		ctx.lineWidth = 0.6;
		ctx.stroke();

		// Brand cheat line
		ctx.strokeStyle = BRAND;
		ctx.lineWidth = 1.8;
		ctx.beginPath();
		ctx.moveTo(-31, 1.2);
		ctx.lineTo(30, -1.4);
		ctx.stroke();

		// Cabin glass
		const glass = ctx.createLinearGradient(0, -15, 0, -7);
		glass.addColorStop(0, '#9fd3f0');
		glass.addColorStop(1, '#23465f');
		ctx.fillStyle = glass;
		ctx.beginPath();
		ctx.moveTo(-21, -7);
		ctx.quadraticCurveTo(-17, -15, -7, -15.5);
		ctx.lineTo(0, -8.5);
		ctx.closePath();
		ctx.fill();

		// High wing seen edge-on, with its strut
		ctx.fillStyle = '#f4f5f6';
		ctx.beginPath();
		ctx.moveTo(-22, -16);
		ctx.quadraticCurveTo(-21, -19.5, -14, -19.5);
		ctx.lineTo(4, -18.5);
		ctx.lineTo(4, -15.5);
		ctx.lineTo(-22, -15.5);
		ctx.closePath();
		ctx.fill();
		ctx.strokeStyle = 'rgba(40,48,58,0.4)';
		ctx.lineWidth = 0.6;
		ctx.stroke();
		ctx.strokeStyle = '#7d868f';
		ctx.lineWidth = 1;
		ctx.beginPath();
		ctx.moveTo(-6, -15.5);
		ctx.lineTo(-1, 4.5);
		ctx.stroke();

		// Landing gear
		ctx.strokeStyle = '#4a525b';
		ctx.lineWidth = 1.2;
		ctx.beginPath();
		ctx.moveTo(-15, 6);
		ctx.lineTo(-18, 12);
		ctx.moveTo(28, 1);
		ctx.lineTo(30, 4);
		ctx.stroke();
		ctx.fillStyle = '#23272c';
		ctx.beginPath();
		ctx.arc(-18, 12.5, 2.7, 0, Math.PI * 2);
		ctx.arc(30.5, 4.6, 1.2, 0, Math.PI * 2);
		ctx.fill();

		// Spinner and the spinning propeller: a soft disc plus a faint blade
		ctx.fillStyle = '#c9ced3';
		ctx.beginPath();
		ctx.ellipse(-32.5, 0.5, 3, 3.4, 0, 0, Math.PI * 2);
		ctx.fill();
		ctx.fillStyle = 'rgba(70,74,80,0.18)';
		ctx.beginPath();
		ctx.ellipse(-35, 0.5, 1.6, 12, 0, 0, Math.PI * 2);
		ctx.fill();
		const blade = Math.sin(clock * 53) * 12;
		ctx.strokeStyle = 'rgba(40,42,46,0.45)';
		ctx.lineWidth = 1.4;
		ctx.beginPath();
		ctx.moveTo(-35, 0.5 - blade);
		ctx.lineTo(-35, 0.5 + blade);
		ctx.stroke();

		ctx.restore();
	}

	/**
	 * Draws the plane, tow line and banner (call between the backdrop and the
	 * towers). `scale` is device pixels per world unit, for a crisp banner.
	 */
	function draw(ctx: CanvasRenderingContext2D, viewW: number, clock: number, scroll: number, scale: number) {
		// Parallax from the ground scroll, accumulated as deltas so a demo world
		// restarting at scroll 0 doesn't make the plane jump.
		if (lastScroll !== null && scroll > lastScroll) drift += (scroll - lastScroll) * PARALLAX;
		lastScroll = scroll;

		if (!flight) {
			if (clock < nextAt) return;
			flight = { start: clock, alt: 78 + Math.random() * 90, speed: 62 + Math.random() * 18, seed: Math.random() };
			drift = 0;
		}
		const f = flight;
		const t = clock - f.start;
		const noseX = viewW + 30 - f.speed * t - drift;
		if (noseX + PLANE_L + ROPE + BANNER_W < -30) {
			flight = null;
			nextAt = clock + 18 + Math.random() * 22;
			return;
		}

		const wantScale = Math.min(scale, 3);
		if (!cloth || clothScale !== wantScale || (!clothHasLogo && logo.complete && logo.naturalWidth > 0)) buildCloth(wantScale);

		const y = pathY(f, t);
		// The nose follows the climb or descent (drawn rotated by -pitch, since the plane faces left).
		const vy = (pathY(f, t + 0.05) - pathY(f, t - 0.05)) / 0.1;
		const pitch = Math.atan2(vy, f.speed) * 0.9;

		// ── Banner cloth, strip by strip ────────────────────────────────
		const leadX = noseX + PLANE_L + ROPE;
		const sw = BANNER_W / SLICES;
		const srcW = cloth!.width / SLICES;
		const tops: number[] = [];
		for (let i = 0; i <= SLICES; i++) {
			const d = PLANE_L + ROPE + i * sw;
			const u = i / SLICES;
			const k = (Math.PI * 2) / 150;
			// Travelling wave, pinned at the pole, growing toward the tail
			const amp = 0.6 + 4.2 * u * u;
			const phase = k * i * sw - clock * 5.2 + f.seed * 9;
			const wave = amp * Math.sin(phase) + 1.1 * u * u * u * Math.sin(phase * 2.7 + clock * 3.1);
			// Gravity: the cloth sags very slightly toward the free end
			tops.push(pathY(f, t - d / f.speed) - BANNER_H / 2 + 3 + wave + u * 2.5);
		}

		for (let i = 0; i < SLICES; i++) {
			// Each strip is sheared to run from one wave point to the next, so the
			// hems are one unbroken line rather than steps.
			const slope = (tops[i + 1] - tops[i]) / sw;
			ctx.save();
			ctx.transform(1, slope, 0, 1, leadX + i * sw, tops[i]);
			ctx.drawImage(cloth!, i * srcW, 0, srcW, cloth!.height, 0, 0, sw + 0.5, BANNER_H);
			// Light catches the folds facing up and shades those facing down
			const shade = Math.max(-1, Math.min(1, slope * 1.8));
			ctx.fillStyle = shade > 0 ? `rgba(20,24,30,${shade * 0.22})` : `rgba(255,255,255,${-shade * 0.28})`;
			ctx.fillRect(0, 0, sw + 0.5, BANNER_H);
			ctx.restore();
		}

		// Spreader pole at the leading edge, with a weight at its foot
		const poleTop = tops[0] - 3;
		const poleBottom = tops[0] + BANNER_H + 3;
		ctx.strokeStyle = '#3b4148';
		ctx.lineWidth = 2;
		ctx.beginPath();
		ctx.moveTo(leadX, poleTop);
		ctx.lineTo(leadX, poleBottom);
		ctx.stroke();
		ctx.fillStyle = '#2a2e33';
		ctx.beginPath();
		ctx.arc(leadX, poleBottom + 1, 2, 0, Math.PI * 2);
		ctx.fill();

		// Tow line from the tail hook to a bridle on the pole, sagging under its own weight
		const hookX = noseX + PLANE_L - 3;
		const hookY = y + 2 - Math.sin(pitch) * (PLANE_L / 2 - 3);
		const ringX = leadX - 14;
		const ringY = (poleTop + poleBottom) / 2;
		ctx.strokeStyle = 'rgba(45,50,56,0.85)';
		ctx.lineWidth = 0.9;
		ctx.beginPath();
		ctx.moveTo(hookX, hookY);
		ctx.quadraticCurveTo((hookX + ringX) / 2, Math.max(hookY, ringY) + 5, ringX, ringY);
		ctx.lineTo(leadX, poleTop + 1);
		ctx.moveTo(ringX, ringY);
		ctx.lineTo(leadX, poleBottom - 1);
		ctx.stroke();

		plane(ctx, noseX, y, -pitch, clock);
	}

	/** Navigation lights, drawn after the dusk tint so they glow at night. */
	function lights(ctx: CanvasRenderingContext2D, viewW: number, clock: number, night: number) {
		if (!flight || night < 0.05) return;
		const f = flight;
		const t = clock - f.start;
		const cx = viewW + 30 - f.speed * t - drift + PLANE_L / 2;
		const y = pathY(f, t);
		const strobe = clock % 1.3 < 0.08;
		const beacon = 0.5 + 0.5 * Math.sin(clock * 6);
		ctx.save();
		ctx.globalCompositeOperation = 'lighter';
		const glow = (x: number, gy: number, r: number, color: string, a: number) => {
			const g = ctx.createRadialGradient(x, gy, 0, x, gy, r);
			g.addColorStop(0, color.replace('A', String(a)));
			g.addColorStop(1, color.replace('A', '0'));
			ctx.fillStyle = g;
			ctx.fillRect(x - r, gy - r, r * 2, r * 2);
		};
		glow(cx - 21, y - 17.5, 7, 'rgba(255,60,50,A)', night * 0.9); // wingtip
		glow(cx - 4, y + 7, 6, 'rgba(255,40,40,A)', night * beacon); // belly beacon
		if (strobe) glow(cx + 31, y - 17, 12, 'rgba(255,255,255,A)', night); // tail strobe
		ctx.restore();
	}

	return { draw, lights };
}
