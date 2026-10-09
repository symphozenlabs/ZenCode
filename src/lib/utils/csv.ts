function cell(value: unknown) {
	const s = value == null ? '' : String(value);
	// Neutralise spreadsheet formula injection, then quote.
	const safe = /^[=+\-@\t\r]/.test(s) ? `'${s}` : s;
	return `"${safe.replace(/"/g, '""')}"`;
}

export function toCsv(headers: string[], rows: unknown[][]) {
	return [headers, ...rows].map((r) => r.map(cell).join(',')).join('\r\n');
}

export function downloadCsv(filename: string, csv: string) {
	const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' });
	const url = URL.createObjectURL(blob);
	const a = Object.assign(document.createElement('a'), { href: url, download: filename });
	a.click();
	setTimeout(() => URL.revokeObjectURL(url), 1000);
}
