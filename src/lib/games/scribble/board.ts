import { BRUSHES, CANVAS_H, CANVAS_W, FLUSH_MS, PALETTE, type Op } from './types';

/**
 * The drawing surface. Every screen replays the same list of operations in
 * the same 800×600 space, so a fill or an undo lands the same everywhere.
 */

type Item = { t: 's'; i: number; c: number; w: number; p: number[] } | { t: 'f'; i: number; c: number; x: number; y: number };

/** Backing pixels per logical unit: sharp on a projector, cheap to flood-fill. */
const SCALE = 1.5;
const FILL_TOLERANCE = 60;

export class Board {
	private items: Item[] = [];
	private byId = new Map<number, Item>();
	private ctx: CanvasRenderingContext2D;
	/** Highest item id ever seen, so a drawer resuming after a reload never reuses one. */
	maxId = -1;

	constructor(readonly canvas: HTMLCanvasElement) {
		canvas.width = CANVAS_W * SCALE;
		canvas.height = CANVAS_H * SCALE;
		this.ctx = canvas.getContext('2d', { willReadFrequently: true })!;
		this.redraw();
	}

	reset() {
		this.items = [];
		this.byId.clear();
		this.maxId = -1;
		this.redraw();
	}

	apply(op: Op) {
		if (op.t === 'c') {
			this.items = [];
			this.byId.clear();
			this.redraw();
		} else if (op.t === 'u') {
			const item = this.byId.get(op.i);
			if (!item) return;
			this.byId.delete(op.i);
			this.items = this.items.filter((x) => x !== item);
			this.redraw();
		} else if (op.t === 'f') {
			this.maxId = Math.max(this.maxId, op.i);
			if (this.byId.has(op.i)) return;
			const item: Item = { t: 'f', i: op.i, c: op.c, x: op.x, y: op.y };
			this.items.push(item);
			this.byId.set(op.i, item);
			this.fill(item);
		} else {
			this.maxId = Math.max(this.maxId, op.i);
			const existing = this.byId.get(op.i);
			if (existing && existing.t === 's') {
				const from = existing.p.slice(-2);
				existing.p.push(...op.p);
				// Appending to anything but the newest item would paint over later work.
				if (this.items[this.items.length - 1] === existing) this.line(existing.c, existing.w, [...from, ...op.p]);
				else this.redraw();
			} else if (!existing) {
				const item: Item = { t: 's', i: op.i, c: op.c, w: op.w, p: [...op.p] };
				this.items.push(item);
				this.byId.set(op.i, item);
				this.line(item.c, item.w, item.p);
			}
		}
	}

	/** The newest item still on the canvas (what undo takes away). */
	lastId(): number | null {
		return this.items.length ? this.items[this.items.length - 1].i : null;
	}

	get empty() {
		return this.items.length === 0;
	}

	private redraw() {
		const { ctx } = this;
		ctx.setTransform(1, 0, 0, 1, 0, 0);
		ctx.fillStyle = '#ffffff';
		ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
		for (const item of this.items) {
			if (item.t === 's') this.line(item.c, item.w, item.p);
			else this.fill(item);
		}
	}

	private line(c: number, w: number, p: number[]) {
		if (p.length < 2) return;
		const { ctx } = this;
		ctx.setTransform(SCALE, 0, 0, SCALE, 0, 0);
		ctx.strokeStyle = ctx.fillStyle = PALETTE[c] ?? PALETTE[0];
		ctx.lineWidth = BRUSHES[w] ?? BRUSHES[1];
		ctx.lineCap = 'round';
		ctx.lineJoin = 'round';
		if (p.length === 2) {
			// A tap: a dot.
			ctx.beginPath();
			ctx.arc(p[0], p[1], ctx.lineWidth / 2, 0, Math.PI * 2);
			ctx.fill();
			return;
		}
		ctx.beginPath();
		ctx.moveTo(p[0], p[1]);
		for (let k = 2; k < p.length; k += 2) ctx.lineTo(p[k], p[k + 1]);
		ctx.stroke();
	}

	/** Scanline flood fill on the backing pixels. Anti-aliased edges count as the same region. */
	private fill(item: Extract<Item, { t: 'f' }>) {
		const { canvas, ctx } = this;
		const W = canvas.width;
		const H = canvas.height;
		const sx = Math.min(W - 1, Math.max(0, Math.round(item.x * SCALE)));
		const sy = Math.min(H - 1, Math.max(0, Math.round(item.y * SCALE)));
		const img = ctx.getImageData(0, 0, W, H);
		const d = img.data;
		const hex = PALETTE[item.c] ?? PALETTE[0];
		const fr = parseInt(hex.slice(1, 3), 16);
		const fg = parseInt(hex.slice(3, 5), 16);
		const fb = parseInt(hex.slice(5, 7), 16);
		const at = (sy * W + sx) * 4;
		const tr = d[at];
		const tg = d[at + 1];
		const tb = d[at + 2];
		if (Math.abs(tr - fr) + Math.abs(tg - fg) + Math.abs(tb - fb) < 8) return;
		const matches = (p: number) => Math.abs(d[p] - tr) + Math.abs(d[p + 1] - tg) + Math.abs(d[p + 2] - tb) <= FILL_TOLERANCE;
		const seen = new Uint8Array(W * H);
		const stack = [sx, sy];
		while (stack.length) {
			const y = stack.pop()!;
			let x = stack.pop()!;
			while (x > 0 && !seen[y * W + x - 1] && matches((y * W + x - 1) * 4)) x--;
			let up = false;
			let down = false;
			for (; x < W; x++) {
				const idx = y * W + x;
				if (seen[idx] || !matches(idx * 4)) break;
				seen[idx] = 1;
				const p = idx * 4;
				d[p] = fr;
				d[p + 1] = fg;
				d[p + 2] = fb;
				d[p + 3] = 255;
				if (y > 0) {
					const above = idx - W;
					const ok = !seen[above] && matches(above * 4);
					if (ok && !up) stack.push(x, y - 1);
					up = ok;
				}
				if (y < H - 1) {
					const below = idx + W;
					const ok = !seen[below] && matches(below * 4);
					if (ok && !down) stack.push(x, y + 1);
					down = ok;
				}
			}
		}
		ctx.putImageData(img, 0, 0);
	}
}

/**
 * Plays the artist's work onto a viewer's board smoothly: each chunk arrives
 * every FLUSH_MS, so its points are drawn out over about that long instead of
 * appearing in one jump. A backlog (a late joiner) drains in about a second.
 */
export class Playback {
	private queue: Op[] = [];
	private raf = 0;
	private last = 0;

	constructor(private board: Board) {}

	enqueue(ops: readonly Op[]) {
		for (const op of ops) this.queue.push(op.t === 's' ? { ...op, p: [...op.p] } : op);
		if (!this.raf) {
			this.last = performance.now();
			this.raf = requestAnimationFrame(this.tick);
		}
	}

	/** Apply everything queued at once. */
	flush() {
		for (const op of this.queue) this.board.apply(op);
		this.queue = [];
	}

	stop() {
		cancelAnimationFrame(this.raf);
		this.raf = 0;
		this.queue = [];
	}

	private pending() {
		let n = 0;
		for (const op of this.queue) n += op.t === 's' ? Math.max(1, op.p.length / 2) : 1;
		return n;
	}

	private tick = (now: number) => {
		const dt = Math.min(100, now - this.last);
		this.last = now;
		let budget = Math.max(1, Math.ceil((this.pending() * dt) / FLUSH_MS));
		while (budget > 0 && this.queue.length) {
			const op = this.queue[0];
			if (op.t !== 's' || op.p.length / 2 <= budget) {
				this.board.apply(op);
				this.queue.shift();
				budget -= op.t === 's' ? op.p.length / 2 : 1;
			} else {
				const n = budget * 2;
				this.board.apply({ ...op, p: op.p.slice(0, n) });
				// The rest appends to the same item, so it joins on from the last point drawn.
				op.p = op.p.slice(n);
				budget = 0;
			}
		}
		this.raf = this.queue.length ? requestAnimationFrame(this.tick) : 0;
	};
}

// ── Validation (server) ────────────────────────────────────────────────────

const MAX_OPS = 80;
const MAX_NUMBERS = 2400;
const int = (v: unknown, lo: number, hi: number) => (typeof v === 'number' && Number.isFinite(v) ? Math.min(hi, Math.max(lo, Math.round(v))) : null);

/** Reject anything that isn't a well-formed drawing op; clamp coordinates to the canvas. */
export function sanitizeOps(raw: unknown): Op[] | null {
	if (!Array.isArray(raw) || raw.length === 0 || raw.length > MAX_OPS) return null;
	const out: Op[] = [];
	let numbers = 0;
	for (const o of raw) {
		if (!o || typeof o !== 'object') return null;
		const op = o as Record<string, unknown>;
		const i = int(op.i, 0, 1_000_000);
		if (op.t === 'c') out.push({ t: 'c' });
		else if (op.t === 'u' && i !== null) out.push({ t: 'u', i });
		else if (op.t === 'f' && i !== null) {
			const c = int(op.c, 0, PALETTE.length - 1);
			const x = int(op.x, 0, CANVAS_W);
			const y = int(op.y, 0, CANVAS_H);
			if (c === null || x === null || y === null) return null;
			out.push({ t: 'f', i, c, x, y });
		} else if (op.t === 's' && i !== null && Array.isArray(op.p) && op.p.length >= 2 && op.p.length % 2 === 0) {
			const c = int(op.c, 0, PALETTE.length - 1);
			const w = int(op.w, 0, BRUSHES.length - 1);
			if (c === null || w === null) return null;
			numbers += op.p.length;
			if (numbers > MAX_NUMBERS) return null;
			const p: number[] = [];
			for (let k = 0; k < op.p.length; k += 2) {
				const x = int(op.p[k], 0, CANVAS_W);
				const y = int(op.p[k + 1], 0, CANVAS_H);
				if (x === null || y === null) return null;
				p.push(x, y);
			}
			out.push({ t: 's', i, c, w, p });
		} else return null;
	}
	return out;
}
