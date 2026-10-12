<script>
	import { onMount, tick, untrack } from 'svelte';
	import { beforeNavigate } from '$app/navigation';
	import { certToast as appState } from '$lib/certificates/toast.svelte';
	import { saveTemplate } from '$lib/certificates/store';
	import CertificateElement from './CertificateElement.svelte';
	import CertificateInspector from './CertificateInspector.svelte';
	import {
		MERGE_FIELDS,
		SAMPLE_VALUES,
		elementId,
		makeElement,
		pageOf
	} from '$lib/certificates/design.js';
	import { readImage } from '$lib/certificates/imageData.js';

	/**
	 * The certificate editor.
	 *
	 * The page is drawn at `zoom` with the same element renderer the print sheet
	 * uses. Over it sits a screen-space layer of hit boxes and handles, so the
	 * handles stay the same size at any zoom. Every change is kept in an undo
	 * history and saved automatically a moment after editing stops.
	 */
	let { template, verifyBase = '' } = $props();

	// The working copy. Deeply reactive; the renderer and panels read from it.
	// Seeded once from the loaded template; later edits come from the editor alone.
	const initial = untrack(() => JSON.parse(JSON.stringify(template.design)));
	let design = $state(initial);
	let name = $state(untrack(() => template.name));
	let selectedId = $state(null);
	let editingId = $state(null);
	let showSample = $state(true);

	const selected = $derived(design.elements.find((e) => e.id === selectedId) ?? null);
	const values = $derived(showSample ? SAMPLE_VALUES : null);
	const qrText = $derived(`${verifyBase}/verify/${SAMPLE_VALUES.certificate_id}`);

	// ── Zoom ──
	let viewport = $state();
	let zoom = $state(0.6);
	let fitZoom = $state(0.6);
	const PAD = 48;

	function fit() {
		if (!viewport) return;
		const w = viewport.clientWidth - PAD * 2;
		const h = viewport.clientHeight - PAD * 2;
		fitZoom = Math.max(0.1, Math.min(w / design.page.width, h / design.page.height, 2));
	}

	function setZoom(z) {
		zoom = Math.max(0.1, Math.min(3, Math.round(z * 100) / 100));
	}

	// ── History and saving ──
	const snapshot = () => JSON.stringify({ design, name });
	let history = [snapshot()];
	let cursor = 0;
	let canUndo = $state(false);
	let canRedo = $state(false);
	let restoring = false;

	let saveState = $state('saved'); // saved | pending | saving | error
	let lastSaved = snapshot();
	let commitTimer = 0;
	let saveTimer = 0;

	function syncHistoryFlags() {
		canUndo = cursor > 0;
		canRedo = cursor < history.length - 1;
	}

	function commit() {
		const now = snapshot();
		if (now === history[cursor]) return;
		history = history.slice(0, cursor + 1);
		history.push(now);
		if (history.length > 120) history.shift();
		cursor = history.length - 1;
		syncHistoryFlags();
	}

	function restore(index) {
		restoring = true;
		cursor = index;
		const state = JSON.parse(history[cursor]);
		design = state.design;
		name = state.name;
		if (selectedId && !design.elements.some((e) => e.id === selectedId)) selectedId = null;
		syncHistoryFlags();
		queueMicrotask(() => (restoring = false));
	}

	const undo = () => canUndo && restore(cursor - 1);
	const redo = () => canRedo && restore(cursor + 1);

	async function save() {
		const now = snapshot();
		if (now === lastSaved) {
			saveState = 'saved';
			return;
		}
		saveState = 'saving';
		try {
			await saveTemplate(template.id, JSON.parse(now));
			lastSaved = now;
			saveState = snapshot() === lastSaved ? 'saved' : 'pending';
		} catch (error) {
			saveState = 'error';
			appState.showToast(error.message || 'Could not save the certificate.', 'error');
		}
	}

	// Every change: remember it for undo once editing pauses, and save a moment later.
	$effect(() => {
		const now = snapshot();
		if (now === lastSaved) return;
		saveState = 'pending';
		clearTimeout(commitTimer);
		clearTimeout(saveTimer);
		if (!restoring) commitTimer = setTimeout(commit, 350);
		saveTimer = setTimeout(save, 1200);
	});

	beforeNavigate(({ cancel, type }) => {
		if (saveState === 'saved') return;
		if (type === 'leave') {
			cancel();
			return;
		}
		save();
	});

	// ── Changing things ──
	function update(id, changes) {
		const el = design.elements.find((e) => e.id === id);
		if (el) Object.assign(el, changes);
	}

	function add(type, overrides = {}) {
		const el = makeElement(type, design.page, overrides);
		design.elements.push(el);
		selectedId = el.id;
		return el;
	}

	function addField(key) {
		const field = MERGE_FIELDS.find((f) => f.key === key);
		const big = key === 'participant_name';
		add('text', {
			text: `{{${key}}}`,
			fontSize: big ? 56 : 22,
			fontFamily: big ? 'Great Vibes' : 'Playfair Display',
			height: big ? 80 : 40,
			width: big ? 640 : 460,
			x: design.page.width / 2 - (big ? 320 : 230)
		});
		appState.showToast(`Added ${field?.label ?? key}. It fills in for each participant.`, 'info');
	}

	function remove(id) {
		design.elements = design.elements.filter((e) => e.id !== id);
		if (selectedId === id) selectedId = null;
	}

	function duplicate(id) {
		const el = design.elements.find((e) => e.id === id);
		if (!el) return;
		const copy = {
			...JSON.parse(JSON.stringify(el)),
			id: elementId(),
			x: el.x + 20,
			y: el.y + 20,
			locked: false
		};
		const at = design.elements.indexOf(el);
		design.elements.splice(at + 1, 0, copy);
		selectedId = copy.id;
	}

	function reorder(id, where) {
		const list = design.elements;
		const from = list.findIndex((e) => e.id === id);
		if (from < 0) return;
		const [el] = list.splice(from, 1);
		const to =
			where === 'front'
				? list.length
				: where === 'back'
					? 0
					: where === 'forward'
						? Math.min(list.length, from + 1)
						: Math.max(0, from - 1);
		list.splice(to, 0, el);
	}

	function alignOnPage(id, how) {
		const el = design.elements.find((e) => e.id === id);
		if (!el) return;
		const { width: W, height: H } = design.page;
		const m = 40;
		if (how === 'align-left') el.x = m;
		if (how === 'align-center') el.x = (W - el.width) / 2;
		if (how === 'align-right') el.x = W - el.width - m;
		if (how === 'align-top') el.y = m;
		if (how === 'align-middle') el.y = (H - el.height) / 2;
		if (how === 'align-bottom') el.y = H - el.height - m;
	}

	function onaction(action) {
		if (!selectedId) return;
		if (action === 'delete') remove(selectedId);
		else if (action === 'duplicate') duplicate(selectedId);
		else if (action.startsWith('align-')) alignOnPage(selectedId, action);
		else reorder(selectedId, action);
	}

	/** Page size or orientation: elements keep their place relative to the page. */
	function onpage(changes) {
		if (changes.size || changes.orientation) {
			const next = pageOf(
				changes.size ?? design.page.size,
				changes.orientation ?? design.page.orientation
			);
			const sx = next.width / design.page.width;
			const sy = next.height / design.page.height;
			for (const el of design.elements) {
				const cx = (el.x + el.width / 2) * sx;
				const cy = (el.y + el.height / 2) * sy;
				el.x = cx - el.width / 2;
				el.y = cy - el.height / 2;
			}
			Object.assign(design.page, next);
			tick().then(() => {
				fit();
				zoom = fitZoom;
			});
		} else {
			Object.assign(design.page, changes);
		}
	}

	// ── Images ──
	let fileInput = $state();
	let imageTarget = 'new'; // new | element | background

	function pickImage(target) {
		imageTarget = target;
		fileInput.value = '';
		fileInput.click();
	}

	async function placeImage(file, at = null) {
		try {
			const background = imageTarget === 'background';
			// Images are stored inside the design, so keep them modest.
			const img = await readImage(file, background ? 1600 : 900);
			if (background) {
				design.page.backgroundImage = img.src;
			} else if (imageTarget === 'element' && selected?.type === 'image') {
				selected.src = img.src;
			} else {
				const { width: W, height: H } = design.page;
				const scale = Math.min((W * 0.35) / img.width, (H * 0.35) / img.height, 1);
				const w = Math.round(img.width * scale);
				const h = Math.round(img.height * scale);
				add('image', {
					src: img.src,
					width: w,
					height: h,
					x: at ? at.x - w / 2 : (W - w) / 2,
					y: at ? at.y - h / 2 : (H - h) / 2
				});
			}
		} catch (error) {
			appState.showToast(error.message, 'error');
		} finally {
			imageTarget = 'new';
		}
	}

	function onFile(event) {
		const file = event.currentTarget.files?.[0];
		if (file) placeImage(file);
	}

	function onDrop(event) {
		event.preventDefault();
		const file = [...(event.dataTransfer?.files ?? [])].find((f) => f.type.startsWith('image/'));
		if (!file) return;
		imageTarget = 'new';
		placeImage(file, toPage(event.clientX, event.clientY));
	}

	// ── Pointer: move, resize, rotate, with snapping ──
	let stage = $state();
	let guides = $state({ x: [], y: [] });
	let drag = null;

	/** Screen point → page point. */
	function toPage(clientX, clientY) {
		const rect = stage.getBoundingClientRect();
		return { x: (clientX - rect.left) / zoom, y: (clientY - rect.top) / zoom };
	}

	const rad = (deg) => (deg * Math.PI) / 180;
	const rotate = (x, y, deg) => {
		const r = rad(deg);
		return { x: x * Math.cos(r) - y * Math.sin(r), y: x * Math.sin(r) + y * Math.cos(r) };
	};

	/** Lines an element can snap to: the page's edges and centre, and every other element's. */
	function snapTargets(excludeId) {
		const { width: W, height: H } = design.page;
		const xs = [0, W / 2, W];
		const ys = [0, H / 2, H];
		for (const e of design.elements) {
			if (e.id === excludeId || e.hidden) continue;
			xs.push(e.x, e.x + e.width / 2, e.x + e.width);
			ys.push(e.y, e.y + e.height / 2, e.y + e.height);
		}
		return { xs, ys };
	}

	function snapAxis(edges, targets, threshold) {
		let best = null;
		for (const edge of edges) {
			for (const t of targets) {
				const d = t - edge;
				if (Math.abs(d) <= threshold && (!best || Math.abs(d) < Math.abs(best.d)))
					best = { d, at: t };
			}
		}
		return best;
	}

	function startMove(event, el) {
		if (event.button !== 0) return;
		event.stopPropagation();
		selectedId = el.id;
		if (editingId && editingId !== el.id) editingId = null;
		if (el.locked || editingId === el.id) return;
		const p = toPage(event.clientX, event.clientY);
		drag = { mode: 'move', id: el.id, start: p, x0: el.x, y0: el.y, targets: snapTargets(el.id) };
		event.currentTarget.setPointerCapture(event.pointerId);
	}

	function startResize(event, el, hx, hy) {
		event.stopPropagation();
		const p = toPage(event.clientX, event.clientY);
		drag = {
			mode: 'resize',
			id: el.id,
			hx,
			hy,
			start: p,
			w0: el.width,
			h0: el.height,
			c0: { x: el.x + el.width / 2, y: el.y + el.height / 2 },
			rotation: el.rotation || 0,
			ratio: el.width / el.height,
			keepRatio: el.type === 'image' || el.type === 'qr' || el.type === 'ellipse'
		};
		event.currentTarget.setPointerCapture(event.pointerId);
	}

	function startRotate(event, el) {
		event.stopPropagation();
		drag = { mode: 'rotate', id: el.id, c: { x: el.x + el.width / 2, y: el.y + el.height / 2 } };
		event.currentTarget.setPointerCapture(event.pointerId);
	}

	function onPointerMove(event) {
		if (!drag) return;
		const el = design.elements.find((e) => e.id === drag.id);
		if (!el) return;
		const p = toPage(event.clientX, event.clientY);

		if (drag.mode === 'move') {
			let x = drag.x0 + (p.x - drag.start.x);
			let y = drag.y0 + (p.y - drag.start.y);
			const gx = [];
			const gy = [];
			if (!event.altKey) {
				const threshold = 6 / zoom;
				const sx = snapAxis([x, x + el.width / 2, x + el.width], drag.targets.xs, threshold);
				const sy = snapAxis([y, y + el.height / 2, y + el.height], drag.targets.ys, threshold);
				if (sx) {
					x += sx.d;
					gx.push(sx.at);
				}
				if (sy) {
					y += sy.d;
					gy.push(sy.at);
				}
			}
			el.x = Math.round(x * 10) / 10;
			el.y = Math.round(y * 10) / 10;
			guides = { x: gx, y: gy };
		} else if (drag.mode === 'resize') {
			const d = rotate(p.x - drag.start.x, p.y - drag.start.y, -drag.rotation);
			let w = Math.max(8, drag.w0 + drag.hx * d.x);
			let h = Math.max(el.type === 'line' ? 1 : 8, drag.h0 + drag.hy * d.y);
			const keep = drag.keepRatio !== event.shiftKey && drag.hx && drag.hy;
			if (keep) {
				if (w / drag.ratio > h) h = w / drag.ratio;
				else w = h * drag.ratio;
			}
			if (!drag.hx) w = drag.w0;
			if (!drag.hy) h = drag.h0;
			const shift = rotate(
				(drag.hx * (w - drag.w0)) / 2,
				(drag.hy * (h - drag.h0)) / 2,
				drag.rotation
			);
			const cx = drag.c0.x + shift.x;
			const cy = drag.c0.y + shift.y;
			el.width = Math.round(w * 10) / 10;
			el.height = Math.round(h * 10) / 10;
			el.x = Math.round((cx - w / 2) * 10) / 10;
			el.y = Math.round((cy - h / 2) * 10) / 10;
		} else if (drag.mode === 'rotate') {
			let angle = (Math.atan2(p.y - drag.c.y, p.x - drag.c.x) * 180) / Math.PI + 90;
			if (angle > 180) angle -= 360;
			const step = event.shiftKey ? 15 : 0;
			if (step) angle = Math.round(angle / step) * step;
			else if (Math.abs(angle % 90) < 3 || Math.abs(angle % 90) > 87)
				angle = Math.round(angle / 90) * 90;
			el.rotation = Math.round(angle * 10) / 10;
		}
	}

	function onPointerUp() {
		drag = null;
		guides = { x: [], y: [] };
	}

	function onCanvasDown(event) {
		if (event.target === event.currentTarget || event.target.dataset?.backdrop !== undefined) {
			selectedId = null;
			editingId = null;
		}
	}

	// ── Inline text editing ──
	let editor = $state();

	async function startEditing(el) {
		if (el.type !== 'text') return;
		selectedId = el.id;
		editingId = el.id;
		await tick();
		editor?.focus();
		editor?.select();
	}

	// ── Keyboard ──
	function onKeydown(event) {
		const typing = event.target.closest?.('input, textarea, select, [contenteditable="true"]');
		const mod = event.ctrlKey || event.metaKey;

		if (mod && event.key.toLowerCase() === 'z' && !typing) {
			event.preventDefault();
			if (event.shiftKey) redo();
			else undo();
			return;
		}
		if (mod && event.key.toLowerCase() === 'y' && !typing) {
			event.preventDefault();
			redo();
			return;
		}
		if (mod && event.key.toLowerCase() === 's') {
			event.preventDefault();
			clearTimeout(saveTimer);
			save();
			return;
		}
		if (typing) {
			if (event.key === 'Escape') {
				editingId = null;
				event.target.blur?.();
			}
			return;
		}
		if (!selected) return;

		if (event.key === 'Delete' || event.key === 'Backspace') {
			event.preventDefault();
			remove(selected.id);
		} else if (mod && event.key.toLowerCase() === 'd') {
			event.preventDefault();
			duplicate(selected.id);
		} else if (event.key === 'Escape') {
			selectedId = null;
		} else if (event.key === 'Enter' && selected.type === 'text') {
			event.preventDefault();
			startEditing(selected);
		} else if (event.key === ']') {
			reorder(selected.id, event.shiftKey ? 'front' : 'forward');
		} else if (event.key === '[') {
			reorder(selected.id, event.shiftKey ? 'back' : 'backward');
		} else if (event.key.startsWith('Arrow') && !selected.locked) {
			event.preventDefault();
			const step = event.shiftKey ? 10 : 1;
			if (event.key === 'ArrowLeft') selected.x -= step;
			if (event.key === 'ArrowRight') selected.x += step;
			if (event.key === 'ArrowUp') selected.y -= step;
			if (event.key === 'ArrowDown') selected.y += step;
		}
	}

	function onWheel(event) {
		if (!event.ctrlKey && !event.metaKey) return;
		event.preventDefault();
		setZoom(zoom * (event.deltaY < 0 ? 1.1 : 0.9));
	}

	onMount(() => {
		fit();
		zoom = fitZoom;
		const observer = new ResizeObserver(fit);
		observer.observe(viewport);
		const warn = (event) => {
			if (saveState !== 'saved') event.preventDefault();
		};
		window.addEventListener('beforeunload', warn);
		return () => {
			observer.disconnect();
			window.removeEventListener('beforeunload', warn);
			clearTimeout(commitTimer);
			clearTimeout(saveTimer);
		};
	});

	/** An outline with nothing inside: clicks through its middle reach what is beneath. */
	const isHollow = (el) =>
		(el.type === 'rect' || el.type === 'ellipse') && (el.fill === 'transparent' || !el.fill);

	const HANDLES = [
		[-1, -1],
		[0, -1],
		[1, -1],
		[1, 0],
		[1, 1],
		[0, 1],
		[-1, 1],
		[-1, 0]
	];

	const LAYER_ICON = {
		text: 'title',
		image: 'image',
		rect: 'rectangle',
		ellipse: 'circle',
		line: 'horizontal_rule',
		qr: 'qr_code_2'
	};
	const layerName = (el) =>
		el.type === 'text'
			? el.text.replace(/\s+/g, ' ').slice(0, 28) || 'Empty text'
			: {
					image: 'Image',
					rect: 'Rectangle',
					ellipse: 'Ellipse',
					line: 'Line',
					qr: 'Verification QR'
				}[el.type];

	const SAVE_LABEL = {
		saved: 'Saved',
		pending: 'Unsaved changes',
		saving: 'Saving…',
		error: 'Not saved'
	};
</script>

<svelte:window onkeydown={onKeydown} onpointermove={onPointerMove} onpointerup={onPointerUp} />

<input bind:this={fileInput} type="file" accept="image/*" class="hidden" onchange={onFile} />

<div class="editor">
	<!-- ══ Top bar ══ -->
	<header class="bar">
		<a href="/admin/certificates" class="ib" title="All certificates" aria-label="All certificates">
			<span class="material-symbols-outlined">arrow_back</span>
		</a>
		<input class="name" bind:value={name} aria-label="Certificate name" maxlength="120" />
		<span class="save save-{saveState}" aria-live="polite">
			{#if saveState === 'saving'}<span class="spinner"></span>{:else if saveState === 'saved'}<span
					class="material-symbols-outlined">cloud_done</span
				>{:else if saveState === 'error'}<span class="material-symbols-outlined">cloud_off</span
				>{/if}
			{SAVE_LABEL[saveState]}
			{#if saveState === 'error'}<button type="button" class="retry" onclick={save}>Retry</button
				>{/if}
		</span>

		<div class="bar-mid">
			<button type="button" class="ib" title="Undo (Ctrl+Z)" disabled={!canUndo} onclick={undo}>
				<span class="material-symbols-outlined">undo</span>
			</button>
			<button type="button" class="ib" title="Redo (Ctrl+Y)" disabled={!canRedo} onclick={redo}>
				<span class="material-symbols-outlined">redo</span>
			</button>
			<span class="sep"></span>
			<button type="button" class="ib" title="Zoom out" onclick={() => setZoom(zoom / 1.2)}>
				<span class="material-symbols-outlined">remove</span>
			</button>
			<button
				type="button"
				class="zoom"
				title="Fit to screen"
				onclick={() => (fit(), (zoom = fitZoom))}
			>
				{Math.round(zoom * 100)}%
			</button>
			<button type="button" class="ib" title="Zoom in" onclick={() => setZoom(zoom * 1.2)}>
				<span class="material-symbols-outlined">add</span>
			</button>
			<span class="sep"></span>
			<label class="toggle" title="Show sample values in place of the fields">
				<input type="checkbox" bind:checked={showSample} />
				Sample values
			</label>
		</div>

		<a href="/admin/certificates/{template.id}/issue" class="issue" onclick={() => save()}>
			<span class="material-symbols-outlined">send</span> Issue
		</a>
	</header>

	<div class="body">
		<!-- ══ Left: add, layers ══ -->
		<aside class="left" aria-label="Add and arrange">
			<section>
				<span class="label">Add</span>
				<div class="tiles">
					<button
						type="button"
						class="tile"
						onclick={() =>
							add('text', {
								text: 'Heading',
								fontSize: 44,
								height: 70,
								fontFamily: 'Playfair Display',
								fontWeight: 600
							})}
					>
						<span class="material-symbols-outlined">title</span> Heading
					</button>
					<button
						type="button"
						class="tile"
						onclick={() =>
							add('text', { text: 'Body text', fontSize: 20, height: 40, fontFamily: 'Geist' })}
					>
						<span class="material-symbols-outlined">notes</span> Text
					</button>
					<button type="button" class="tile" onclick={() => pickImage('new')}>
						<span class="material-symbols-outlined">add_photo_alternate</span> Image
					</button>
					<button type="button" class="tile" onclick={() => add('qr')}>
						<span class="material-symbols-outlined">qr_code_2</span> QR code
					</button>
					<button type="button" class="tile" onclick={() => add('rect')}>
						<span class="material-symbols-outlined">rectangle</span> Box
					</button>
					<button type="button" class="tile" onclick={() => add('ellipse')}>
						<span class="material-symbols-outlined">circle</span> Circle
					</button>
					<button type="button" class="tile" onclick={() => add('line')}>
						<span class="material-symbols-outlined">horizontal_rule</span> Line
					</button>
					<button
						type="button"
						class="tile"
						onclick={() =>
							add('rect', {
								x: 24,
								y: 24,
								width: design.page.width - 48,
								height: design.page.height - 48,
								fill: 'transparent',
								strokeWidth: 3,
								radius: 0
							})}
					>
						<span class="material-symbols-outlined">border_outer</span> Border
					</button>
				</div>
			</section>

			<section>
				<span class="label">Fields</span>
				<p class="hint">Filled in with each participant's details when issued.</p>
				<div class="field-list">
					{#each MERGE_FIELDS as f (f.key)}
						<button type="button" class="field" onclick={() => addField(f.key)}>
							<span class="material-symbols-outlined">data_object</span>
							{f.label}
						</button>
					{/each}
				</div>
			</section>

			<section class="layers">
				<span class="label">Layers</span>
				{#if design.elements.length}
					<ol>
						{#each [...design.elements].reverse() as el (el.id)}
							<li>
								<button
									type="button"
									class="layer"
									class:is-on={el.id === selectedId}
									class:is-hidden={el.hidden}
									onclick={() => (selectedId = el.id)}
									ondblclick={() => startEditing(el)}
								>
									<span class="material-symbols-outlined">{LAYER_ICON[el.type]}</span>
									<span class="layer-name">{layerName(el)}</span>
									{#if el.locked}<span class="material-symbols-outlined tiny">lock</span>{/if}
									{#if el.hidden}<span class="material-symbols-outlined tiny">visibility_off</span
										>{/if}
								</button>
							</li>
						{/each}
					</ol>
				{:else}
					<p class="hint">Nothing on the page yet.</p>
				{/if}
			</section>
		</aside>

		<!-- ══ Canvas ══ -->
		<div
			class="viewport"
			bind:this={viewport}
			onpointerdown={onCanvasDown}
			onwheel={onWheel}
			ondragover={(e) => e.preventDefault()}
			ondrop={onDrop}
			role="presentation"
			data-backdrop
		>
			<div class="scroller" data-backdrop>
				<div
					class="stage"
					bind:this={stage}
					style:width="{design.page.width * zoom}px"
					style:height="{design.page.height * zoom}px"
				>
					<!-- The page, drawn by the same renderer the print sheet uses -->
					<div
						class="page"
						style:width="{design.page.width}px"
						style:height="{design.page.height}px"
						style:transform="scale({zoom})"
						style:background-color={design.page.background}
						style:background-image={design.page.backgroundImage
							? `url(${design.page.backgroundImage})`
							: 'none'}
					>
						{#each design.elements as el (el.id)}
							{#if el.id !== editingId}
								<CertificateElement {el} {values} {qrText} editing />
							{/if}
						{/each}
					</div>

					<!-- Screen-space layer: hit boxes, handles, guides -->
					<div class="overlay" onpointerdown={onCanvasDown} role="presentation" data-backdrop>
						{#each design.elements as el (el.id)}
							<div
								class="hit"
								class:is-selected={el.id === selectedId}
								class:is-locked={el.locked}
								class:is-hollow={isHollow(el) && el.id !== selectedId}
								style:left="{el.x * zoom}px"
								style:top="{el.y * zoom}px"
								style:width="{el.width * zoom}px"
								style:height="{Math.max(el.height * zoom, 6)}px"
								style:transform="rotate({el.rotation || 0}deg)"
								onpointerdown={(e) => startMove(e, el)}
								ondblclick={() => startEditing(el)}
								role="presentation"
							>
								{#if isHollow(el) && el.id !== selectedId}
									<!-- A shape with no fill is picked up by its outline, so the page inside stays clickable. -->
									{#each ['top', 'right', 'bottom', 'left'] as side (side)}
										<span class="edge edge-{side}" role="presentation"></span>
									{/each}
								{/if}
								{#if el.id === editingId}
									<textarea
										bind:this={editor}
										class="inline-edit"
										value={el.text}
										oninput={(e) => (el.text = e.currentTarget.value)}
										onblur={() => (editingId = null)}
										style:font-family="'{el.fontFamily}', Geist, serif"
										style:font-size="{el.fontSize * zoom}px"
										style:font-weight={el.fontWeight}
										style:font-style={el.italic ? 'italic' : 'normal'}
										style:color={el.color}
										style:text-align={el.align}
										style:letter-spacing="{el.letterSpacing * zoom}px"
										style:line-height={el.lineHeight}
										style:text-transform={el.uppercase ? 'uppercase' : 'none'}></textarea>
								{/if}
							</div>
						{/each}

						{#if selected && selected.id !== editingId}
							<div
								class="frame"
								style:left="{selected.x * zoom}px"
								style:top="{selected.y * zoom}px"
								style:width="{selected.width * zoom}px"
								style:height="{Math.max(selected.height * zoom, 6)}px"
								style:transform="rotate({selected.rotation || 0}deg)"
							>
								{#if !selected.locked}
									{#each HANDLES as [hx, hy] (`${hx}${hy}`)}
										{#if !(selected.type === 'line' && hy !== 0)}
											<span
												class="handle"
												style:left="{(hx + 1) * 50}%"
												style:top="{(hy + 1) * 50}%"
												style:cursor={hx === 0
													? 'ns-resize'
													: hy === 0
														? 'ew-resize'
														: hx === hy
															? 'nwse-resize'
															: 'nesw-resize'}
												onpointerdown={(e) => startResize(e, selected, hx, hy)}
												role="presentation"
											></span>
										{/if}
									{/each}
									<span class="rotate-stem"></span>
									<span
										class="rotate"
										title="Rotate (Shift snaps to 15°)"
										onpointerdown={(e) => startRotate(e, selected)}
										role="presentation"
									>
										<span class="material-symbols-outlined">rotate_right</span>
									</span>
								{/if}
							</div>
						{/if}

						{#each guides.x as gx (gx)}
							<span class="guide gx" style:left="{gx * zoom}px"></span>
						{/each}
						{#each guides.y as gy (gy)}
							<span class="guide gy" style:top="{gy * zoom}px"></span>
						{/each}
					</div>
				</div>
			</div>
		</div>

		<!-- ══ Right: properties ══ -->
		<aside class="right" aria-label="Properties">
			<CertificateInspector
				{design}
				el={selected}
				onchange={(changes) => selected && update(selected.id, changes)}
				{onpage}
				{onaction}
				onimage={pickImage}
			/>
		</aside>
	</div>
</div>

<style>
	.editor {
		display: flex;
		/* The admin header (3.5rem) and the page's padding above and below. */
		height: calc(100dvh - 3.5rem - 4rem);
		min-height: 34rem;
		flex-direction: column;
		overflow: hidden;
		border: 1px solid var(--color-line);
		border-radius: var(--radius-panel);
		background: var(--color-surface);
		box-shadow: var(--shadow-sm);
	}

	.hidden {
		display: none;
	}

	/* ── Top bar ── */
	.bar {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		height: 3.25rem;
		flex-shrink: 0;
		padding: 0 0.6rem;
		border-bottom: 1px solid var(--color-line);
	}

	.name {
		min-width: 6rem;
		max-width: 22rem;
		flex: 0 1 18rem;
		height: 2rem;
		padding: 0 0.5rem;
		border: 1px solid transparent;
		border-radius: var(--radius-lg);
		background: transparent;
		font-size: 14.5px;
		font-weight: 600;
		color: var(--color-ink);
	}

	.name:hover {
		border-color: var(--color-line);
	}

	.name:focus {
		border-color: var(--color-brand);
		outline: none;
		background: var(--color-surface);
	}

	.save {
		display: inline-flex;
		align-items: center;
		gap: 0.3rem;
		font-size: 12px;
		white-space: nowrap;
		color: var(--color-ink-mute);
	}

	.save .material-symbols-outlined {
		font-size: 16px;
	}

	.save-saved .material-symbols-outlined {
		color: var(--color-brand);
	}

	.save-error {
		color: var(--color-danger-strong);
	}

	.retry {
		margin-left: 0.25rem;
		font-weight: 600;
		text-decoration: underline;
	}

	.bar-mid {
		display: flex;
		align-items: center;
		gap: 0.15rem;
		margin: 0 auto;
	}

	.sep {
		width: 1px;
		height: 1.25rem;
		margin: 0 0.35rem;
		background: var(--color-line);
	}

	.zoom {
		min-width: 3.25rem;
		height: 2rem;
		border-radius: var(--radius-lg);
		font-size: 12.5px;
		font-variant-numeric: tabular-nums;
		color: var(--color-ink-soft);
	}

	.zoom:hover {
		background: var(--color-surface-2);
	}

	.toggle {
		display: inline-flex;
		align-items: center;
		gap: 0.4rem;
		padding: 0 0.4rem;
		font-size: 12.5px;
		color: var(--color-ink-soft);
		white-space: nowrap;
		cursor: pointer;
	}

	.toggle input {
		accent-color: var(--color-brand);
		border-radius: 4px;
	}

	.issue {
		display: inline-flex;
		align-items: center;
		gap: 0.35rem;
		height: 2.1rem;
		padding: 0 0.85rem;
		border-radius: var(--radius-lg);
		background: var(--color-brand);
		font-size: 13px;
		font-weight: 550;
		color: #fff;
		transition: background-color var(--duration-fast);
	}

	.issue:hover {
		background: var(--color-brand-mid);
	}

	.issue .material-symbols-outlined {
		font-size: 17px;
	}

	.ib {
		display: grid;
		place-items: center;
		width: 2rem;
		height: 2rem;
		flex-shrink: 0;
		border-radius: var(--radius-lg);
		color: var(--color-ink-mute);
		transition:
			background-color var(--duration-fast),
			color var(--duration-fast);
	}

	.ib:hover:not(:disabled) {
		background: var(--color-surface-2);
		color: var(--color-ink);
	}

	.ib:disabled {
		opacity: 0.35;
	}

	.ib .material-symbols-outlined {
		font-size: 19px;
	}

	.spinner {
		width: 12px;
		height: 12px;
		border: 2px solid currentColor;
		border-right-color: transparent;
		border-radius: 50%;
		animation: spin 0.65s linear infinite;
	}

	@keyframes spin {
		to {
			rotate: 360deg;
		}
	}

	/* ── Body ── */
	.body {
		display: grid;
		flex: 1;
		min-height: 0;
		grid-template-columns: 15rem minmax(0, 1fr) 17.5rem;
	}

	.left,
	.right {
		min-height: 0;
		overflow-y: auto;
		background: var(--color-surface);
	}

	.left {
		border-right: 1px solid var(--color-line);
	}

	.right {
		border-left: 1px solid var(--color-line);
	}

	.left section {
		padding: 0.9rem 0.85rem;
		border-bottom: 1px solid var(--color-line);
	}

	.label {
		display: block;
		margin-bottom: 0.5rem;
		font-size: 12px;
		font-weight: 600;
		color: var(--color-ink-soft);
	}

	.hint {
		margin: -0.25rem 0 0.5rem;
		font-size: 11.5px;
		line-height: 1.4;
		color: var(--color-ink-mute);
	}

	.tiles {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 0.35rem;
	}

	.tile {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 0.2rem;
		padding: 0.55rem 0.25rem;
		border: 1px solid var(--color-line);
		border-radius: var(--radius-lg);
		font-size: 11.5px;
		font-weight: 500;
		color: var(--color-ink-soft);
		transition:
			border-color var(--duration-fast),
			background-color var(--duration-fast),
			color var(--duration-fast);
	}

	.tile:hover {
		border-color: var(--color-line-2);
		background: var(--color-surface-2);
		color: var(--color-ink);
	}

	.tile .material-symbols-outlined {
		font-size: 20px;
	}

	.field-list {
		display: flex;
		flex-direction: column;
		gap: 0.1rem;
	}

	.field {
		display: flex;
		align-items: center;
		gap: 0.45rem;
		height: 1.85rem;
		padding: 0 0.45rem;
		border-radius: 6px;
		font-size: 12.5px;
		color: var(--color-ink-soft);
		text-align: left;
		transition: background-color var(--duration-fast);
	}

	.field:hover {
		background: var(--color-brand-soft);
		color: var(--color-brand-ink);
	}

	.field .material-symbols-outlined {
		font-size: 15px;
		color: var(--color-brand-strong);
	}

	.layers ol {
		display: flex;
		flex-direction: column;
		gap: 0.1rem;
	}

	.layer {
		display: flex;
		width: 100%;
		align-items: center;
		gap: 0.45rem;
		height: 1.9rem;
		padding: 0 0.45rem;
		border-radius: 6px;
		font-size: 12.5px;
		color: var(--color-ink-soft);
		text-align: left;
	}

	.layer:hover {
		background: var(--color-surface-2);
	}

	.layer.is-on {
		background: var(--color-brand-soft);
		color: var(--color-brand-ink);
	}

	.layer.is-hidden {
		opacity: 0.55;
	}

	.layer .material-symbols-outlined {
		font-size: 16px;
	}

	.layer .tiny {
		font-size: 13px;
	}

	.layer-name {
		min-width: 0;
		flex: 1;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	/* ── Canvas ── */
	.viewport {
		position: relative;
		min-width: 0;
		min-height: 0;
		overflow: auto;
		background:
			radial-gradient(circle, var(--color-line) 1px, transparent 1px) 0 0 / 18px 18px,
			var(--color-surface-2);
	}

	.scroller {
		display: grid;
		min-width: 100%;
		min-height: 100%;
		width: max-content;
		place-items: center;
		padding: 48px;
	}

	.stage {
		position: relative;
		flex-shrink: 0;
		box-shadow:
			0 0 0 1px rgb(0 0 0 / 0.04),
			var(--shadow-xl);
	}

	.page {
		position: absolute;
		top: 0;
		left: 0;
		overflow: hidden;
		transform-origin: 0 0;
		background-size: cover;
		background-position: center;
	}

	.overlay {
		position: absolute;
		inset: 0;
	}

	.hit {
		position: absolute;
		box-sizing: border-box;
		transform-origin: center;
		cursor: move;
	}

	.hit:hover:not(.is-selected) {
		outline: 1px solid color-mix(in oklab, var(--color-brand) 60%, transparent);
	}

	.hit.is-locked {
		cursor: default;
	}

	.hit.is-hollow {
		pointer-events: none;
	}

	.edge {
		position: absolute;
		pointer-events: auto;
	}

	.edge-top,
	.edge-bottom {
		left: -4px;
		right: -4px;
		height: 10px;
	}

	.edge-left,
	.edge-right {
		top: -4px;
		bottom: -4px;
		width: 10px;
	}

	.edge-top {
		top: -5px;
	}

	.edge-bottom {
		bottom: -5px;
	}

	.edge-left {
		left: -5px;
	}

	.edge-right {
		right: -5px;
	}

	.frame {
		position: absolute;
		box-sizing: border-box;
		transform-origin: center;
		outline: 1.5px solid var(--color-brand);
		pointer-events: none;
	}

	.handle {
		position: absolute;
		width: 10px;
		height: 10px;
		margin: -5px 0 0 -5px;
		border: 1.5px solid var(--color-brand);
		border-radius: 3px;
		background: #fff;
		pointer-events: auto;
		touch-action: none;
	}

	.rotate-stem {
		position: absolute;
		top: -22px;
		left: 50%;
		width: 1.5px;
		height: 22px;
		margin-left: -0.75px;
		background: var(--color-brand);
	}

	.rotate {
		position: absolute;
		top: -44px;
		left: 50%;
		display: grid;
		place-items: center;
		width: 22px;
		height: 22px;
		margin-left: -11px;
		border: 1.5px solid var(--color-brand);
		border-radius: 9999px;
		background: #fff;
		color: var(--color-brand);
		cursor: grab;
		pointer-events: auto;
		touch-action: none;
	}

	.rotate .material-symbols-outlined {
		font-size: 14px;
	}

	.guide {
		position: absolute;
		pointer-events: none;
		background: #e5487a;
	}

	.gx {
		top: -10000px;
		bottom: -10000px;
		width: 1px;
	}

	.gy {
		left: -10000px;
		right: -10000px;
		height: 1px;
	}

	.overlay {
		overflow: visible;
	}

	.inline-edit {
		width: 100%;
		height: 100%;
		min-height: 1.5em;
		padding: 0;
		border: 0;
		outline: 1.5px dashed var(--color-brand);
		background: rgb(255 255 255 / 0.6);
		resize: none;
		overflow: hidden;
	}

	@media (max-width: 1100px) {
		.body {
			grid-template-columns: 12.5rem minmax(0, 1fr) 15rem;
		}

		.toggle {
			display: none;
		}
	}
</style>
