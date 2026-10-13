import QRCode from 'qrcode';
import { QR_FIELD } from './design.js';

/**
 * Uploaded HTML certificates: filling one in and drawing it.
 *
 * The HTML is the page layer of a design (`design.page.html`). It is always
 * self-contained — its fonts and images were embedded when it was uploaded —
 * so it looks the same in the editor, the print sheet, the verify page and
 * the emailed PDF. It is shown in a sandboxed frame or as an SVG image, so no
 * script in it can ever run.
 */

const FIELD = /\{\{\s*([a-z_]+)\s*\}\}/g;

const escapeHtml = (value) =>
	String(value ?? '')
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;')
		.replace(/"/g, '&quot;')
		.replace(/'/g, '&#39;');

/** The verification QR as inline SVG that fills whatever box `{{qr_code}}` sits in. */
export function qrSvg(text) {
	const code = QRCode.create(text || 'https://zencode.app/verify', { errorCorrectionLevel: 'M' });
	const size = code.modules.size;
	let d = '';
	for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) if (code.modules.data[y * size + x]) d += `M${x} ${y}h1v1h-1z`;
	return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="-2 -2 ${size + 4} ${size + 4}" shape-rendering="crispEdges" style="display:block;width:100%;height:100%"><rect x="-2" y="-2" width="${size + 4}" height="${size + 4}" fill="#fff"/><path d="${d}" fill="#000"/></svg>`;
}

/**
 * The HTML with merge fields filled in. Values come from registrations, so
 * they are escaped: a name can never add markup. Without `values` the
 * placeholders stay as written (the editor's "show fields" view).
 */
export function filledHtml(layer, values, qrText) {
	return layer.html.replace(FIELD, (whole, key) => {
		if (key === QR_FIELD) return qrSvg(qrText);
		if (!values) return whole;
		return values[key] !== undefined && values[key] !== null ? escapeHtml(values[key]) : whole;
	});
}

/**
 * Where the HTML's certificate box lands on the page: scaled to fit, centred.
 * `k` is the scale; `left`/`top`/`w`/`h` the visible box in page pixels.
 */
export function layerBox(page, layer) {
	const { crop } = layer;
	const k = Math.min(page.width / crop.w, page.height / crop.h);
	const w = crop.w * k;
	const h = crop.h * k;
	return { k, w, h, left: (page.width - w) / 2, top: (page.height - h) / 2 };
}

/**
 * The filled HTML as an image, for drawing onto the PDF canvas (an SVG with
 * the document in a foreignObject). Browser only.
 *
 * @returns {Promise<HTMLImageElement>}
 */
export async function htmlLayerImage(layer, values, qrText) {
	const doc = new DOMParser().parseFromString(filledHtml(layer, values, qrText), 'text/html');
	doc.querySelectorAll('script').forEach((n) => n.remove());
	const xhtml = new XMLSerializer().serializeToString(doc.documentElement);
	const svg =
		`<svg xmlns="http://www.w3.org/2000/svg" width="${layer.viewW}" height="${layer.viewH}">` +
		`<foreignObject x="0" y="0" width="${layer.viewW}" height="${layer.viewH}">${xhtml}</foreignObject></svg>`;
	const img = new Image();
	img.width = layer.viewW;
	img.height = layer.viewH;
	await new Promise((resolve, reject) => {
		img.onload = resolve;
		img.onerror = () => reject(new Error('Could not draw the HTML certificate.'));
		img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
	});
	// Give embedded fonts a moment to apply inside the image.
	if (img.decode) await img.decode().catch(() => {});
	return img;
}
