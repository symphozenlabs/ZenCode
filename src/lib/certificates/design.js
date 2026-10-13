/**
 * Certificates: the design format shared by the editor, the print view and
 * the verify page.
 *
 * A design is a page and a stack of elements, each placed in page pixels
 * (96 per inch, so an A4 landscape page is 1123 × 794). Elements are drawn in
 * order, first at the back. Text may carry merge fields, `{{participant_name}}`,
 * which are filled in for each participant when a certificate is issued.
 *
 * Everything here is plain data and pure functions, so the editor, the print
 * sheet and the verify page all draw a certificate the same way.
 */

/** Page sizes in CSS pixels at 96 dpi. */
export const PAGE_SIZES = {
	a4: { label: 'A4', width: 794, height: 1123 },
	letter: { label: 'US Letter', width: 816, height: 1056 },
	square: { label: 'Square', width: 1000, height: 1000 }
};

/** A page, landscape unless asked otherwise. */
export function pageOf(size = 'a4', orientation = 'landscape') {
	const base = PAGE_SIZES[size] ?? PAGE_SIZES.a4;
	const long = Math.max(base.width, base.height);
	const short = Math.min(base.width, base.height);
	return orientation === 'portrait'
		? { size, orientation, width: short, height: long }
		: { size, orientation, width: long, height: short };
}

/** Typefaces offered in the editor. All load from Google Fonts on certificate pages. */
export const FONTS = [
	{ family: 'Geist', label: 'Geist', kind: 'Sans' },
	{ family: 'Montserrat', label: 'Montserrat', kind: 'Sans' },
	{ family: 'Playfair Display', label: 'Playfair Display', kind: 'Serif' },
	{ family: 'Cormorant Garamond', label: 'Cormorant Garamond', kind: 'Serif' },
	{ family: 'EB Garamond', label: 'EB Garamond', kind: 'Serif' },
	{ family: 'Cinzel', label: 'Cinzel', kind: 'Display' },
	{ family: 'Great Vibes', label: 'Great Vibes', kind: 'Script' },
	{ family: 'Pinyon Script', label: 'Pinyon Script', kind: 'Script' }
];

/** One stylesheet link that loads every certificate typeface. */
export const FONTS_HREF =
	'https://fonts.googleapis.com/css2?family=Cinzel:wght@400;600;700&family=Geist:wght@300..700&family=Cormorant+Garamond:ital,wght@0,400;0,600;0,700;1,400&family=EB+Garamond:ital,wght@0,400;0,600;1,400&family=Great+Vibes&family=Montserrat:wght@300;400;500;600;700&family=Pinyon+Script&family=Playfair+Display:ital,wght@0,400;0,600;0,700;1,400&display=swap';

/** The fields a certificate can be filled in with, and what a preview shows for each. */
export const MERGE_FIELDS = [
	{ key: 'participant_name', label: 'Participant name', sample: 'Aditi Srinivasan' },
	{ key: 'admission_no', label: 'Admission number', sample: '25CAPMCA014' },
	{ key: 'team_name', label: 'Team name', sample: 'Byte Builders' },
	{ key: 'role', label: 'Role in team', sample: 'Team Leader' },
	{ key: 'award', label: 'Award', sample: 'First Place' },
	{ key: 'event_title', label: 'Event title', sample: 'Hackathon' },
	{ key: 'event_dates', label: 'Event dates', sample: '24 – 25 October 2026' },
	{ key: 'venue', label: 'Venue', sample: 'Main Auditorium' },
	{ key: 'issue_date', label: 'Issue date', sample: '26 October 2026' },
	{ key: 'certificate_id', label: 'Certificate ID', sample: 'ZC-7K2Q-9XWD' }
];

export const SAMPLE_VALUES = Object.fromEntries(MERGE_FIELDS.map((f) => [f.key, f.sample]));

const FIELD = /\{\{\s*([a-z_]+)\s*\}\}/g;

/**
 * Fills `{{field}}` placeholders from `values`. Unknown fields are left as
 * written, so a typo shows on the preview rather than vanishing.
 */
export function fillFields(text, values = {}) {
	return String(text ?? '').replace(FIELD, (whole, key) =>
		values[key] !== undefined && values[key] !== null ? String(values[key]) : whole
	);
}

/** The merge fields a design uses, so the issue screen can warn about empty ones. */
export function fieldsUsed(design) {
	const used = new Set();
	for (const el of design?.elements ?? []) {
		if (el.type !== 'text') continue;
		for (const m of String(el.text ?? '').matchAll(FIELD)) used.add(m[1]);
	}
	for (const m of String(design?.page?.html?.html ?? '').matchAll(FIELD)) if (m[1] !== QR_FIELD) used.add(m[1]);
	return [...used];
}

/** In an uploaded HTML certificate, `{{qr_code}}` marks where the verification QR goes. */
export const QR_FIELD = 'qr_code';

export const ELEMENT_TYPES = ['text', 'image', 'rect', 'ellipse', 'line', 'qr'];

let counter = 0;
/** A short id for a new element; unique within a design. */
export const elementId = () =>
	`el-${Date.now().toString(36)}-${(counter++).toString(36)}${Math.random().toString(36).slice(2, 5)}`;

/** Defaults for each element type, so a new one looks right straight away. */
export function makeElement(type, page, overrides = {}) {
	const cx = page.width / 2;
	const cy = page.height / 2;
	const base = {
		id: elementId(),
		type,
		rotation: 0,
		opacity: 1,
		locked: false,
		hidden: false
	};
	const byType = {
		text: {
			x: cx - 250,
			y: cy - 30,
			width: 500,
			height: 60,
			text: 'Double-click to edit',
			fontFamily: 'Playfair Display',
			fontSize: 36,
			fontWeight: 400,
			italic: false,
			underline: false,
			uppercase: false,
			color: '#1f2621',
			align: 'center',
			letterSpacing: 0,
			lineHeight: 1.2
		},
		image: {
			x: cx - 90,
			y: cy - 90,
			width: 180,
			height: 180,
			src: '',
			fit: 'contain',
			radius: 0
		},
		rect: {
			x: cx - 150,
			y: cy - 90,
			width: 300,
			height: 180,
			fill: '#e7f2e9',
			stroke: '#2f7b45',
			strokeWidth: 0,
			radius: 8
		},
		ellipse: {
			x: cx - 90,
			y: cy - 90,
			width: 180,
			height: 180,
			fill: '#e7f2e9',
			stroke: '#2f7b45',
			strokeWidth: 0
		},
		line: {
			x: cx - 150,
			y: cy,
			width: 300,
			height: 2,
			fill: '#1f2621'
		},
		qr: {
			x: page.width - 170,
			y: page.height - 170,
			width: 110,
			height: 110,
			color: '#1f2621',
			background: '#ffffff'
		}
	};
	return { ...base, ...byType[type], ...overrides };
}

/** A blank page. */
export function blankDesign(size = 'a4', orientation = 'landscape') {
	return {
		version: 1,
		page: { ...pageOf(size, orientation), background: '#ffffff', backgroundImage: '' },
		elements: []
	};
}

/**
 * A design around a certificate someone already has, say one a partner
 * company printed: their scan is the page, and on top go the participant's name
 * and the QR that verifies it, ready to be dragged into place in the editor.
 *
 * The page is whichever size and orientation is closest to the scan's shape,
 * so as little as possible is cropped.
 *
 * @param {{ src: string, width: number, height: number }} image a data URL and its pixel size
 */
export function uploadedDesign({ src, width, height }) {
	const d = {
		version: 1,
		page: { ...closestPage(width, height), background: '#ffffff', backgroundImage: src },
		elements: []
	};
	d.elements = overlays(d.page, { name: true, qr: true, id: true });
	return d;
}

/** The page size and orientation closest to a `width` × `height` shape, so as little as possible is cropped. */
function closestPage(width, height) {
	const ratio = width > 0 && height > 0 ? width / height : Math.SQRT2;
	const candidates = Object.keys(PAGE_SIZES).flatMap((size) =>
		size === 'square' ? [pageOf(size)] : [pageOf(size), pageOf(size, 'portrait')]
	);
	return candidates.reduce((best, p) =>
		Math.abs(Math.log(p.width / p.height / ratio)) <
		Math.abs(Math.log(best.width / best.height / ratio))
			? p
			: best
	);
}

/** The participant's name, verification QR and certificate ID laid over an uploaded certificate. */
function overlays(p, want) {
	const qr = Math.round(Math.min(p.width, p.height) * 0.13);
	const margin = Math.round(Math.min(p.width, p.height) * 0.05);
	return [
		want.name &&
			text(p, p.width * 0.15, p.height * 0.42, p.width * 0.7, 70, '{{participant_name}}', {
				fontFamily: 'Playfair Display',
				fontSize: Math.round(p.width / 22),
				fontWeight: 600,
				color: '#1f2621'
			}),
		want.qr &&
			makeElement('qr', p, {
				x: p.width - margin - qr,
				y: p.height - margin - qr - 18,
				width: qr,
				height: qr
			}),
		want.id &&
			text(p, p.width - margin - 220, p.height - margin - 14, 220, 16, '{{certificate_id}}', {
				fontFamily: 'Montserrat',
				fontSize: 10,
				color: '#3b433e',
				align: 'right',
				letterSpacing: 1
			})
	].filter(Boolean);
}

/**
 * A design around an uploaded HTML certificate. The HTML is drawn as the page,
 * keeping its own fonts and styles, and merge fields written into it
 * (`{{participant_name}}` …) are filled in its own text style. Only what the
 * HTML doesn't place itself — the name, the QR, the ID — is laid on top, ready
 * to drag into place.
 *
 * @param {{ html: string, viewW: number, viewH: number, crop: { x: number, y: number, w: number, h: number } }} layer
 */
export function uploadedHtmlDesign(layer) {
	const has = (field) => layer.html.includes(`{{${field}}}`);
	const page = { ...closestPage(layer.crop.w, layer.crop.h), background: '#ffffff', backgroundImage: '', html: layer };
	return {
		version: 1,
		page,
		elements: overlays(page, { name: !has('participant_name'), qr: !has(QR_FIELD), id: !has('certificate_id') })
	};
}

// ── Starter designs ─────────────────────────────────────────────────────────

function text(page, x, y, width, height, content, style = {}) {
	return makeElement('text', page, { x, y, width, height, text: content, ...style });
}

/** A line centred on the page, `width` wide. */
function centredLine(page, y, width, style = {}) {
	return makeElement('line', page, { x: (page.width - width) / 2, y, width, height: 1, ...style });
}

/** A signature line with its caption underneath, centred on `cx`. */
function signature(page, cx, y, caption, lineStyle, captionStyle) {
	return [
		makeElement('line', page, { x: cx - 120, y, width: 240, height: 1, ...lineStyle }),
		text(page, cx - 140, y + 10, 280, 28, caption, captionStyle)
	];
}

/** A small label over a value, left-aligned at `x`. */
function stat(page, x, y, label, value, width = 160) {
	return [
		text(page, x, y, width, 18, label, {
			fontFamily: 'Montserrat',
			fontSize: 11,
			fontWeight: 600,
			color: '#9aa19c',
			align: 'left',
			letterSpacing: 2,
			uppercase: true
		}),
		text(page, x, y + 20, width, 40, value, {
			fontFamily: 'Montserrat',
			fontSize: 26,
			fontWeight: 600,
			color: '#121614',
			align: 'left'
		})
	];
}

/** The Classic design; `achievement` words it for winners (with the {{award}} field). */
function classic(achievement = false) {
	const d = blankDesign();
	const p = d.page;
	const cx = p.width / 2;
	const gold = '#8a6d2f';
	const serif = { fontFamily: 'Cormorant Garamond', color: '#3d372d' };
	d.page.background = '#fffdf7';
	d.elements = [
		makeElement('rect', p, {
			x: 26,
			y: 26,
			width: p.width - 52,
			height: p.height - 52,
			fill: 'transparent',
			stroke: gold,
			strokeWidth: 4,
			radius: 0
		}),
		makeElement('rect', p, {
			x: 40,
			y: 40,
			width: p.width - 80,
			height: p.height - 80,
			fill: 'transparent',
			stroke: gold,
			strokeWidth: 1,
			radius: 0
		}),
		text(p, 0, 84, p.width, 64, 'Certificate', {
			fontFamily: 'Cinzel',
			fontSize: 52,
			fontWeight: 600,
			color: '#5b4520',
			letterSpacing: 10
		}),
		makeElement('line', p, { x: cx - 250, y: 166, width: 80, height: 1, fill: gold }),
		text(p, cx - 170, 154, 340, 24, achievement ? 'of Achievement' : 'of Participation', {
			fontFamily: 'Cinzel',
			fontSize: 16,
			fontWeight: 600,
			color: gold,
			letterSpacing: 8
		}),
		makeElement('line', p, { x: cx + 170, y: 166, width: 80, height: 1, fill: gold }),
		text(p, 0, 212, p.width, 30, 'This certificate is proudly presented to', {
			...serif,
			fontSize: 22,
			italic: true,
			color: '#5c5448'
		}),
		text(p, 100, 246, p.width - 200, 100, '{{participant_name}}', {
			fontFamily: 'Great Vibes',
			fontSize: 72,
			color: '#2a2418'
		}),
		centredLine(p, 350, 460, { fill: gold }),
		text(p, 0, 362, p.width, 26, '{{team_name}} · {{admission_no}}', {
			...serif,
			fontSize: 18,
			color: '#8a8171',
			letterSpacing: 1
		}),
		text(p, 0, 410, p.width, 30, achievement ? 'for winning {{award}} at' : 'for taking part in', {
			...serif,
			fontSize: 21,
			italic: true,
			color: '#5c5448'
		}),
		text(p, 120, 442, p.width - 240, 48, '{{event_title}}', {
			fontFamily: 'Playfair Display',
			fontSize: 30,
			fontWeight: 600,
			color: '#2a2418'
		}),
		text(p, 0, 492, p.width, 30, 'held {{event_dates}}', { ...serif, fontSize: 20 }),
		...signature(
			p,
			270,
			640,
			'Event Coordinator',
			{ fill: '#3d372d' },
			{ ...serif, fontSize: 18, fontWeight: 600, color: '#5c5448' }
		),
		makeElement('qr', p, {
			x: cx - 50,
			y: 588,
			width: 100,
			height: 100,
			color: '#2a2418',
			background: '#fffdf7'
		}),
		...signature(
			p,
			p.width - 270,
			640,
			'Head of Department',
			{ fill: '#3d372d' },
			{ ...serif, fontSize: 18, fontWeight: 600, color: '#5c5448' }
		),
		text(p, 0, 700, p.width, 20, 'ID {{certificate_id}} · Issued {{issue_date}}', {
			fontFamily: 'Montserrat',
			fontSize: 10.5,
			color: '#8a8171',
			letterSpacing: 1
		})
	];
	return d;
}

/** Designs to start from, so nobody has to begin with an empty page. */
export const STARTERS = [
	{
		id: 'classic',
		name: 'Classic',
		description: 'Serif type, a double border and a signature line.',
		build: () => classic()
	},
	{
		id: 'achievement',
		name: 'Achievement',
		description: 'The Classic design for winners, with the award they won.',
		build: () => classic(true)
	},
	{
		id: 'modern',
		name: 'Modern',
		description: 'A green band, bold sans type and clean alignment.',
		build() {
			const d = blankDesign();
			const p = d.page;
			const left = 370;
			const sans = { fontFamily: 'Montserrat', align: 'left' };
			d.elements = [
				makeElement('rect', p, {
					x: 0,
					y: 0,
					width: 300,
					height: p.height,
					fill: '#1f5a33',
					strokeWidth: 0,
					radius: 0
				}),
				makeElement('ellipse', p, {
					x: -170,
					y: -170,
					width: 420,
					height: 420,
					fill: '#2f7b45',
					strokeWidth: 0,
					opacity: 0.55
				}),
				text(p, 40, 500, 230, 30, 'ZenCode', {
					...sans,
					fontSize: 22,
					fontWeight: 600,
					color: '#ffffff'
				}),
				text(p, 40, 532, 230, 22, 'Code. Create. Compete.', {
					...sans,
					fontSize: 13,
					color: '#bfe8c7'
				}),
				makeElement('qr', p, {
					x: 40,
					y: 590,
					width: 116,
					height: 116,
					color: '#1f5a33',
					background: '#ffffff'
				}),
				text(p, 40, 714, 230, 20, 'Scan to verify', {
					...sans,
					fontSize: 11,
					color: '#bfe8c7',
					letterSpacing: 1
				}),
				makeElement('rect', p, {
					x: left,
					y: 84,
					width: 48,
					height: 4,
					fill: '#2f7b45',
					strokeWidth: 0,
					radius: 2
				}),
				text(p, left, 104, 690, 26, 'CERTIFICATE OF PARTICIPATION', {
					...sans,
					fontSize: 15,
					fontWeight: 600,
					color: '#2f7b45',
					letterSpacing: 4
				}),
				text(p, left, 150, 690, 26, 'This is to certify that', {
					...sans,
					fontSize: 17,
					color: '#69716c'
				}),
				text(p, left, 180, 690, 76, '{{participant_name}}', {
					...sans,
					fontSize: 52,
					fontWeight: 700,
					color: '#121614',
					letterSpacing: -1
				}),
				text(p, left, 258, 690, 26, '{{admission_no}}', {
					...sans,
					fontSize: 16,
					color: '#69716c'
				}),
				makeElement('line', p, { x: left, y: 312, width: 690, height: 1, fill: '#e3e7e4' }),
				text(p, left, 340, 690, 26, 'took part in', {
					...sans,
					fontSize: 17,
					color: '#69716c'
				}),
				text(p, left, 370, 690, 48, '{{event_title}}', {
					...sans,
					fontSize: 30,
					fontWeight: 600,
					color: '#121614'
				}),
				text(p, left, 422, 690, 26, '{{event_dates}}', {
					...sans,
					fontSize: 16,
					color: '#3b433e'
				}),
				...stat(p, left, 486, 'Team', '{{team_name}}', 300),
				...stat(p, left + 340, 486, 'Role', '{{role}}', 300),
				...signature(
					p,
					left + 120,
					636,
					'Coordinator',
					{ fill: '#121614' },
					{ ...sans, fontSize: 14, color: '#69716c', align: 'center' }
				),
				...signature(
					p,
					left + 570,
					636,
					'Head of Department',
					{ fill: '#121614' },
					{ ...sans, fontSize: 14, color: '#69716c', align: 'center' }
				),
				text(p, left, 714, 690, 20, 'Certificate {{certificate_id}} · Issued {{issue_date}}', {
					...sans,
					fontSize: 11,
					color: '#9aa19c',
					letterSpacing: 0.5
				})
			];
			return d;
		}
	},
	{
		id: 'minimal',
		name: 'Minimal',
		description: 'Lots of white space and one accent colour.',
		build() {
			const d = blankDesign();
			const p = d.page;
			const m = 80;
			const sans = { fontFamily: 'Geist', align: 'left' };
			const label = {
				...sans,
				fontSize: 11,
				fontWeight: 500,
				color: '#9aa19c',
				letterSpacing: 2,
				uppercase: true
			};
			const value = { ...sans, fontSize: 15, color: '#3b433e' };
			d.elements = [
				makeElement('rect', p, {
					x: m,
					y: m,
					width: 56,
					height: 5,
					fill: '#2f7b45',
					strokeWidth: 0,
					radius: 3
				}),
				text(p, m, m + 22, 700, 26, 'Certificate of Participation', {
					...sans,
					fontSize: 15,
					fontWeight: 500,
					color: '#69716c',
					letterSpacing: 3,
					uppercase: true
				}),
				text(p, m, 262, p.width - m * 2, 96, '{{participant_name}}', {
					fontFamily: 'Playfair Display',
					fontSize: 66,
					color: '#121614',
					align: 'left'
				}),
				text(p, m, 368, 780, 80, 'For taking part in {{event_title}}, {{event_dates}}.', {
					...sans,
					fontSize: 22,
					color: '#3b433e',
					lineHeight: 1.5
				}),
				makeElement('line', p, {
					x: m,
					y: 600,
					width: p.width - m * 2,
					height: 1,
					fill: '#e3e7e4'
				}),
				text(p, m, 632, 220, 18, 'Issued', label),
				text(p, m, 654, 220, 24, '{{issue_date}}', value),
				text(p, m + 250, 632, 220, 18, 'Team', label),
				text(p, m + 250, 654, 220, 24, '{{team_name}}', value),
				text(p, m + 500, 632, 220, 18, 'Certificate ID', label),
				text(p, m + 500, 654, 220, 24, '{{certificate_id}}', value),
				makeElement('qr', p, {
					x: p.width - m - 90,
					y: 626,
					width: 90,
					height: 90
				})
			];
			return d;
		}
	},
	{
		id: 'blank',
		name: 'Blank',
		description: 'An empty page. Build it your way.',
		build: () => blankDesign()
	}
];

// ── Validation ──────────────────────────────────────────────────────────────

const COLOR = /^(#[0-9a-f]{3,8}|transparent|rgba?\([\d\s.,%]+\))$/i;
const IMAGE = /^data:image\/(png|jpeg|webp|gif|svg\+xml);base64,[a-z0-9+/=]+$/i;

/**
 * The most a design may weigh once saved, images included. A Firestore
 * document holds at most 1 MiB, and the template's name and dates share it.
 */
export const MAX_DESIGN_BYTES = 950_000;

const num = (v, min, max, fallback) => {
	const n = Number(v);
	return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : fallback;
};
const color = (v, fallback) => (COLOR.test(String(v ?? '').trim()) ? String(v).trim() : fallback);
const bool = (v) => v === true;
const image = (v) => (IMAGE.test(String(v ?? '')) ? String(v) : '');

/**
 * An uploaded HTML page layer: the self-contained document, the viewport it
 * was laid out in and the box of the certificate inside it. Scripts never run
 * (it is shown in a sandboxed frame or as an image), but anything that could
 * script or fetch is dropped here too, in case a design arrives some other way.
 */
function htmlLayer(v) {
	if (!v || typeof v !== 'object' || typeof v.html !== 'string' || !v.html.trim()) return null;
	const html = v.html
		.replace(/<script\b[\s\S]*?<\/script\s*>/gi, '')
		.replace(/<\/?(script|iframe|frame|object|embed|base)\b[^>]*>/gi, '')
		.replace(/\son[a-z]+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, '')
		.replace(/javascript:/gi, '');
	const viewW = num(v.viewW, 200, 6000, 1200);
	const viewH = num(v.viewH, 200, 8000, 900);
	const c = v.crop ?? {};
	const x = num(c.x, 0, viewW, 0);
	const y = num(c.y, 0, viewH, 0);
	return {
		html,
		viewW,
		viewH,
		crop: { x, y, w: num(c.w, 50, viewW - x, viewW - x), h: num(c.h, 50, viewH - y, viewH - y) }
	};
}

/**
 * A design as it is stored: every value checked and clamped, and
 * anything unknown dropped. Returns `{ ok, design, errors }`.
 */
export function normaliseDesign(raw) {
	const errors = [];
	if (!raw || typeof raw !== 'object') return { ok: false, errors: ['The design is missing.'] };

	const sized = pageOf(
		PAGE_SIZES[raw.page?.size] ? raw.page.size : 'a4',
		raw.page?.orientation === 'portrait' ? 'portrait' : 'landscape'
	);
	const page = {
		...sized,
		background: color(raw.page?.background, '#ffffff'),
		backgroundImage: image(raw.page?.backgroundImage)
	};
	const html = htmlLayer(raw.page?.html);
	if (html) page.html = html;

	const list = Array.isArray(raw.elements) ? raw.elements.slice(0, 200) : [];
	const W = page.width * 2;
	const H = page.height * 2;
	const elements = [];
	for (const el of list) {
		if (!el || !ELEMENT_TYPES.includes(el.type)) continue;
		const common = {
			id: String(el.id ?? elementId()).slice(0, 64),
			type: el.type,
			x: num(el.x, -W, W, 0),
			y: num(el.y, -H, H, 0),
			width: num(el.width, 1, W, 100),
			height: num(el.height, 1, H, 100),
			rotation: num(el.rotation, -360, 360, 0),
			opacity: num(el.opacity, 0, 1, 1),
			locked: bool(el.locked),
			hidden: bool(el.hidden)
		};
		if (el.type === 'text') {
			elements.push({
				...common,
				text: String(el.text ?? '').slice(0, 2000),
				fontFamily: FONTS.some((f) => f.family === el.fontFamily) ? el.fontFamily : 'Geist',
				fontSize: num(el.fontSize, 4, 400, 24),
				fontWeight: [300, 400, 500, 600, 700].includes(Number(el.fontWeight))
					? Number(el.fontWeight)
					: 400,
				italic: bool(el.italic),
				underline: bool(el.underline),
				uppercase: bool(el.uppercase),
				color: color(el.color, '#1f2621'),
				align: ['left', 'center', 'right'].includes(el.align) ? el.align : 'center',
				letterSpacing: num(el.letterSpacing, -10, 40, 0),
				lineHeight: num(el.lineHeight, 0.6, 4, 1.2)
			});
		} else if (el.type === 'image') {
			const src = image(el.src);
			if (!src) continue;
			elements.push({
				...common,
				src,
				fit: el.fit === 'cover' ? 'cover' : 'contain',
				radius: num(el.radius, 0, 1000, 0)
			});
		} else if (el.type === 'rect' || el.type === 'ellipse') {
			elements.push({
				...common,
				fill: color(el.fill, 'transparent'),
				stroke: color(el.stroke, '#1f2621'),
				strokeWidth: num(el.strokeWidth, 0, 60, 0),
				...(el.type === 'rect' ? { radius: num(el.radius, 0, 1000, 0) } : {})
			});
		} else if (el.type === 'line') {
			elements.push({ ...common, fill: color(el.fill, '#1f2621') });
		} else if (el.type === 'qr') {
			elements.push({
				...common,
				color: color(el.color, '#1f2621'),
				background: color(el.background, '#ffffff')
			});
		}
	}

	const design = { version: 1, page, elements };
	if (JSON.stringify(design).length > MAX_DESIGN_BYTES) {
		errors.push('The design is too large to save. Use fewer or smaller images (together under about 900 KB).');
	}
	return errors.length ? { ok: false, errors } : { ok: true, design, errors };
}

/** Parses a stored design, falling back to a blank page if it is unreadable. */
export function parseDesign(json) {
	try {
		const result = normaliseDesign(typeof json === 'string' ? JSON.parse(json) : json);
		return result.ok ? result.design : blankDesign();
	} catch {
		return blankDesign();
	}
}

// ── Issuing ─────────────────────────────────────────────────────────────────

const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

/** What every certificate code looks like: ZC-XXXX-XXXX. */
export const CODE_PATTERN = /^ZC-[A-Z0-9]{4}-[A-Z0-9]{4}$/;

/**
 * A human-friendly certificate code: ZC-XXXX-XXXX, no look-alike characters.
 * `randomBytes(n)` returns n random bytes (crypto.getRandomValues in the browser).
 */
export function certificateCode(randomBytes) {
	const bytes = randomBytes(8);
	let out = '';
	for (let i = 0; i < 8; i++) out += CODE_ALPHABET[bytes[i] % CODE_ALPHABET.length];
	return `ZC-${out.slice(0, 4)}-${out.slice(4)}`;
}

const MONTHS = [
	'January',
	'February',
	'March',
	'April',
	'May',
	'June',
	'July',
	'August',
	'September',
	'October',
	'November',
	'December'
];

/** "2026-08-24" → "24 August 2026". */
export function longDate(ymd) {
	const [y, m, d] = String(ymd ?? '')
		.split('-')
		.map(Number);
	if (!y || !m || !d) return String(ymd ?? '');
	return `${d} ${MONTHS[m - 1]} ${y}`;
}

/** An event's date range in words: "24 – 29 August 2026", or one day. */
export function dateRange(start, end) {
	if (!end || end === start) return longDate(start);
	const [ys, ms, ds] = String(start).split('-').map(Number);
	const [ye, me, de] = String(end).split('-').map(Number);
	if (!ys || !ye) return `${longDate(start)} – ${longDate(end)}`;
	if (ys === ye && ms === me) return `${ds} – ${de} ${MONTHS[me - 1]} ${ye}`;
	if (ys === ye) return `${ds} ${MONTHS[ms - 1]} – ${de} ${MONTHS[me - 1]} ${ye}`;
	return `${longDate(start)} – ${longDate(end)}`;
}

/** The values a certificate is filled in with, for one team member at one event. */
export function valuesFor({ event, recipient, award = '', code, issuedOn }) {
	return {
		participant_name: recipient.name,
		admission_no: recipient.admissionNumber ?? '',
		team_name: recipient.teamName ?? '',
		role: recipient.memberNumber === 1 ? 'Team Leader' : 'Team Member',
		award: award ?? '',
		event_title: event.title,
		event_dates: dateRange(event.startDate, event.endDate),
		venue: event.venue ?? '',
		issue_date: longDate(issuedOn),
		certificate_id: code
	};
}

/** Today as yyyy-mm-dd in local time. */
export function localDate(at = new Date()) {
	const pad = (n) => String(n).padStart(2, '0');
	return `${at.getFullYear()}-${pad(at.getMonth() + 1)}-${pad(at.getDate())}`;
}
