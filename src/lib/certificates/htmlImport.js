import { MAX_DESIGN_BYTES } from './design.js';

/**
 * Turns an uploaded HTML certificate into a self-contained page layer.
 * Browser only.
 *
 * 1. Clean: scripts, frames, event handlers and the like are removed.
 * 2. Embed: stylesheets, fonts and images become inline (data URLs), whether
 *    they came as extra files picked alongside the HTML or from the web
 *    (Google Fonts and other hosts that allow it). Only the Latin subset of a
 *    Google font is kept, to stay small.
 * 3. Measure: the page is laid out in a hidden frame to find the certificate
 *    box inside it (usually the one card on a padded background) and the text
 *    it shows, biggest first, so the organiser can say which text is the
 *    participant's name.
 */

const DROP = 'script,noscript,iframe,frame,frameset,object,embed,applet,base,meta[http-equiv]';
const MAX_IMAGE_SIDE = 1800;

const isHtmlFile = (f) => /\.html?$/i.test(f.name) || f.type === 'text/html';
const baseName = (path) => decodeURIComponent(String(path).split(/[?#]/)[0].split('/').pop() || '').toLowerCase();

const readText = (file) => file.text();
const readDataUrl = (blob) =>
	new Promise((resolve, reject) => {
		const r = new FileReader();
		r.onload = () => resolve(String(r.result));
		r.onerror = () => reject(new Error('Could not read a file.'));
		r.readAsDataURL(blob);
	});

/** Big photos are scaled down; small images and SVGs are kept as they are. */
async function compactImage(blob) {
	if (!blob.type.startsWith('image/') || blob.type === 'image/svg+xml' || blob.size < 250_000) return readDataUrl(blob);
	const url = URL.createObjectURL(blob);
	try {
		const img = await new Promise((resolve, reject) => {
			const el = new Image();
			el.onload = () => resolve(el);
			el.onerror = reject;
			el.src = url;
		});
		const scale = Math.min(1, MAX_IMAGE_SIDE / Math.max(img.naturalWidth, img.naturalHeight));
		const c = document.createElement('canvas');
		c.width = Math.round(img.naturalWidth * scale);
		c.height = Math.round(img.naturalHeight * scale);
		c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
		return blob.type === 'image/png' || blob.type === 'image/webp' ? c.toDataURL('image/png') : c.toDataURL('image/jpeg', 0.85);
	} catch {
		return readDataUrl(blob);
	} finally {
		URL.revokeObjectURL(url);
	}
}

/**
 * Resolves a reference from the HTML: a file picked alongside it (matched by
 * name), or an absolute web address. Returns null when it can't be fetched.
 */
function resolver(assets, warnings) {
	const cache = new Map();
	async function fetchBlob(ref, base) {
		if (!ref || ref.startsWith('data:') || ref.startsWith('#')) return null;
		const local = assets.get(baseName(ref));
		if (local) return local;
		let url;
		try {
			url = new URL(ref, base || undefined).href;
		} catch {
			warnings.add(`“${baseName(ref) || ref}” wasn’t uploaded with the HTML, so it is missing.`);
			return null;
		}
		if (!/^https?:/.test(url)) {
			warnings.add(`“${baseName(ref)}” wasn’t uploaded with the HTML, so it is missing.`);
			return null;
		}
		if (!cache.has(url)) {
			cache.set(
				url,
				fetch(url, { mode: 'cors' })
					.then((r) => (r.ok ? r.blob() : null))
					.catch(() => null)
			);
		}
		const blob = await cache.get(url);
		if (!blob) warnings.add(`Couldn’t download ${new URL(url).host}/…${baseName(url)} — it won’t appear.`);
		return blob;
	}
	return {
		async dataUrl(ref, base) {
			const blob = await fetchBlob(ref, base);
			return blob ? compactImage(blob) : null;
		},
		async text(ref, base) {
			const blob = await fetchBlob(ref, base);
			return blob ? blob.text() : null;
		},
		absolute(ref, base) {
			try {
				return new URL(ref, base || undefined).href;
			} catch {
				return '';
			}
		}
	};
}

/** Google Fonts serve every script subset; the certificate only needs Latin. */
function latinOnly(css) {
	const blocks = [...css.matchAll(/\/\*\s*([\w-]+)\s*\*\/\s*(@font-face\s*\{[^}]*\})/g)];
	if (!blocks.length) return css;
	return blocks
		.filter((m) => m[1] === 'latin')
		.map((m) => m[2])
		.join('\n');
}

/** Inlines @imports and url(...) references in a stylesheet. */
async function inlineCss(css, base, res, depth = 0) {
	// @import url(x) / @import "x"
	const imports = [...css.matchAll(/@import\s+(?:url\(\s*)?["']?([^"')\s;]+)["']?\s*\)?[^;]*;/g)];
	for (const m of imports) {
		const href = m[1];
		const nested = depth < 2 ? await res.text(href, base) : null;
		const inlined = nested ? await inlineCss(latinOnly(nested), res.absolute(href, base), res, depth + 1) : '';
		css = css.replace(m[0], inlined);
	}
	const urls = [...new Set([...css.matchAll(/url\(\s*["']?([^"')]+)["']?\s*\)/g)].map((m) => m[1]))];
	for (const ref of urls) {
		if (ref.startsWith('data:') || ref.startsWith('#')) continue;
		const data = await res.dataUrl(ref, base);
		css = css.split(ref).join(data ?? 'about:blank');
	}
	return css;
}

/**
 * Reads the picked files (one .html plus, optionally, its images, fonts and
 * stylesheets) into a cleaned, self-contained document.
 *
 * @param {File[]} files
 */
export async function importHtml(files) {
	const htmlFile = files.find(isHtmlFile);
	if (!htmlFile) throw new Error('Choose an .html file.');
	if (htmlFile.size > 5_000_000) throw new Error('That HTML file is over 5 MB.');
	const assets = new Map(files.filter((f) => f !== htmlFile).map((f) => [f.name.toLowerCase(), f]));
	const warnings = new Set();
	const res = resolver(assets, warnings);

	const doc = new DOMParser().parseFromString(await readText(htmlFile), 'text/html');
	if (!doc.body || !doc.body.textContent?.trim()) throw new Error('That HTML file has no visible content.');

	// 1. Clean
	doc.querySelectorAll(DROP).forEach((n) => n.remove());
	for (const el of doc.querySelectorAll('*')) {
		for (const attr of [...el.attributes]) {
			const name = attr.name.toLowerCase();
			if (name.startsWith('on') || /^\s*javascript:/i.test(attr.value)) el.removeAttribute(attr.name);
		}
	}

	// 2. Embed stylesheets, fonts and images
	for (const link of doc.querySelectorAll('link')) {
		const rel = (link.getAttribute('rel') || '').toLowerCase();
		const href = link.getAttribute('href') || '';
		if (rel.includes('stylesheet') && href) {
			const css = await res.text(href, '');
			if (css !== null) {
				const style = doc.createElement('style');
				style.textContent = await inlineCss(latinOnly(css), res.absolute(href, ''), res);
				link.replaceWith(style);
				continue;
			}
		}
		link.remove();
	}
	for (const style of doc.querySelectorAll('style')) style.textContent = await inlineCss(style.textContent || '', '', res);
	for (const el of doc.querySelectorAll('[style]')) {
		const css = el.getAttribute('style') || '';
		if (css.includes('url(')) el.setAttribute('style', await inlineCss(css, '', res));
	}
	for (const img of doc.querySelectorAll('img[src], image[href], image[xlink\\:href], input[type=image]')) {
		const attr = img.hasAttribute('src') ? 'src' : img.hasAttribute('href') ? 'href' : 'xlink:href';
		const data = await res.dataUrl(img.getAttribute(attr) || '', '');
		if (data) img.setAttribute(attr, data);
		else if (!(img.getAttribute(attr) || '').startsWith('data:')) img.remove();
		img.removeAttribute('srcset');
	}
	doc.querySelectorAll('source').forEach((n) => n.remove());

	const html = `<!DOCTYPE html>\n${doc.documentElement.outerHTML}`;
	const kb = Math.round(html.length / 1024);
	if (html.length > MAX_DESIGN_BYTES - 20_000) {
		throw new Error(
			`This certificate is ${kb} KB once its images and fonts are embedded, over the ~900 KB limit. Use smaller images or fewer fonts.`
		);
	}
	const measured = await measure(html);
	return { html, ...measured, warnings: [...warnings], name: htmlFile.name.replace(/\.[^.]+$/, '').replace(/[-_]+/g, ' ') };
}

/** Lays the document out in a hidden frame and reads its size, the certificate box and its text. */
async function measure(html) {
	const frame = document.createElement('iframe');
	frame.setAttribute('sandbox', 'allow-same-origin');
	frame.setAttribute('aria-hidden', 'true');
	frame.tabIndex = -1;
	const VIEW_W = 1400;
	const VIEW_H = 1000;
	Object.assign(frame.style, { position: 'fixed', left: '-20000px', top: '0', width: `${VIEW_W}px`, height: `${VIEW_H}px`, border: '0', visibility: 'hidden' });
	document.body.append(frame);
	try {
		await new Promise((resolve) => {
			frame.onload = resolve;
			frame.srcdoc = html;
			setTimeout(resolve, 6000);
		});
		const d = frame.contentDocument;
		if (!d?.body) throw new Error('Could not open that HTML file.');
		await Promise.race([d.fonts?.ready, new Promise((r) => setTimeout(r, 4000))]);
		const viewW = Math.max(VIEW_W, d.documentElement.scrollWidth);
		const viewH = Math.max(VIEW_H, d.documentElement.scrollHeight);
		frame.style.width = `${viewW}px`;
		frame.style.height = `${viewH}px`;
		await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));

		const box = certificateBox(d);
		const r = box.getBoundingClientRect();
		const crop =
			box === d.body
				? { x: 0, y: 0, w: viewW, h: viewH }
				: { x: Math.max(0, Math.round(r.left)), y: Math.max(0, Math.round(r.top)), w: Math.round(r.width), h: Math.round(r.height) };
		return { viewW, viewH, crop, texts: textsIn(box, frame.contentWindow) };
	} finally {
		frame.remove();
	}
}

const visibleChildren = (el) =>
	[...el.children].filter((c) => {
		if (/^(STYLE|LINK|META|TITLE|TEMPLATE)$/.test(c.tagName)) return false;
		const r = c.getBoundingClientRect();
		return r.width > 1 && r.height > 1;
	});

/**
 * The certificate itself: going down from <body> while there is a single
 * visible child, and stopping before a child that merely fills its parent
 * (an inner frame), so the outer border stays in.
 */
function certificateBox(d) {
	let el = d.body;
	for (let i = 0; i < 6; i++) {
		const kids = visibleChildren(el);
		if (kids.length !== 1) break;
		const child = kids[0];
		if (el !== d.body) {
			const a = el.getBoundingClientRect();
			const b = child.getBoundingClientRect();
			if (b.width * b.height > a.width * a.height * 0.92) break;
		}
		el = child;
	}
	return el;
}

/** Distinct visible text in the box, biggest type first. */
function textsIn(root, win) {
	const seen = new Map();
	const walker = root.ownerDocument.createTreeWalker(root, 4 /* NodeFilter.SHOW_TEXT */);
	for (let n = walker.nextNode(); n; n = walker.nextNode()) {
		const text = (n.textContent || '').replace(/\s+/g, ' ').trim();
		if (!text || text.length > 160) continue;
		const parent = n.parentElement;
		if (!parent || /^(STYLE|SCRIPT|TITLE)$/.test(parent.tagName)) continue;
		const size = parseFloat(win.getComputedStyle(parent).fontSize) || 16;
		if (!seen.has(text) || seen.get(text) < size) seen.set(text, size);
	}
	return [...seen].map(([text, size]) => ({ text, size })).sort((a, b) => b.size - a.size).slice(0, 80);
}

/** A best guess at the participant's name: the largest short text that isn't a heading word. */
export function guessName(texts) {
	const pick = texts.find(
		(t) => /\{\{\s*participant_name\s*\}\}/.test(t.text) ||
			(t.text.split(' ').length <= 5 && t.text.length <= 40 && !/certificat|award|achievement|participation|appreciation|excellence|completion|presented|this is to/i.test(t.text))
	);
	return pick?.text.includes('{{') ? '' : (pick?.text ?? '');
}

/**
 * Writes merge fields into the HTML: each chosen text (as it appears on the
 * certificate) is replaced, inside the text it belongs to, by its `{{field}}`,
 * so the participant's details take on exactly that text's style.
 *
 * @param {string} html
 * @param {Record<string, string>} mapping field → text on the certificate
 * @returns {{ html: string, missing: string[] }}
 */
export function applyFields(html, mapping) {
	const doc = new DOMParser().parseFromString(html, 'text/html');
	const entries = Object.entries(mapping)
		.map(([field, text]) => [field, text.replace(/\s+/g, ' ').trim()])
		.filter(([, text]) => text)
		.sort((a, b) => b[1].length - a[1].length);
	const found = new Set();
	const walker = doc.createTreeWalker(doc.body, 4);
	const nodes = [];
	for (let n = walker.nextNode(); n; n = walker.nextNode()) nodes.push(n);
	for (const node of nodes) {
		let value = node.textContent || '';
		const normal = value.replace(/\s+/g, ' ');
		let changed = false;
		for (const [field, text] of entries) {
			const at = normal.indexOf(text);
			if (at < 0) continue;
			// Rebuild on the whitespace-normalised text; the browser collapses it anyway.
			value = (changed ? value : normal).split(text).join(`{{${field}}}`);
			changed = true;
			found.add(field);
		}
		if (changed) node.textContent = value;
	}
	return {
		html: `<!DOCTYPE html>\n${doc.documentElement.outerHTML}`,
		missing: entries.filter(([field]) => !found.has(field)).map(([field]) => field)
	};
}
