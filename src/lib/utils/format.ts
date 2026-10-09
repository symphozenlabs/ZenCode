export const TBA = 'To be announced';

function parseIsoDate(iso: string): Date | null {
	if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return null;
	const d = new Date(`${iso}T00:00:00`);
	return Number.isNaN(d.getTime()) ? null : d;
}

export function formatDate(iso: string, opts: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'short', year: 'numeric' }) {
	const d = parseIsoDate(iso);
	return d ? d.toLocaleDateString('en-IN', opts) : '';
}

export function formatDateRange(start: string, end: string) {
	const a = formatDate(start);
	const b = formatDate(end);
	if (!a) return TBA;
	if (!b || a === b) return a;
	return `${a} – ${b}`;
}

export function formatTimestamp(ms: number, withTime = false) {
	if (!ms) return '—';
	return new Date(ms).toLocaleString('en-IN', {
		day: '2-digit',
		month: 'short',
		year: withTime ? 'numeric' : undefined,
		hour: withTime ? '2-digit' : undefined,
		minute: withTime ? '2-digit' : undefined
	});
}

export function pad2(n: number) {
	return String(n).padStart(2, '0');
}
