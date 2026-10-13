<script>
	import { FONTS, MERGE_FIELDS, PAGE_SIZES } from '$lib/certificates/design.js';

	/**
	 * The right-hand panel of the certificate editor: every property of the
	 * selected element, or of the page when nothing is selected. It never
	 * mutates the design itself; it reports changes through the callbacks.
	 */
	let {
		design,
		el = null,
		onchange, // (changes) => void, for the selected element
		onpage, // (changes) => void, for the page
		onaction, // (name) => void: duplicate, delete, forward, backward, front, back, align-*
		onimage // (target: 'element' | 'background') => void, opens the file picker
	} = $props();

	let textArea = $state();

	const TYPE_NAMES = {
		text: 'Text',
		image: 'Image',
		rect: 'Rectangle',
		ellipse: 'Ellipse',
		line: 'Line',
		qr: 'Verification QR'
	};

	/** `<input type=color>` only takes #rrggbb. */
	function hex(value, fallback = '#000000') {
		const v = String(value ?? '').trim();
		if (/^#[0-9a-f]{6}$/i.test(v)) return v;
		if (/^#[0-9a-f]{3}$/i.test(v)) return `#${[...v.slice(1)].map((c) => c + c).join('')}`;
		return fallback;
	}

	const round = (n) => Math.round(Number(n) * 10) / 10;

	function set(key, value) {
		onchange?.({ [key]: value });
	}

	function numberInput(key, event, { min = -Infinity, max = Infinity } = {}) {
		const n = Number(event.currentTarget.value);
		if (!Number.isFinite(n)) return;
		set(key, Math.min(max, Math.max(min, n)));
	}

	/** Puts a merge field at the caret in the text box. */
	function insertField(key) {
		if (!el) return;
		const token = `{{${key}}}`;
		const area = textArea;
		const text = el.text ?? '';
		const start = area?.selectionStart ?? text.length;
		const end = area?.selectionEnd ?? text.length;
		set('text', text.slice(0, start) + token + text.slice(end));
		requestAnimationFrame(() => {
			area?.focus();
			area?.setSelectionRange(start + token.length, start + token.length);
		});
	}
</script>

<div class="inspector">
	{#if el}
		<div class="head">
			<span class="kind">{TYPE_NAMES[el.type]}</span>
			<div class="head-actions">
				<button
					type="button"
					class="ib"
					title={el.locked ? 'Unlock' : 'Lock position'}
					aria-pressed={el.locked}
					onclick={() => set('locked', !el.locked)}
				>
					<span class="material-symbols-outlined">{el.locked ? 'lock' : 'lock_open'}</span>
				</button>
				<button
					type="button"
					class="ib"
					title={el.hidden ? 'Show' : 'Hide'}
					aria-pressed={el.hidden}
					onclick={() => set('hidden', !el.hidden)}
				>
					<span class="material-symbols-outlined"
						>{el.hidden ? 'visibility_off' : 'visibility'}</span
					>
				</button>
				<button
					type="button"
					class="ib"
					title="Duplicate (Ctrl+D)"
					onclick={() => onaction('duplicate')}
				>
					<span class="material-symbols-outlined">content_copy</span>
				</button>
				<button
					type="button"
					class="ib danger"
					title="Delete (Del)"
					onclick={() => onaction('delete')}
				>
					<span class="material-symbols-outlined">delete</span>
				</button>
			</div>
		</div>

		<!-- ── Type-specific ── -->
		{#if el.type === 'text'}
			<section>
				<label class="label" for="ins-text">Text</label>
				<textarea
					id="ins-text"
					bind:this={textArea}
					rows="3"
					value={el.text}
					oninput={(e) => set('text', e.currentTarget.value)}></textarea>
				<div class="fields">
					<span class="hint">Insert a field, filled in for each participant:</span>
					<div class="chips">
						{#each MERGE_FIELDS as f (f.key)}
							<button type="button" class="chip" onclick={() => insertField(f.key)}
								>{f.label}</button
							>
						{/each}
					</div>
				</div>
			</section>

			<section>
				<span class="label">Font</span>
				<select
					value={el.fontFamily}
					onchange={(e) => set('fontFamily', e.currentTarget.value)}
					style:font-family="'{el.fontFamily}'"
				>
					{#each FONTS as f (f.family)}
						<option value={f.family} style:font-family="'{f.family}'">{f.label} · {f.kind}</option>
					{/each}
				</select>
				<div class="row">
					<label class="mini">
						<span>Size</span>
						<input
							type="number"
							min="4"
							max="400"
							value={el.fontSize}
							onchange={(e) => numberInput('fontSize', e, { min: 4, max: 400 })}
						/>
					</label>
					<label class="mini">
						<span>Weight</span>
						<select
							value={String(el.fontWeight)}
							onchange={(e) => set('fontWeight', Number(e.currentTarget.value))}
						>
							<option value="300">Light</option>
							<option value="400">Regular</option>
							<option value="500">Medium</option>
							<option value="600">Semibold</option>
							<option value="700">Bold</option>
						</select>
					</label>
					<label class="mini color">
						<span>Colour</span>
						<input
							type="color"
							value={hex(el.color)}
							oninput={(e) => set('color', e.currentTarget.value)}
						/>
					</label>
				</div>
				<div class="row">
					<div class="seg" role="group" aria-label="Alignment">
						{#each [['left', 'format_align_left'], ['center', 'format_align_center'], ['right', 'format_align_right']] as [value, icon] (value)}
							<button
								type="button"
								class:on={el.align === value}
								aria-pressed={el.align === value}
								title="Align {value}"
								onclick={() => set('align', value)}
							>
								<span class="material-symbols-outlined">{icon}</span>
							</button>
						{/each}
					</div>
					<div class="seg" role="group" aria-label="Style">
						<button
							type="button"
							class:on={el.italic}
							aria-pressed={el.italic}
							title="Italic"
							onclick={() => set('italic', !el.italic)}
						>
							<span class="material-symbols-outlined">format_italic</span>
						</button>
						<button
							type="button"
							class:on={el.underline}
							aria-pressed={el.underline}
							title="Underline"
							onclick={() => set('underline', !el.underline)}
						>
							<span class="material-symbols-outlined">format_underlined</span>
						</button>
						<button
							type="button"
							class:on={el.uppercase}
							aria-pressed={el.uppercase}
							title="Capitals"
							onclick={() => set('uppercase', !el.uppercase)}
						>
							<span class="material-symbols-outlined">match_case</span>
						</button>
					</div>
				</div>
				<div class="row">
					<label class="mini">
						<span>Letter spacing</span>
						<input
							type="number"
							step="0.5"
							min="-10"
							max="40"
							value={el.letterSpacing}
							onchange={(e) => numberInput('letterSpacing', e, { min: -10, max: 40 })}
						/>
					</label>
					<label class="mini">
						<span>Line height</span>
						<input
							type="number"
							step="0.1"
							min="0.6"
							max="4"
							value={el.lineHeight}
							onchange={(e) => numberInput('lineHeight', e, { min: 0.6, max: 4 })}
						/>
					</label>
				</div>
			</section>
		{:else if el.type === 'image'}
			<section>
				<button type="button" class="wide" onclick={() => onimage('element')}>
					<span class="material-symbols-outlined">image</span> Replace image
				</button>
				<div class="row">
					<div class="seg" role="group" aria-label="Fit">
						<button
							type="button"
							class:on={el.fit === 'contain'}
							onclick={() => set('fit', 'contain')}>Fit</button
						>
						<button type="button" class:on={el.fit === 'cover'} onclick={() => set('fit', 'cover')}
							>Fill</button
						>
					</div>
					<label class="mini">
						<span>Corner radius</span>
						<input
							type="number"
							min="0"
							max="1000"
							value={el.radius}
							onchange={(e) => numberInput('radius', e, { min: 0, max: 1000 })}
						/>
					</label>
				</div>
			</section>
		{:else if el.type === 'rect' || el.type === 'ellipse'}
			<section>
				<div class="row">
					<label class="mini color">
						<span>Fill</span>
						<input
							type="color"
							value={hex(el.fill, '#ffffff')}
							disabled={el.fill === 'transparent'}
							oninput={(e) => set('fill', e.currentTarget.value)}
						/>
					</label>
					<label class="check">
						<input
							type="checkbox"
							checked={el.fill === 'transparent'}
							onchange={(e) => set('fill', e.currentTarget.checked ? 'transparent' : '#e7f2e9')}
						/>
						No fill
					</label>
				</div>
				<div class="row">
					<label class="mini color">
						<span>Border</span>
						<input
							type="color"
							value={hex(el.stroke)}
							oninput={(e) => set('stroke', e.currentTarget.value)}
						/>
					</label>
					<label class="mini">
						<span>Border width</span>
						<input
							type="number"
							min="0"
							max="60"
							value={el.strokeWidth}
							onchange={(e) => numberInput('strokeWidth', e, { min: 0, max: 60 })}
						/>
					</label>
					{#if el.type === 'rect'}
						<label class="mini">
							<span>Radius</span>
							<input
								type="number"
								min="0"
								max="1000"
								value={el.radius}
								onchange={(e) => numberInput('radius', e, { min: 0, max: 1000 })}
							/>
						</label>
					{/if}
				</div>
			</section>
		{:else if el.type === 'line'}
			<section>
				<div class="row">
					<label class="mini color">
						<span>Colour</span>
						<input
							type="color"
							value={hex(el.fill)}
							oninput={(e) => set('fill', e.currentTarget.value)}
						/>
					</label>
					<label class="mini">
						<span>Thickness</span>
						<input
							type="number"
							min="1"
							max="60"
							value={el.height}
							onchange={(e) => numberInput('height', e, { min: 1, max: 60 })}
						/>
					</label>
				</div>
			</section>
		{:else if el.type === 'qr'}
			<section>
				<p class="hint">
					Each certificate gets its own code. Scanning it opens a page that confirms the certificate
					is genuine.
				</p>
				<div class="row">
					<label class="mini color">
						<span>Code</span>
						<input
							type="color"
							value={hex(el.color)}
							oninput={(e) => set('color', e.currentTarget.value)}
						/>
					</label>
					<label class="mini color">
						<span>Background</span>
						<input
							type="color"
							value={hex(el.background, '#ffffff')}
							oninput={(e) => set('background', e.currentTarget.value)}
						/>
					</label>
				</div>
			</section>
		{/if}

		<!-- ── Position ── -->
		<section>
			<span class="label">Position</span>
			<div class="grid4">
				<label class="mini"
					><span>X</span><input
						type="number"
						value={round(el.x)}
						onchange={(e) => numberInput('x', e)}
					/></label
				>
				<label class="mini"
					><span>Y</span><input
						type="number"
						value={round(el.y)}
						onchange={(e) => numberInput('y', e)}
					/></label
				>
				<label class="mini"
					><span>W</span><input
						type="number"
						min="1"
						value={round(el.width)}
						onchange={(e) => numberInput('width', e, { min: 1 })}
					/></label
				>
				<label class="mini"
					><span>H</span><input
						type="number"
						min="1"
						value={round(el.height)}
						onchange={(e) => numberInput('height', e, { min: 1 })}
					/></label
				>
			</div>
			<div class="row">
				<label class="mini">
					<span>Rotation</span>
					<input
						type="number"
						min="-360"
						max="360"
						value={round(el.rotation)}
						onchange={(e) => numberInput('rotation', e, { min: -360, max: 360 })}
					/>
				</label>
				<label class="mini grow">
					<span>Opacity {Math.round((el.opacity ?? 1) * 100)}%</span>
					<input
						type="range"
						min="0"
						max="1"
						step="0.01"
						value={el.opacity ?? 1}
						oninput={(e) => set('opacity', Number(e.currentTarget.value))}
					/>
				</label>
			</div>
			<span class="label sub">Align on page</span>
			<div class="seg full" role="group" aria-label="Align on page">
				{#each [['align-left', 'align_horizontal_left'], ['align-center', 'align_horizontal_center'], ['align-right', 'align_horizontal_right'], ['align-top', 'align_vertical_top'], ['align-middle', 'align_vertical_center'], ['align-bottom', 'align_vertical_bottom']] as [name, icon] (name)}
					<button
						type="button"
						title={name.replace('align-', 'Align ')}
						onclick={() => onaction(name)}
					>
						<span class="material-symbols-outlined">{icon}</span>
					</button>
				{/each}
			</div>
			<span class="label sub">Layer</span>
			<div class="seg full" role="group" aria-label="Layer order">
				<button type="button" title="Bring to front" onclick={() => onaction('front')}
					><span class="material-symbols-outlined">flip_to_front</span></button
				>
				<button type="button" title="Forward (])" onclick={() => onaction('forward')}
					><span class="material-symbols-outlined">arrow_upward</span></button
				>
				<button type="button" title="Backward ([)" onclick={() => onaction('backward')}
					><span class="material-symbols-outlined">arrow_downward</span></button
				>
				<button type="button" title="Send to back" onclick={() => onaction('back')}
					><span class="material-symbols-outlined">flip_to_back</span></button
				>
			</div>
		</section>
	{:else}
		<div class="head">
			<span class="kind">Page</span>
		</div>
		<section>
			<span class="label">Size</span>
			<select value={design.page.size} onchange={(e) => onpage({ size: e.currentTarget.value })}>
				{#each Object.entries(PAGE_SIZES) as [key, s] (key)}
					<option value={key}>{s.label}</option>
				{/each}
			</select>
			<div class="seg full" role="group" aria-label="Orientation">
				<button
					type="button"
					class:on={design.page.orientation === 'landscape'}
					onclick={() => onpage({ orientation: 'landscape' })}
				>
					<span class="material-symbols-outlined">crop_landscape</span> Landscape
				</button>
				<button
					type="button"
					class:on={design.page.orientation === 'portrait'}
					onclick={() => onpage({ orientation: 'portrait' })}
				>
					<span class="material-symbols-outlined">crop_portrait</span> Portrait
				</button>
			</div>
			<p class="hint">
				{design.page.width} × {design.page.height} px at 96 dpi. Elements keep their place when you switch.
			</p>
		</section>
		{#if design.page.html}
			<section>
				<span class="label">HTML certificate</span>
				<p class="hint">
					The uploaded HTML is the page and keeps its own fonts and styles. Fields written into it, like
					<code>{'{{participant_name}}'}</code>, fill in for each participant in that same style;
					<code>{'{{qr_code}}'}</code> places the verification QR. Anything added here sits on top.
				</p>
				<button type="button" class="wide ghost" onclick={() => onpage({ html: null })}>Remove the HTML page</button>
			</section>
		{/if}
		<section>
			<span class="label">Background</span>
			<div class="row">
				<label class="mini color">
					<span>Colour</span>
					<input
						type="color"
						value={hex(design.page.background, '#ffffff')}
						oninput={(e) => onpage({ background: e.currentTarget.value })}
					/>
				</label>
			</div>
			<button type="button" class="wide" onclick={() => onimage('background')}>
				<span class="material-symbols-outlined">wallpaper</span>
				{design.page.backgroundImage ? 'Replace background image' : 'Add background image'}
			</button>
			{#if design.page.backgroundImage}
				<button type="button" class="wide ghost" onclick={() => onpage({ backgroundImage: '' })}>
					Remove background image
				</button>
			{/if}
			<p class="hint">
				A scanned letterhead or a designed border works well as a background. It stretches to fill
				the page.
			</p>
		</section>
		<section>
			<span class="label">Shortcuts</span>
			<dl class="keys">
				<div>
					<dt>Double-click</dt>
					<dd>Edit text</dd>
				</div>
				<div>
					<dt>Arrows</dt>
					<dd>Nudge (Shift ×10)</dd>
				</div>
				<div>
					<dt>Ctrl Z / Ctrl Y</dt>
					<dd>Undo / redo</dd>
				</div>
				<div>
					<dt>Ctrl D</dt>
					<dd>Duplicate</dd>
				</div>
				<div>
					<dt>Shift + drag</dt>
					<dd>Keep proportions, snap rotation</dd>
				</div>
				<div>
					<dt>Alt + drag</dt>
					<dd>Move without snapping</dd>
				</div>
			</dl>
		</section>
	{/if}
</div>

<style>
	.inspector {
		display: flex;
		flex-direction: column;
	}

	.head {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 0.5rem;
		padding: 0.85rem 1rem;
		border-bottom: 1px solid var(--color-line);
	}

	.kind {
		font-size: 13.5px;
		font-weight: 600;
		color: var(--color-ink);
	}

	.head-actions {
		display: flex;
		gap: 0.1rem;
	}

	section {
		display: flex;
		flex-direction: column;
		gap: 0.6rem;
		padding: 0.9rem 1rem;
		border-bottom: 1px solid var(--color-line);
	}

	.label {
		font-size: 12px;
		font-weight: 600;
		color: var(--color-ink-soft);
	}

	.label.sub {
		margin-top: 0.2rem;
		font-weight: 500;
		color: var(--color-ink-mute);
	}

	.hint {
		font-size: 12px;
		line-height: 1.45;
		color: var(--color-ink-mute);
	}

	textarea,
	select,
	input[type='number'] {
		width: 100%;
		border: 1px solid var(--color-line-2);
		border-radius: var(--radius-lg);
		background: var(--color-surface);
		font-size: 13px;
		color: var(--color-ink);
	}

	textarea {
		padding: 0.5rem 0.6rem;
		line-height: 1.45;
		resize: vertical;
	}

	select,
	input[type='number'] {
		height: 2rem;
		padding: 0 0.5rem;
	}

	select {
		padding-right: 1.8rem;
	}

	textarea:focus,
	select:focus,
	input[type='number']:focus {
		border-color: var(--color-brand);
		outline: none;
		box-shadow: 0 0 0 3px color-mix(in oklab, var(--color-brand) 16%, transparent);
	}

	.fields {
		display: flex;
		flex-direction: column;
		gap: 0.4rem;
	}

	.chips {
		display: flex;
		flex-wrap: wrap;
		gap: 0.3rem;
	}

	.chip {
		padding: 0.2rem 0.5rem;
		border-radius: 9999px;
		background: var(--color-brand-soft);
		font-size: 11.5px;
		font-weight: 500;
		color: var(--color-brand-ink);
		transition: background-color var(--duration-fast);
	}

	.chip:hover {
		background: color-mix(in oklab, var(--color-brand) 22%, var(--color-surface));
	}

	.row {
		display: flex;
		flex-wrap: wrap;
		align-items: flex-end;
		gap: 0.5rem;
	}

	.grid4 {
		display: grid;
		grid-template-columns: repeat(4, minmax(0, 1fr));
		gap: 0.4rem;
	}

	.mini {
		display: flex;
		min-width: 0;
		flex: 1 1 4.5rem;
		flex-direction: column;
		gap: 0.2rem;
	}

	.mini.grow {
		flex: 2 1 8rem;
	}

	.mini > span {
		font-size: 11px;
		color: var(--color-ink-mute);
	}

	.mini.color {
		flex: 0 0 auto;
	}

	input[type='color'] {
		width: 2.75rem;
		height: 2rem;
		padding: 2px;
		border: 1px solid var(--color-line-2);
		border-radius: var(--radius-lg);
		background: var(--color-surface);
		cursor: pointer;
	}

	input[type='color']:disabled {
		opacity: 0.35;
		cursor: default;
	}

	input[type='range'] {
		height: 2rem;
		accent-color: var(--color-brand);
	}

	.check {
		display: inline-flex;
		align-items: center;
		gap: 0.4rem;
		height: 2rem;
		font-size: 12.5px;
		color: var(--color-ink-soft);
	}

	.check input {
		accent-color: var(--color-brand);
		border-radius: 4px;
	}

	.seg {
		display: inline-flex;
		padding: 2px;
		border: 1px solid var(--color-line);
		border-radius: var(--radius-lg);
		background: var(--color-surface-2);
	}

	.seg.full {
		display: flex;
	}

	.seg button {
		display: inline-flex;
		flex: 1;
		align-items: center;
		justify-content: center;
		gap: 0.3rem;
		min-width: 2rem;
		height: 1.75rem;
		padding: 0 0.45rem;
		border-radius: 6px;
		font-size: 12.5px;
		color: var(--color-ink-mute);
		transition:
			background-color var(--duration-fast),
			color var(--duration-fast);
	}

	.seg button:hover {
		color: var(--color-ink);
	}

	.seg button.on {
		background: var(--color-surface);
		color: var(--color-ink);
		box-shadow: var(--shadow-sm);
	}

	.seg .material-symbols-outlined {
		font-size: 17px;
	}

	.wide {
		display: flex;
		align-items: center;
		justify-content: center;
		gap: 0.4rem;
		height: 2.1rem;
		border: 1px solid var(--color-line-2);
		border-radius: var(--radius-lg);
		font-size: 13px;
		font-weight: 500;
		color: var(--color-ink);
		transition: background-color var(--duration-fast);
	}

	.wide:hover {
		background: var(--color-surface-2);
	}

	.wide.ghost {
		border-color: transparent;
		color: var(--color-danger-strong);
	}

	.wide .material-symbols-outlined {
		font-size: 18px;
	}

	.ib {
		display: grid;
		place-items: center;
		width: 1.9rem;
		height: 1.9rem;
		border-radius: var(--radius-lg);
		color: var(--color-ink-mute);
		transition:
			background-color var(--duration-fast),
			color var(--duration-fast);
	}

	.ib:hover {
		background: var(--color-surface-2);
		color: var(--color-ink);
	}

	.ib.danger:hover {
		color: var(--color-danger);
	}

	.ib[aria-pressed='true'] {
		color: var(--color-brand-strong);
	}

	.ib .material-symbols-outlined {
		font-size: 17px;
	}

	.keys {
		display: grid;
		gap: 0.35rem;
		font-size: 12px;
	}

	.keys div {
		display: flex;
		justify-content: space-between;
		gap: 0.75rem;
	}

	.keys dt {
		color: var(--color-ink-soft);
		font-weight: 500;
	}

	.keys dd {
		color: var(--color-ink-mute);
		text-align: right;
	}
</style>
