/**
 * "It's alive!": after a turn, the drawing peels off the canvas and moves
 * the way its word would — a rocket blasts off, a fish swims, a car zooms
 * away — then lands back on the page. This module picks the motion and
 * builds its keyframes; the component (LivingDrawing.svelte) does the DOM.
 */

export type Motion = 'launch' | 'fly' | 'swim' | 'drive' | 'bounce' | 'float' | 'spin' | 'shake' | 'dance';
export type Particle = 'flame' | 'bubble' | 'dust' | 'sparkle' | 'spark';

export const MOTIONS: Record<Motion, { caption: string; particle: Particle; /** Part of the motion (0–1) that sheds particles. */ emit: [number, number] }> = {
	launch: { caption: 'Blast off!', particle: 'flame', emit: [0.1, 1] },
	fly: { caption: 'Up, up and away!', particle: 'sparkle', emit: [0, 1] },
	swim: { caption: 'Splish splash!', particle: 'bubble', emit: [0, 1] },
	drive: { caption: 'Vroom vroom!', particle: 'dust', emit: [0.1, 1] },
	bounce: { caption: 'Boing!', particle: 'dust', emit: [0, 1] },
	float: { caption: 'Wheee…', particle: 'sparkle', emit: [0, 1] },
	spin: { caption: 'Spin it!', particle: 'sparkle', emit: [0.1, 0.9] },
	shake: { caption: 'Rumble!', particle: 'spark', emit: [0.1, 0.85] },
	dance: { caption: 'It’s alive!', particle: 'sparkle', emit: [0, 1] }
};

/** Whole phrases first (so "cricket bat" doesn't fly away), then single words. */
const PHRASES: Record<string, Motion> = {
	'cricket bat': 'bounce',
	'ice cream': 'bounce',
	'hot air balloon': 'float',
	'haunted house': 'float',
	'roller coaster': 'drive',
	'traffic jam': 'drive',
	'traffic signal': 'shake',
	'stack overflow': 'shake',
	'brain freeze': 'shake',
	'blue screen': 'shake',
	'merge conflict': 'shake',
	'monday morning': 'shake',
	'time travel': 'spin',
	'solar eclipse': 'spin',
	'tug of war': 'shake'
};

const WORDS: Record<Motion, string[]> = {
	launch: ['rocket', 'spaceship', 'spacecraft', 'satellite', 'chandrayaan', 'fireworks', 'ufo', 'missile', 'astronaut'],
	fly: ['bird', 'butterfly', 'kite', 'peacock', 'dragon', 'plane', 'airplane', 'aeroplane', 'bee', 'bat', 'owl', 'parrot', 'eagle', 'crow', 'pigeon', 'fairy', 'angel', 'helicopter', 'drone', 'superhero'],
	swim: ['fish', 'octopus', 'jellyfish', 'mermaid', 'penguin', 'boat', 'ship', 'whale', 'shark', 'dolphin', 'duck', 'crab', 'turtle', 'submarine', 'snake', 'waterfall'],
	drive: ['car', 'train', 'bicycle', 'bike', 'cycle', 'skateboard', 'rickshaw', 'auto', 'cart', 'bus', 'truck', 'tractor', 'scooter', 'motorcycle', 'horse', 'cheetah', 'dabbawala', 'baraat', 'wheelchair'],
	bounce: ['ball', 'cat', 'dog', 'kangaroo', 'frog', 'rabbit', 'bunny', 'egg', 'apple', 'mango', 'banana', 'coconut', 'pizza', 'cake', 'samosa', 'jalebi', 'dosa', 'popcorn', 'sandwich', 'heart', 'shoe', 'mouse', 'elephant', 'giraffe', 'cow', 'monkey', 'cricket', 'kabaddi', 'tiffin', 'biryani', 'snowman', 'chess', 'emoji', 'tiger', 'puri'],
	float: ['cloud', 'balloon', 'ghost', 'umbrella', 'bubble', 'moon', 'invisible', 'feather', 'leaf', 'rain', 'monsoon', 'gravity', 'sleepwalking', 'coffee', 'chai', 'yoga', 'wifi', 'bluetooth', 'download', 'cloud computing'],
	spin: ['sun', 'star', 'clock', 'flower', 'lotus', 'diya', 'wheel', 'earth', 'planet', 'rangoli', 'loading', 'loop', 'eclipse', 'hole', 'compass', 'fan', 'donut', 'tornado', 'coin', 'candle', 'hashtag', 'cd'],
	shake: ['volcano', 'earthquake', 'bug', 'virus', 'alarm', 'phone', 'deadline', 'hacker', 'phishing', 'password', 'captcha', 'quicksand', 'sunburn', 'thunder', 'storm', 'bomb', 'firewall', 'jam', 'battery', 'printer'],
	dance: ['robot', 'guitar', 'tabla', 'sitar', 'bollywood', 'holi', 'diwali', 'party', 'kathakali', 'mehendi', 'wedding', 'music', 'headphones', 'disco']
};

const lookup = new Map<string, Motion>();
for (const [motion, list] of Object.entries(WORDS) as [Motion, string[]][]) for (const w of list) lookup.set(w, motion);

/** The motion that suits a word; anything unknown (a host's own word, say) dances. */
export function motionFor(word: string): Motion {
	const w = word.toLowerCase().trim().replace(/\s+/g, ' ');
	if (PHRASES[w]) return PHRASES[w];
	if (lookup.has(w)) return lookup.get(w)!;
	// The last word usually names the thing: "hot air balloon", "auto rickshaw".
	for (const token of w.split(' ').reverse()) {
		const hit = lookup.get(token) ?? lookup.get(token.replace(/s$/, ''));
		if (hit) return hit;
	}
	return 'dance';
}

// ── Keyframes ─────────────────────────────────────────────────────────────

/** Room around the drawing's centre, and its size, in screen pixels. */
export interface Space {
	left: number;
	right: number;
	top: number;
	bottom: number;
	width: number;
	height: number;
}

interface Pose {
	x: number;
	y: number;
	rot: number;
	sx: number;
	sy: number;
	o: number;
}

export const LIFE_MS = 6200;
/** Peel off the page until here, perform until B_END, then land. */
const A_END = 0.15;
const B_END = 0.85;
/** Scale while lifted off the page. */
const S = 1.12;
const STEPS = 64;

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const easeIn = (t: number) => t * t * t;
const easeOut = (t: number) => 1 - (1 - t) ** 3;
const easeInOut = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);
const TAU = Math.PI * 2;

const P = (x: number, y: number, rot = 0, sx = S, sy = sx, o = 1): Pose => ({ x, y, rot, sx, sy, o });

/** How far the drawing lifts off the page before it starts moving. */
const liftOf = (sp: Space) => clamp(sp.height * 0.12 + 18, 18, 48);

/** Where the drawing is `t` (0–1) of the way through its motion, relative to its spot on the canvas. */
function pose(motion: Motion, t: number, sp: Space): Pose {
	const lift = liftOf(sp);
	const ax = clamp(Math.min(sp.left, sp.right) - sp.width * 0.25, 60, 520);
	const ay = clamp(sp.top - sp.height * 0.5, 40, 260);
	const offTop = sp.top + sp.height + 60;
	const face = (dx: number) => clamp(dx * 4, -1, 1); // turn to face the way it's moving

	switch (motion) {
		case 'launch': {
			if (t < 0.22) {
				const r = t / 0.22;
				return P(Math.sin(t * 160) * 5 * r, -lift + Math.sin(t * 190) * 2, 0, S * (1 - 0.06 * r), S * (1 + 0.12 * r));
			}
			if (t < 0.55) return P(0, -lift - easeIn((t - 0.22) / 0.33) * offTop, 0, S * 0.92, S * 1.25);
			const q = easeOut((t - 0.55) / 0.45);
			return P(0, lerp(-offTop, -lift * 1.3, q), 0, S, S * (1.12 - 0.12 * q));
		}
		case 'fly': {
			const a = TAU * t;
			const flap = Math.abs(Math.sin(t * Math.PI * 18));
			return P(ax * Math.sin(a), -lift - ay * 0.6 * Math.sin(Math.PI * t) - ay * 0.25 * Math.sin(2 * a), 10 * Math.sin(2 * a), S * face(Math.cos(a)), S * (1 - 0.22 * flap));
		}
		case 'swim': {
			const a = TAU * t;
			return P(ax * Math.sin(a), -lift + 16 * Math.sin(t * Math.PI * 10), 9 * Math.cos(t * Math.PI * 10), S * face(Math.cos(a)), S * (1 + 0.06 * Math.sin(t * Math.PI * 20)));
		}
		case 'drive': {
			const ground = -lift * 0.4;
			const bob = 3 * Math.sin(t * 120);
			if (t < 0.12) {
				const r = easeOut(t / 0.12);
				return P(-26 * r, lerp(-lift, ground, r), -4 * r);
			}
			// Off the right edge, then (unseen) round to the left edge and back in.
			const hidden = t >= 0.4999 && t <= 0.5025 ? 0 : 1;
			if (t < 0.5) {
				const p = easeIn((t - 0.12) / 0.38);
				return P(-26 + p * (sp.right + sp.width + 80), ground + bob, 2 + 3 * p, S * (1 + 0.25 * p), S * (1 - 0.08 * p), hidden);
			}
			const q = easeOut((t - 0.5) / 0.5);
			return P(lerp(-(sp.left + sp.width + 80), 0, q), ground + bob, 3 * (1 - q), S * (1.25 - 0.25 * q), S * (0.92 + 0.08 * q), hidden);
		}
		case 'bounce': {
			const hops = 3;
			const u = (t * hops) % 1;
			const height = Math.min(ay, 160) * 0.8 + 40;
			const ground = u < 0.1 ? 1 - u / 0.1 : u > 0.9 ? (u - 0.9) / 0.1 : 0; // squash on landing
			return P(ax * 0.5 * Math.sin(TAU * t), -lift - height * 4 * u * (1 - u), 10 * Math.sin(TAU * t * hops), S * (1 + 0.22 * ground), S * (1 - 0.25 * ground + 0.08 * (1 - ground)));
		}
		case 'float': {
			const breathe = S * (1 + 0.06 * Math.sin(6 * Math.PI * t));
			return P(ax * 0.4 * Math.sin(TAU * t), -lift - ay * 0.7 * Math.sin(Math.PI * t), 9 * Math.sin(4 * Math.PI * t), breathe);
		}
		case 'spin':
			return P(0, -lift - Math.min(ay, 120) * Math.sin(Math.PI * t), 720 * easeInOut(t), S * (1 + 0.3 * Math.sin(Math.PI * t)));
		case 'shake': {
			const env = Math.sin(Math.PI * t);
			return P(Math.sin(t * 110) * 16 * env, -lift + Math.cos(t * 90) * 7 * env, Math.sin(t * 75) * 10 * env, S * (1 + 0.14 * Math.abs(Math.sin(t * 28)) * env));
		}
		default: {
			const beat = Math.abs(Math.cos(4 * Math.PI * t));
			const twirl = t < 0.42 ? 0 : t > 0.62 ? 360 : 360 * easeInOut((t - 0.42) / 0.2);
			return P(46 * Math.sin(4 * Math.PI * t), -lift - 34 * Math.abs(Math.sin(4 * Math.PI * t)), 14 * Math.sin(8 * Math.PI * t) + twirl, S * (1 + 0.06 * beat), S * (1 - 0.1 * beat));
		}
	}
}

/** A sticker's shadow and white edge; `k` = how far off the page (0 = flat on it). */
const sticker = (k: number) =>
	`drop-shadow(0px ${(16 * k).toFixed(1)}px ${(14 * k).toFixed(1)}px rgba(0, 0, 0, ${(0.4 * k).toFixed(2)})) drop-shadow(0px 0px ${(2.5 * k).toFixed(1)}px rgba(255, 255, 255, ${(0.95 * k).toFixed(2)}))`;

const frame = (offset: number, p: Pose, k: number): Keyframe => ({
	offset,
	transform: `translate(${p.x.toFixed(1)}px, ${p.y.toFixed(1)}px) rotate(${p.rot.toFixed(1)}deg) scale(${p.sx.toFixed(3)}, ${p.sy.toFixed(3)})`,
	opacity: p.o,
	filter: sticker(k)
});

/**
 * The whole performance as Web Animations keyframes: peel off the page, do
 * the motion, land back exactly where it was drawn. Reduced motion gets a
 * gentle lift and settle.
 */
export function timeline(motion: Motion, sp: Space, reduced = false): { keyframes: Keyframe[]; duration: number } {
	const lift = liftOf(sp);
	const rest = P(0, 0, 0, 1);
	if (reduced) {
		const up = P(0, -lift * 0.5, 0, 1.05);
		return { keyframes: [frame(0, rest, 0), frame(0.25, up, 1), frame(0.75, up, 1), frame(1, rest, 0)], duration: 2400 };
	}
	const keyframes: Keyframe[] = [frame(0, rest, 0), frame(0.05, P(0, 3, 0, 1.05, 0.93), 0.2), frame(A_END, P(0, -lift, -3), 1)];

	const times = Array.from({ length: STEPS + 1 }, (_, i) => i / STEPS);
	if (motion === 'drive') times.push(0.4995, 0.4999, 0.5025, 0.503); // the unseen jump from one edge to the other
	times.sort((a, b) => a - b);
	let last = pose(motion, 0, sp);
	for (const t of times) {
		if (t === 0) continue;
		last = pose(motion, t, sp);
		keyframes.push(frame(A_END + t * (B_END - A_END), last, 1));
	}

	// Land without unwinding any full turns it spun.
	const turns = Math.round(last.rot / 360) * 360;
	keyframes.push(frame(0.93, P(0, -lift * 0.8, 2 + turns), 1), frame(0.97, P(0, 2, turns, 1.04, 0.95), 0.3), frame(1, P(0, 0, turns, 1), 0));
	return { keyframes, duration: LIFE_MS };
}
