import QRCode from 'qrcode';
import { FONTS_HREF, fillFields } from './design.js';
import { htmlLayerImage, layerBox } from './htmlCert.js';

/**
 * Draws a certificate onto a canvas, the way CertificatePage lays it out in
 * HTML, so it can be sent as a PDF attachment. Browser only.
 *
 * Text follows the same rules as the HTML renderer: wrapped to the box
 * (keeping line breaks, breaking over-long words), centred vertically, and
 * aligned left, centre or right.
 */

/** @param {string} src */
function loadImage(src) {
	return new Promise((resolve, reject) => {
		const img = new Image();
		img.onload = () => resolve(img);
		img.onerror = () => reject(new Error('Could not load an image on the certificate.'));
		img.src = src;
	});
}

const fontOf = (el) =>
	`${el.italic ? 'italic ' : ''}${el.fontWeight} ${el.fontSize}px "${el.fontFamily}", Geist, serif`;

/**
 * The certificate typefaces come from a Google Fonts stylesheet. Until it has
 * loaded, the browser knows no faces to load, and the canvas would silently
 * draw in a fallback font.
 */
async function fontStylesheet() {
	let link = [...document.querySelectorAll('link[rel="stylesheet"]')].find((l) => l.getAttribute('href') === FONTS_HREF);
	if (!link) {
		link = Object.assign(document.createElement('link'), { rel: 'stylesheet', href: FONTS_HREF });
		document.head.append(link);
	}
	if (link.sheet) return;
	await new Promise((resolve) => {
		link.addEventListener('load', resolve, { once: true });
		link.addEventListener('error', resolve, { once: true });
		setTimeout(resolve, 8000);
	});
}

/** Makes sure every typeface the design uses is loaded before drawing. */
async function loadFonts(design, values) {
	if (typeof document === 'undefined' || !document.fonts) return;
	await fontStylesheet();
	const loads = design.elements
		.filter((el) => el.type === 'text' && !el.hidden)
		.map((el) => document.fonts.load(fontOf(el), fillFields(el.text, values) || 'A').catch(() => null));
	await Promise.all(loads);
}

/** Splits text into lines that fit `width`, like `white-space: pre-wrap; overflow-wrap: break-word`. */
function wrap(ctx, text, width) {
	const lines = [];
	for (const paragraph of text.split('\n')) {
		let line = '';
		for (const part of paragraph.split(/(\s+)/)) {
			if (!part) continue;
			if (!part.trim()) {
				if (line) line += part;
				continue;
			}
			if (ctx.measureText(line + part).width <= width) {
				line += part;
				continue;
			}
			if (line.trim()) lines.push(line.trimEnd());
			line = '';
			// A word wider than the box breaks between characters.
			for (const ch of part) {
				if (line && ctx.measureText(line + ch).width > width) {
					lines.push(line);
					line = ch;
				} else line += ch;
			}
		}
		lines.push(line.trimEnd());
	}
	return lines;
}

function roundedRect(ctx, x, y, w, h, r) {
	const radius = Math.max(0, Math.min(r, w / 2, h / 2));
	ctx.beginPath();
	ctx.roundRect ? ctx.roundRect(x, y, w, h, radius) : ctx.rect(x, y, w, h);
}

/** Draws `img` into the box like CSS object-fit (contain | cover), centred. */
function drawFitted(ctx, img, x, y, w, h, fit) {
	const iw = img.naturalWidth || img.width;
	const ih = img.naturalHeight || img.height;
	const scale = fit === 'cover' ? Math.max(w / iw, h / ih) : Math.min(w / iw, h / ih);
	const dw = iw * scale;
	const dh = ih * scale;
	ctx.drawImage(img, x + (w - dw) / 2, y + (h - dh) / 2, dw, dh);
}

function drawText(ctx, el, values) {
	let text = values ? fillFields(el.text, values) : el.text;
	if (el.uppercase) text = text.toUpperCase();
	ctx.font = fontOf(el);
	if ('letterSpacing' in ctx) ctx.letterSpacing = `${el.letterSpacing || 0}px`;
	ctx.fillStyle = el.color;
	ctx.textBaseline = 'middle';
	const lines = wrap(ctx, text, el.width);
	const lh = el.fontSize * el.lineHeight;
	const top = (el.height - lines.length * lh) / 2;
	for (let i = 0; i < lines.length; i++) {
		const w = ctx.measureText(lines[i]).width;
		const x = el.align === 'left' ? 0 : el.align === 'right' ? el.width - w : (el.width - w) / 2;
		const y = top + i * lh + lh / 2;
		ctx.fillText(lines[i], x, y);
		if (el.underline && lines[i]) {
			ctx.fillRect(x, y + el.fontSize * 0.42, w, Math.max(1, el.fontSize / 16));
		}
	}
	if ('letterSpacing' in ctx) ctx.letterSpacing = '0px';
}

function drawQr(ctx, el, qrText) {
	const code = QRCode.create(qrText || 'https://zencode.app/verify', { errorCorrectionLevel: 'M' });
	const size = code.modules.size;
	// Same as the SVG: a two-module quiet zone, fitted and centred in the box.
	const cell = Math.min(el.width, el.height) / (size + 4);
	const ox = (el.width - cell * (size + 4)) / 2;
	const oy = (el.height - cell * (size + 4)) / 2;
	ctx.fillStyle = el.background;
	ctx.fillRect(ox, oy, cell * (size + 4), cell * (size + 4));
	ctx.fillStyle = el.color;
	for (let y = 0; y < size; y++) {
		for (let x = 0; x < size; x++) {
			if (code.modules.data[y * size + x]) {
				// A hair of overlap so neighbouring modules don't show seams.
				ctx.fillRect(ox + (x + 2) * cell, oy + (y + 2) * cell, cell + 0.3, cell + 0.3);
			}
		}
	}
}

/**
 * The certificate on a canvas, `scale` × its page size.
 *
 * @param {any} design
 * @param {Record<string, string> | null} values
 * @param {string} qrText
 * @param {number} [scale]
 */
export async function drawCertificate(design, values, qrText, scale = 2) {
	const { page } = design;
	await loadFonts(design, values);
	const sources = [page.backgroundImage, ...design.elements.map((el) => (el.type === 'image' && !el.hidden ? el.src : ''))].filter(Boolean);
	const images = new Map(await Promise.all([...new Set(sources)].map(async (src) => [src, await loadImage(src)])));

	const canvas = document.createElement('canvas');
	canvas.width = Math.round(page.width * scale);
	canvas.height = Math.round(page.height * scale);
	const ctx = canvas.getContext('2d');
	ctx.scale(scale, scale);

	ctx.fillStyle = page.background || '#ffffff';
	ctx.fillRect(0, 0, page.width, page.height);
	if (page.backgroundImage) drawFitted(ctx, images.get(page.backgroundImage), 0, 0, page.width, page.height, 'cover');
	if (page.html) {
		// An uploaded HTML certificate, laid out as uploaded and cropped to its box.
		const layer = page.html;
		const box = layerBox(page, layer);
		const img = await htmlLayerImage(layer, values, qrText);
		ctx.save();
		ctx.beginPath();
		ctx.rect(box.left, box.top, box.w, box.h);
		ctx.clip();
		ctx.drawImage(img, box.left - layer.crop.x * box.k, box.top - layer.crop.y * box.k, layer.viewW * box.k, layer.viewH * box.k);
		ctx.restore();
	}

	for (const el of design.elements) {
		if (el.hidden) continue;
		ctx.save();
		ctx.globalAlpha = el.opacity ?? 1;
		ctx.translate(el.x + el.width / 2, el.y + el.height / 2);
		ctx.rotate(((el.rotation || 0) * Math.PI) / 180);
		ctx.translate(-el.width / 2, -el.height / 2);

		if (el.type === 'text') {
			drawText(ctx, el, values);
		} else if (el.type === 'image' && el.src) {
			roundedRect(ctx, 0, 0, el.width, el.height, el.radius || 0);
			ctx.clip();
			drawFitted(ctx, images.get(el.src), 0, 0, el.width, el.height, el.fit);
		} else if (el.type === 'rect' || el.type === 'ellipse') {
			// CSS border-box: the border sits inside the box, over the fill.
			const sw = el.strokeWidth || 0;
			const path = (inset) => {
				if (el.type === 'ellipse') {
					ctx.beginPath();
					ctx.ellipse(el.width / 2, el.height / 2, Math.max(0, el.width / 2 - inset), Math.max(0, el.height / 2 - inset), 0, 0, Math.PI * 2);
				} else {
					roundedRect(ctx, inset, inset, el.width - inset * 2, el.height - inset * 2, (el.radius || 0) - inset);
				}
			};
			if (el.fill && el.fill !== 'transparent') {
				path(0);
				ctx.fillStyle = el.fill;
				ctx.fill();
			}
			if (sw > 0) {
				path(sw / 2);
				ctx.lineWidth = sw;
				ctx.strokeStyle = el.stroke;
				ctx.stroke();
			}
		} else if (el.type === 'line') {
			ctx.fillStyle = el.fill;
			ctx.fillRect(0, 0, el.width, el.height);
		} else if (el.type === 'qr') {
			drawQr(ctx, el, qrText);
		}
		ctx.restore();
	}
	return canvas;
}

const ascii = (s) => new TextEncoder().encode(s);

/** A one-page PDF holding a JPEG at the page's size (96 px = 72 pt). */
function jpegPdf(jpeg, pixelWidth, pixelHeight, pageWidth, pageHeight) {
	const w = (pageWidth * 0.75).toFixed(2);
	const h = (pageHeight * 0.75).toFixed(2);
	const content = `q ${w} 0 0 ${h} 0 0 cm /Im0 Do Q`;
	const parts = [];
	const offsets = [];
	let length = 0;
	const push = (chunk) => {
		const bytes = typeof chunk === 'string' ? ascii(chunk) : chunk;
		parts.push(bytes);
		length += bytes.length;
	};
	const object = (n, body) => {
		offsets[n] = length;
		push(`${n} 0 obj\n`);
		for (const piece of body) push(piece);
		push('\nendobj\n');
	};

	push('%PDF-1.4\n%\xE2\xE3\xCF\xD3\n');
	object(1, ['<< /Type /Catalog /Pages 2 0 R >>']);
	object(2, ['<< /Type /Pages /Kids [3 0 R] /Count 1 >>']);
	object(3, [`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${w} ${h}] /Resources << /XObject << /Im0 4 0 R >> >> /Contents 5 0 R >>`]);
	object(4, [
		`<< /Type /XObject /Subtype /Image /Width ${pixelWidth} /Height ${pixelHeight} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${jpeg.length} >>\nstream\n`,
		jpeg,
		'\nendstream'
	]);
	object(5, [`<< /Length ${content.length} >>\nstream\n${content}\nendstream`]);

	const xref = length;
	push(`xref\n0 6\n0000000000 65535 f \n`);
	for (let n = 1; n <= 5; n++) push(`${String(offsets[n]).padStart(10, '0')} 00000 n \n`);
	push(`trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`);

	const out = new Uint8Array(length);
	let at = 0;
	for (const p of parts) {
		out.set(p, at);
		at += p.length;
	}
	return out;
}

const toJpeg = (canvas, quality) =>
	new Promise((resolve, reject) =>
		canvas.toBlob(
			(blob) => (blob ? blob.arrayBuffer().then((b) => resolve(new Uint8Array(b)), reject) : reject(new Error('Could not draw the certificate.'))),
			'image/jpeg',
			quality
		)
	);

/**
 * The certificate as a PDF, kept under `maxBytes` (servers cap request
 * bodies) by stepping the image quality down, then the resolution.
 *
 * @returns {Promise<Uint8Array>}
 */
export async function certificatePdf(design, values, qrText, maxBytes = 480_000) {
	for (const scale of [2, 1.5, 1.2]) {
		const canvas = await drawCertificate(design, values, qrText, scale);
		for (const quality of [0.9, 0.8, 0.7, 0.6]) {
			const jpeg = await toJpeg(canvas, quality);
			if (jpeg.length < maxBytes - 2000 || (scale === 1.2 && quality === 0.6)) {
				return jpegPdf(jpeg, canvas.width, canvas.height, design.page.width, design.page.height);
			}
		}
	}
	throw new Error('Could not make the certificate small enough to email.');
}
