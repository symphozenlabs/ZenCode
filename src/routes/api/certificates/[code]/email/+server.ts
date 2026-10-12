import { error, json } from '@sveltejs/kit';
import { requireAdmin } from '$lib/server/admin-session';
import { emailCertificate } from '$lib/server/certificateEmail.js';
import type { RequestHandler } from './$types';

const CODE = /^ZC-[A-Z0-9]{4}-[A-Z0-9]{4}$/;
const MAX_PDF_BYTES = 4_000_000;

/**
 * POST /api/certificates/:code/email?base=<site origin>
 * Body: the certificate as a PDF (application/pdf), drawn in the organiser's
 * browser. Sends it to the participant's registered email address.
 */
export const POST: RequestHandler = async ({ request, params, url }) => {
	await requireAdmin(request);

	const code = String(params.code ?? '').toUpperCase();
	if (!CODE.test(code)) error(400, 'That is not a certificate code.');

	let base = url.searchParams.get('base') ?? url.origin;
	try {
		const parsed = new URL(base);
		if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') throw new Error();
		base = parsed.origin;
	} catch {
		base = url.origin;
	}

	const pdf = new Uint8Array(await request.arrayBuffer());
	if (pdf.length > MAX_PDF_BYTES) error(413, 'The certificate file is too large to email.');
	if (new TextDecoder().decode(pdf.subarray(0, 5)) !== '%PDF-') error(400, 'Expected the certificate as a PDF.');

	try {
		return json(await emailCertificate({ code, pdf, verifyBase: base }));
	} catch (err) {
		const status = (err as { status?: number }).status;
		if (status && status < 600) error(status, (err as Error).message);
		console.error('[certificates] email failed', err);
		error(500, 'Could not send the email. Please try again.');
	}
};
