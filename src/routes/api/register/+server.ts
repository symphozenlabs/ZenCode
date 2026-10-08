import { json } from '@sveltejs/kit';
import { randomInt } from 'node:crypto';
import { doc, getDoc, writeBatch } from 'firebase/firestore';
import { adminDb, hasAdminCredentials } from '$lib/server/firebase-admin';
import { hasPublicConfig, publicDb } from '$lib/server/firebase-public';
import { getSiteConfig } from '$lib/server/site-config';
import { rateLimit } from '$lib/server/rate-limit';
import {
	registrationKeyId,
	sanitizeRegistration,
	validateAll,
	type Registration
} from '$lib/validation/registration';
import type { RequestHandler } from './$types';

const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

function registrationId() {
	let id = 'ZC-';
	for (let i = 0; i < 6; i++) id += ALPHABET[randomInt(ALPHABET.length)];
	return id;
}

function fail(status: number, message: string, errors?: Record<string, string>) {
	return json({ ok: false, message, errors }, { status });
}

const DUPLICATE = () =>
	fail(409, 'This email is already registered for this event.', {
		'personal.email': 'Already registered for this event.'
	});

class Duplicate extends Error {}
class Full extends Error {}

/** Trusted path: Admin SDK, with duplicate and capacity checks. */
async function saveWithAdmin(doc: Registration, capacity: number | null) {
	const db = adminDb();
	const col = db.collection('registrations');
	const existing = await col
		.where('emailLower', '==', doc.emailLower)
		.where('event', '==', doc.event)
		.limit(5)
		.get();
	if (existing.docs.some((d) => d.get('status') !== 'rejected')) throw new Duplicate();

	if (capacity != null) {
		const count = await col
			.where('event', '==', doc.event)
			.where('status', 'in', ['pending', 'approved'])
			.count()
			.get();
		if (count.data().count >= capacity) throw new Full();
	}

	const batch = db.batch();
	batch.create(col.doc(doc.registrationId), doc);
	// set (not create): a rejected entry may register again
	batch.set(db.collection('registrationKeys').doc(registrationKeyId(doc.event, doc.emailLower)), {
		registrationId: doc.registrationId,
		event: doc.event,
		emailLower: doc.emailLower,
		createdAt: doc.createdAt
	});
	await batch.commit();
}

/**
 * Public path (no service account): a plain client write that firestore.rules
 * validates field by field. The registrationKeys doc makes duplicates fail.
 */
async function saveWithRules(reg: Registration) {
	const db = publicDb();
	const keyRef = doc(db, 'registrationKeys', registrationKeyId(reg.event, reg.emailLower));
	if ((await getDoc(keyRef)).exists()) throw new Duplicate();
	const batch = writeBatch(db);
	batch.set(doc(db, 'registrations', reg.registrationId), reg);
	batch.set(keyRef, {
		registrationId: reg.registrationId,
		event: reg.event,
		emailLower: reg.emailLower,
		createdAt: reg.createdAt
	});
	await batch.commit();
}

export const POST: RequestHandler = async ({ request, getClientAddress }) => {
	const useAdmin = hasAdminCredentials();
	if (!useAdmin && !hasPublicConfig()) {
		return fail(503, 'Registration is temporarily unavailable. Please try again shortly.');
	}
	if (!rateLimit(`register:${getClientAddress()}`, 8, 10 * 60_000)) {
		return fail(429, 'Too many attempts. Please wait a few minutes and try again.');
	}

	let body: unknown;
	try {
		body = await request.json();
	} catch {
		return fail(400, 'We could not read your registration. Please try again.');
	}

	const input = sanitizeRegistration(body);
	const config = await getSiteConfig({ fresh: true });
	const eventConfig = input.event ? config.events[input.event] : null;
	const errors = validateAll(input, eventConfig);
	if (Object.keys(errors).length || !input.event || !eventConfig) {
		return fail(422, 'Please fix the highlighted fields.', errors);
	}

	if (eventConfig.registrationDeadline) {
		const deadline = new Date(`${eventConfig.registrationDeadline}T23:59:59`);
		if (Date.now() > deadline.getTime()) return fail(409, 'Registration for this event has closed.');
	}

	const now = Date.now();
	for (let attempt = 0; attempt < 3; attempt++) {
		const reg: Registration = {
			...input,
			event: input.event,
			registrationId: registrationId(),
			emailLower: input.personal.email.toLowerCase(),
			status: 'pending',
			createdAt: now,
			updatedAt: now,
			reviewedBy: null
		};
		try {
			if (useAdmin) await saveWithAdmin(reg, eventConfig.capacity);
			else await saveWithRules(reg);
			return json({ ok: true, registrationId: reg.registrationId, createdAt: now });
		} catch (err) {
			if (err instanceof Duplicate) return DUPLICATE();
			if (err instanceof Full) return fail(409, 'This event is full. Registration is no longer available.');
			// ALREADY_EXISTS (admin) → ID collision, try another ID
			if ((err as { code?: number }).code === 6) continue;
			console.error('[register]', err);
			const code = (err as { code?: string }).code;
			if (code === 'permission-denied') {
				return fail(
					503,
					'Registration is not accepting entries right now. Organisers: publish firestore.rules in the Firebase console.'
				);
			}
			return fail(500, 'We could not save your registration. Please try again.');
		}
	}
	return fail(500, 'We could not save your registration. Please try again.');
};
