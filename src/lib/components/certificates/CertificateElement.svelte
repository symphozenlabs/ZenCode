<script>
	import QRCode from 'qrcode';
	import { fillFields } from '$lib/certificates/design.js';

	/**
	 * One element of a certificate, placed in page pixels. Shared by the editor,
	 * thumbnails, the print sheet and the verify page, so a certificate prints
	 * exactly as it was designed.
	 *
	 * `values` fills merge fields; without it, placeholders show as written.
	 * `qrText` is what a QR element encodes (the verify link).
	 */
	let { el, values = null, qrText = '', editing = false } = $props();

	const shown = $derived(
		el.type === 'text' ? (values ? fillFields(el.text, values) : el.text) : ''
	);

	/** The QR as SVG rects, drawn synchronously so it prints and renders on the server. */
	const qr = $derived.by(() => {
		if (el.type !== 'qr') return null;
		try {
			const code = QRCode.create(qrText || 'https://zencode.app/verify', {
				errorCorrectionLevel: 'M'
			});
			const size = code.modules.size;
			const cells = [];
			for (let y = 0; y < size; y++) {
				for (let x = 0; x < size; x++) {
					if (code.modules.data[y * size + x]) cells.push(`M${x} ${y}h1v1h-1z`);
				}
			}
			return { size, path: cells.join('') };
		} catch {
			return null;
		}
	});

	const box = $derived(
		`left:${el.x}px;top:${el.y}px;width:${el.width}px;height:${el.height}px;` +
			`transform:rotate(${el.rotation || 0}deg);opacity:${el.hidden && !editing ? 0 : (el.opacity ?? 1)};`
	);
</script>

{#if !el.hidden || editing}
	<div class="ce ce-{el.type}" class:is-hidden={el.hidden} style={box}>
		{#if el.type === 'text'}
			<div
				class="ce-text"
				style:font-family="'{el.fontFamily}', Geist, serif"
				style:font-size="{el.fontSize}px"
				style:font-weight={el.fontWeight}
				style:font-style={el.italic ? 'italic' : 'normal'}
				style:text-decoration={el.underline ? 'underline' : 'none'}
				style:text-transform={el.uppercase ? 'uppercase' : 'none'}
				style:color={el.color}
				style:text-align={el.align}
				style:justify-content={el.align === 'left'
					? 'flex-start'
					: el.align === 'right'
						? 'flex-end'
						: 'center'}
				style:letter-spacing="{el.letterSpacing}px"
				style:line-height={el.lineHeight}
			>
				<span>{shown}</span>
			</div>
		{:else if el.type === 'image'}
			{#if el.src}
				<img
					src={el.src}
					alt=""
					draggable="false"
					style:object-fit={el.fit}
					style:border-radius="{el.radius}px"
				/>
			{/if}
		{:else if el.type === 'rect' || el.type === 'ellipse'}
			<div
				class="ce-shape"
				style:background={el.fill}
				style:border="{el.strokeWidth}px solid {el.stroke}"
				style:border-radius={el.type === 'ellipse' ? '50%' : `${el.radius}px`}
			></div>
		{:else if el.type === 'line'}
			<div class="ce-shape" style:background={el.fill}></div>
		{:else if el.type === 'qr' && qr}
			<svg
				viewBox="-2 -2 {qr.size + 4} {qr.size + 4}"
				preserveAspectRatio="xMidYMid meet"
				shape-rendering="crispEdges"
			>
				<rect x="-2" y="-2" width={qr.size + 4} height={qr.size + 4} fill={el.background} />
				<path d={qr.path} fill={el.color} />
			</svg>
		{/if}
	</div>
{/if}

<style>
	.ce {
		position: absolute;
		box-sizing: border-box;
		transform-origin: center;
	}

	.ce.is-hidden {
		opacity: 0.25 !important;
	}

	.ce-text {
		display: flex;
		width: 100%;
		height: 100%;
		align-items: center;
		white-space: pre-wrap;
		overflow-wrap: break-word;
	}

	.ce-text span {
		width: 100%;
	}

	.ce-shape {
		width: 100%;
		height: 100%;
		box-sizing: border-box;
	}

	img,
	svg {
		display: block;
		width: 100%;
		height: 100%;
		user-select: none;
	}
</style>
