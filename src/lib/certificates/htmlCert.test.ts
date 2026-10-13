import { describe, expect, it } from 'vitest';
import { fieldsUsed, normaliseDesign, uploadedHtmlDesign } from './design.js';
import { filledHtml, layerBox } from './htmlCert.js';

const layer = (html: string) => ({ html, viewW: 1400, viewH: 1000, crop: { x: 200, y: 150, w: 1000, h: 700 } });

describe('HTML certificates', () => {
	it('fills fields in the HTML, escaping the values', () => {
		const out = filledHtml(layer('<h1 class="name">{{participant_name}}</h1><p>{{team_name}}</p>'), {
			participant_name: '<img src=x onerror=alert(1)>',
			team_name: 'A & B'
		});
		expect(out).toContain('&lt;img src=x onerror=alert(1)&gt;');
		expect(out).not.toContain('<img');
		expect(out).toContain('A &amp; B');
	});

	it('leaves placeholders as written without values, but always draws the QR', () => {
		const out = filledHtml(layer('<b>{{participant_name}}</b><div>{{qr_code}}</div>'), null, 'https://x/verify/ZC-1');
		expect(out).toContain('{{participant_name}}');
		expect(out).toContain('<svg');
		expect(out).not.toContain('{{qr_code}}');
	});

	it('only overlays what the HTML does not place itself', () => {
		const types = (html: string) => uploadedHtmlDesign(layer(html)).elements.map((e) => (e.type === 'text' ? e.text : e.type));
		expect(types('<p>Hello</p>')).toEqual(['{{participant_name}}', 'qr', '{{certificate_id}}']);
		expect(types('<p>{{participant_name}}</p><i>{{qr_code}}</i>')).toEqual(['{{certificate_id}}']);
	});

	it('picks the page closest to the certificate box', () => {
		expect(uploadedHtmlDesign(layer('<p>x</p>')).page).toMatchObject({ orientation: 'landscape' });
		const tall = { ...layer('<p>x</p>'), crop: { x: 0, y: 0, w: 700, h: 1000 } };
		expect(uploadedHtmlDesign(tall).page).toMatchObject({ orientation: 'portrait' });
	});

	it('survives a save, and strips anything that could run', () => {
		const d = uploadedHtmlDesign(layer('<p onclick="steal()">{{award}}</p><script>alert(1)</script><iframe src="//evil"></iframe><a href="javascript:x">x</a>'));
		const result = normaliseDesign(JSON.parse(JSON.stringify(d)));
		expect(result.ok).toBe(true);
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		const html: string = (result.design as any).page.html.html;
		expect(html).toContain('{{award}}');
		expect(html).not.toMatch(/script|onclick|iframe|javascript:/i);
		expect(fieldsUsed(result.design)).toContain('award');
	});

	it('fits the box onto the page, centred', () => {
		const page = { width: 1123, height: 794 };
		const box = layerBox(page, layer(''));
		expect(box.k).toBeCloseTo(Math.min(1123 / 1000, 794 / 700));
		expect(box.left).toBeGreaterThanOrEqual(0);
		expect(box.top).toBeGreaterThanOrEqual(0);
		expect(box.left * 2 + box.w).toBeCloseTo(1123);
	});

	it('rejects an HTML layer too large to store', () => {
		const d = uploadedHtmlDesign(layer('<p>' + 'x'.repeat(1_000_000) + '</p>'));
		expect(normaliseDesign(d).ok).toBe(false);
	});
});
