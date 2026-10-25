<script lang="ts" module>
	export type Tool = 'brush' | 'eraser' | 'fill';
</script>

<script lang="ts">
	import { untrack } from 'svelte';
	import { Board, Playback } from '$lib/games/scribble/board';
	import { CANVAS_H, CANVAS_W, FLUSH_MS, WHITE, type Op } from '$lib/games/scribble/types';
	import type { Chunk } from '$lib/games/scribble/live';

	interface Props {
		/** The turn's drawing so far, in order. */
		chunks?: Chunk[];
		/** The artist draws on it; otherwise it plays `chunks` back as they arrive. */
		editable?: boolean;
		color?: number;
		brush?: number;
		tool?: Tool;
		/**
		 * Sends the artist's work as numbered chunks; resolves false once the
		 * turn is closed. Omit for a doodle that stays on this device.
		 */
		send?: (seq: number, ops: Op[]) => Promise<boolean>;
		/** Smooth playback; off draws everything at once (the gallery's still frames). */
		animate?: boolean;
		/** Called after the artist changes the canvas (empty = nothing to undo). */
		onchange?: (empty: boolean) => void;
		label?: string;
		class?: string;
	}
	let {
		chunks = [],
		editable = false,
		color = 0,
		brush = 1,
		tool = 'brush',
		send,
		animate = true,
		onchange,
		label = 'Drawing',
		class: cls = ''
	}: Props = $props();

	// One canvas per turn: keep the sender it started with, even while it is being torn down.
	const sender = untrack(() => send);
	let canvasEl: HTMLCanvasElement;
	let board: Board | null = null;
	let playback: Playback | null = null;
	const applied = new Set<string>();
	let maxSeq = -1;
	/** The artist has started drawing here: from now on this device is the source, not Firestore. */
	let local = false;

	// ── Remote chunks → board ─────────────────────────────────────────────
	$effect(() => {
		const list = chunks;
		untrack(() => {
			if (!board) {
				board = new Board(canvasEl);
				playback = new Playback(board);
			}
			sync(list);
		});
	});

	function sync(list: Chunk[]) {
		if (local || !board || !playback) return;
		const fresh = list.filter((c) => !applied.has(c.id));
		if (!fresh.length) return;
		// A chunk arrived out of order: replay the whole drawing.
		if (fresh[0].seq < maxSeq) return rebuild(list);
		for (const c of fresh) {
			applied.add(c.id);
			maxSeq = Math.max(maxSeq, c.seq);
			if (animate && !editable) playback.enqueue(c.ops);
			else for (const op of c.ops) board.apply(op);
		}
		if (editable) onchange?.(board.empty);
	}

	function rebuild(list: Chunk[]) {
		if (!board || !playback) return;
		playback.stop();
		board.reset();
		applied.clear();
		maxSeq = -1;
		for (const c of list) {
			applied.add(c.id);
			maxSeq = Math.max(maxSeq, c.seq);
			for (const op of c.ops) board.apply(op);
		}
	}

	// ── The artist's pen ──────────────────────────────────────────────────
	let nextId = -1;
	let stroke: { i: number; c: number; w: number; x: number; y: number } | null = null;

	function takeOver() {
		if (local || !board) return;
		local = true;
		playback?.flush();
	}

	function emit(op: Op) {
		if (!board) return;
		board.apply(op);
		queue(op);
		onchange?.(board.empty);
	}

	const newId = () => (nextId = Math.max(nextId, board?.maxId ?? -1) + 1);

	function point(e: PointerEvent): [number, number] {
		const r = canvasEl.getBoundingClientRect();
		const x = Math.round(((e.clientX - r.left) / r.width) * CANVAS_W);
		const y = Math.round(((e.clientY - r.top) / r.height) * CANVAS_H);
		return [Math.min(CANVAS_W, Math.max(0, x)), Math.min(CANVAS_H, Math.max(0, y))];
	}

	function down(e: PointerEvent) {
		if (!editable || !board || (e.pointerType === 'mouse' && e.button !== 0)) return;
		e.preventDefault();
		canvasEl.setPointerCapture(e.pointerId);
		takeOver();
		const [x, y] = point(e);
		if (tool === 'fill') {
			emit({ t: 'f', i: newId(), c: color, x, y });
			return;
		}
		stroke = { i: newId(), c: tool === 'eraser' ? WHITE : color, w: brush, x, y };
		emit({ t: 's', i: stroke.i, c: stroke.c, w: stroke.w, p: [x, y] });
	}

	function move(e: PointerEvent) {
		if (!stroke) return;
		e.preventDefault();
		const p: number[] = [];
		for (const ev of e.getCoalescedEvents?.() ?? [e]) {
			const [x, y] = point(ev);
			if (Math.hypot(x - stroke.x, y - stroke.y) < 2) continue;
			p.push(x, y);
			stroke.x = x;
			stroke.y = y;
		}
		if (p.length) emit({ t: 's', i: stroke.i, c: stroke.c, w: stroke.w, p });
	}

	function up() {
		stroke = null;
	}

	/** Take back the newest stroke or fill. */
	export function undo() {
		if (!editable || !board) return;
		takeOver();
		const id = board.lastId();
		if (id !== null) emit({ t: 'u', i: id });
	}

	export function clear() {
		if (!editable || !board || board.empty) return;
		takeOver();
		emit({ t: 'c' });
	}

	// ── Sending ───────────────────────────────────────────────────────────
	const MAX_NUMBERS = 2000;
	const MAX_OPS = 60;
	let buffer: Op[] = [];
	let seq = -1;
	let sending = false;
	let closed = false;
	let timer: ReturnType<typeof setTimeout> | null = null;

	function queue(op: Op) {
		if (!sender || closed) return;
		const last = buffer[buffer.length - 1];
		// Points of the same stroke merge, so a chunk is a few ops, not hundreds.
		if (op.t === 's' && last?.t === 's' && last.i === op.i) last.p.push(...op.p);
		else buffer.push(op.t === 's' ? { ...op, p: [...op.p] } : op);
		if (!timer && !sending) timer = setTimeout(flush, FLUSH_MS);
	}

	/** Up to the server's size limit off the front of the buffer, splitting a long stroke if needed. */
	function takeChunk(): Op[] {
		const out: Op[] = [];
		let numbers = 0;
		while (buffer.length && out.length < MAX_OPS) {
			const op = buffer[0];
			if (op.t !== 's') {
				out.push(buffer.shift()!);
				continue;
			}
			const room = MAX_NUMBERS - numbers;
			if (room < 2) break;
			if (op.p.length <= room) {
				out.push(buffer.shift()!);
				numbers += op.p.length;
			} else {
				const n = room - (room % 2);
				out.push({ ...op, p: op.p.slice(0, n) });
				op.p = op.p.slice(n);
				break;
			}
		}
		return out;
	}

	async function flush() {
		timer = null;
		if (sending || closed || !sender || !buffer.length) return;
		sending = true;
		if (seq < 0) seq = maxSeq + 1;
		const ops = takeChunk();
		for (let attempt = 0; attempt < 3; attempt++) {
			try {
				if (!(await sender(seq, ops))) closed = true;
				break;
			} catch {
				await new Promise((r) => setTimeout(r, 400 * (attempt + 1)));
			}
		}
		seq++;
		sending = false;
		if (buffer.length && !closed) timer = setTimeout(flush, buffer.length > 1 ? 0 : FLUSH_MS);
	}

	// Leaving mid-turn: send what's left, then stop.
	$effect(() => () => {
		playback?.stop();
		if (timer) clearTimeout(timer);
		if (sender && !closed && buffer.length && !sending) {
			if (seq < 0) seq = maxSeq + 1;
			sender(seq, takeChunk()).catch(() => {});
		}
	});
</script>

<canvas
	bind:this={canvasEl}
	class="block size-full rounded-[inherit] bg-white select-none {editable ? 'cursor-crosshair touch-none' : ''} {cls}"
	role={editable ? 'application' : 'img'}
	aria-label={label}
	onpointerdown={down}
	onpointermove={move}
	onpointerup={up}
	onpointercancel={up}
	onlostpointercapture={up}
></canvas>
