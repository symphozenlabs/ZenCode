import { error, isHttpError, json } from '@sveltejs/kit';
import { doc, getDoc } from 'firebase/firestore';
import { adminDb, requireAdmin } from '$lib/server/admin-session';
import { listPassEmails } from '$lib/server/email.js';
import { sendAndRecord, teamRecipients } from '$lib/server/registration-mail.js';
import { COLLECTION_BY_EVENT, EVENT_NAME } from '$lib/registrations/model';
import { EVENT_IDS, type EventId } from '$lib/config/site';
import type { RequestHandler } from './$types';

const FIRESTORE_ID = /^[A-Za-z0-9]{20}$/;

async function handle(fn: () => Promise<unknown>) {
	try {
		return json(await fn());
	} catch (err) {
		if (isHttpError(err)) return json({ message: err.body.message }, { status: err.status });
		console.error('[registrations/email]', err);
		return json({ message: 'Something went wrong. Please try again.' }, { status: 500 });
	}
}

/** Delivery state of every check-in pass email, straight from Resend. */
export const GET: RequestHandler = ({ request }) =>
	handle(async () => {
		await requireAdmin(request);
		return listPassEmails();
	});

/** Resend a team's passes — to everyone, or only the listed addresses. */
export const POST: RequestHandler = ({ request }) =>
	handle(async () => {
		await requireAdmin(request);
		const body = (await request.json().catch(() => null)) as { event?: string; teamId?: string; emails?: unknown } | null;
		const event = body?.event as EventId;
		const teamId = body?.teamId;
		if (!EVENT_IDS.includes(event) || typeof teamId !== 'string' || !FIRESTORE_ID.test(teamId)) {
			error(400, 'A valid event and team are required.');
		}

		const collectionName = COLLECTION_BY_EVENT[event];
		const snap = await getDoc(doc(await adminDb(), collectionName, teamId));
		if (!snap.exists()) error(404, 'This registration no longer exists.');
		const data = snap.data();

		let only: string[] | null = null;
		if (Array.isArray(body?.emails)) {
			// Only addresses that belong to this team can be mailed.
			const team = new Set(teamRecipients(data));
			only = body.emails.map((e) => String(e).trim().toLowerCase()).filter((e) => team.has(e));
			if (!only.length) error(400, 'None of those addresses belong to this team.');
		}

		const outcome = await sendAndRecord(collectionName, EVENT_NAME[event], teamId, data, only);
		if (outcome.skipped) error(503, outcome.message ?? 'Email is not configured.');
		return { success: outcome.success, allSuccess: outcome.allSuccess, results: outcome.results };
	});
