// @ts-nocheck -- design.js is plain JS; its inferred types are too narrow for these fixtures.
import { describe, expect, it } from 'vitest';
import {
	STARTERS,
	blankDesign,
	certificateCode,
	dateRange,
	fieldsUsed,
	fillFields,
	longDate,
	makeElement,
	normaliseDesign,
	pageOf,
	parseDesign,
	uploadedDesign,
	valuesFor
} from './design.js';

describe('pageOf', () => {
	it('lays A4 on its side by default and upright when asked', () => {
		expect(pageOf('a4')).toMatchObject({ width: 1123, height: 794 });
		expect(pageOf('a4', 'portrait')).toMatchObject({ width: 794, height: 1123 });
	});

	it('falls back to A4 for an unknown size', () => {
		expect(pageOf('poster')).toMatchObject({ width: 1123, height: 794 });
	});
});

describe('fillFields', () => {
	it('fills known fields, tolerating spaces inside the braces', () => {
		expect(
			fillFields('To {{participant_name}}, {{ admission_no }}', {
				participant_name: 'Aditi',
				admission_no: '25CAPMCA014'
			})
		).toBe('To Aditi, 25CAPMCA014');
	});

	it('leaves unknown or missing fields as written, so a typo shows', () => {
		expect(fillFields('{{participnt_name}} {{hours}}', { participant_name: 'Aditi' })).toBe(
			'{{participnt_name}} {{hours}}'
		);
	});

	it('fills a field with 0 rather than dropping it', () => {
		expect(fillFields('{{hours}} h', { hours: 0 })).toBe('0 h');
	});
});

describe('fieldsUsed', () => {
	it('lists each field used in the text elements once', () => {
		const d = blankDesign();
		d.elements = [
			makeElement('text', d.page, { text: '{{participant_name}} and {{participant_name}}' }),
			makeElement('text', d.page, { text: '{{event_title}}' }),
			makeElement('rect', d.page)
		];
		expect(fieldsUsed(d).sort()).toEqual(['event_title', 'participant_name']);
	});
});

describe('normaliseDesign', () => {
	it('accepts every starter design unchanged in shape', () => {
		for (const starter of STARTERS) {
			const design = starter.build();
			const result = normaliseDesign(design);
			expect(result.ok).toBe(true);
			expect(result.design.elements).toHaveLength(design.elements.length);
		}
	});

	it('rejects a missing design', () => {
		expect(normaliseDesign(null).ok).toBe(false);
	});

	it('drops unknown element types and properties', () => {
		const d = blankDesign();
		d.elements = [
			{ type: 'script', x: 0, y: 0, width: 10, height: 10 },
			{ ...makeElement('rect', d.page), onclick: 'alert(1)' }
		];
		const { design } = normaliseDesign(d);
		expect(design.elements).toHaveLength(1);
		expect(design.elements[0]).not.toHaveProperty('onclick');
	});

	it('clamps numbers and replaces bad colours and fonts', () => {
		const d = blankDesign();
		d.elements = [
			makeElement('text', d.page, {
				fontSize: 99999,
				opacity: 4,
				color: 'url(javascript:alert(1))',
				fontFamily: 'Comic Sans'
			})
		];
		const [el] = normaliseDesign(d).design.elements;
		expect(el.fontSize).toBe(400);
		expect(el.opacity).toBe(1);
		expect(el.color).toBe('#1f2621');
		expect(el.fontFamily).toBe('Geist');
	});

	it('keeps only image data URLs, and drops images without one', () => {
		const d = blankDesign();
		d.page.backgroundImage = 'https://example.com/tracker.png';
		d.elements = [
			makeElement('image', d.page, { src: 'data:image/png;base64,iVBORw0KGgo=' }),
			makeElement('image', d.page, { src: 'javascript:alert(1)' })
		];
		const { design } = normaliseDesign(d);
		expect(design.page.backgroundImage).toBe('');
		expect(design.elements).toHaveLength(1);
		expect(design.elements[0].src).toMatch(/^data:image\/png/);
	});

	it('refuses a design that is too large to store', () => {
		const d = blankDesign();
		const big = `data:image/png;base64,${'A'.repeat(4_100_000)}`;
		d.elements = [makeElement('image', d.page, { src: big })];
		const result = normaliseDesign(d);
		expect(result.ok).toBe(false);
		expect(result.errors[0]).toMatch(/too large/);
	});

	it('sizes the page from its size and orientation, not from what was sent', () => {
		const d = blankDesign();
		d.page = { size: 'a4', orientation: 'portrait', width: 5, height: 5, background: '#fff' };
		expect(normaliseDesign(d).design.page).toMatchObject({ width: 794, height: 1123 });
	});
});

describe('parseDesign', () => {
	it('falls back to a blank page when the stored JSON is broken', () => {
		expect(parseDesign('{not json').elements).toEqual([]);
	});
});

describe('certificateCode', () => {
	it('makes ZC-XXXX-XXXX codes with no look-alike characters', () => {
		let n = 0;
		const bytes = (size: number) => Uint8Array.from({ length: size }, () => n++ * 37);
		const code = certificateCode(bytes);
		expect(code).toMatch(/^ZC-[A-HJ-NP-Z2-9]{4}-[A-HJ-NP-Z2-9]{4}$/);
	});
});

describe('dates', () => {
	it('writes dates out in full', () => {
		expect(longDate('2026-08-24')).toBe('24 August 2026');
	});

	it('shortens a range within one month or year', () => {
		expect(dateRange('2026-08-24', '2026-08-29')).toBe('24 – 29 August 2026');
		expect(dateRange('2026-08-24', '2026-09-02')).toBe('24 August – 2 September 2026');
		expect(dateRange('2026-12-30', '2027-01-02')).toBe('30 December 2026 – 2 January 2027');
		expect(dateRange('2026-08-24', '2026-08-24')).toBe('24 August 2026');
	});
});

describe('valuesFor', () => {
	const event = { title: 'Hackathon', startDate: '2026-10-24', endDate: '2026-10-25', venue: 'Main Auditorium' };

	it('fills in a team member, their team and the event', () => {
		const v = valuesFor({
			event,
			recipient: { name: 'Aditi', admissionNumber: '25CAPMCA014', teamName: 'Byte Builders', memberNumber: 1 },
			award: 'First Place',
			code: 'ZC-AAAA-BBBB',
			issuedOn: '2026-10-26'
		});
		expect(v).toEqual({
			participant_name: 'Aditi',
			admission_no: '25CAPMCA014',
			team_name: 'Byte Builders',
			role: 'Team Leader',
			award: 'First Place',
			event_title: 'Hackathon',
			event_dates: '24 – 25 October 2026',
			venue: 'Main Auditorium',
			issue_date: '26 October 2026',
			certificate_id: 'ZC-AAAA-BBBB'
		});
	});

	it('calls everyone after the leader a member, and leaves the award empty unless given', () => {
		const v = valuesFor({
			event,
			recipient: { name: 'Rahul', admissionNumber: '25CAPMCA020', teamName: 'Byte Builders', memberNumber: 3 },
			code: 'ZC-CCCC-DDDD',
			issuedOn: '2026-10-26'
		});
		expect(v.role).toBe('Team Member');
		expect(v.award).toBe('');
	});
});

describe('uploadedDesign', () => {
	const src = 'data:image/jpeg;base64,AAAA';

	it('puts the scan behind the name, the QR and the code', () => {
		const d = uploadedDesign({ src, width: 2000, height: 1414 });
		expect(d.page).toMatchObject({ size: 'a4', orientation: 'landscape', backgroundImage: src });
		expect(fieldsUsed(d)).toEqual(['participant_name', 'certificate_id']);
		expect(d.elements.some((el) => el.type === 'qr')).toBe(true);
		expect(normaliseDesign(d).ok).toBe(true);
	});

	it('picks the page closest to the scan’s shape, and keeps everything on it', () => {
		expect(uploadedDesign({ src, width: 1414, height: 2000 }).page.orientation).toBe('portrait');
		expect(uploadedDesign({ src, width: 900, height: 880 }).page.size).toBe('square');
		const d = uploadedDesign({ src, width: 1100, height: 850 });
		for (const el of d.elements) {
			expect(el.x).toBeGreaterThanOrEqual(0);
			expect(el.y + el.height).toBeLessThanOrEqual(d.page.height);
			expect(el.x + el.width).toBeLessThanOrEqual(d.page.width);
		}
	});
});
