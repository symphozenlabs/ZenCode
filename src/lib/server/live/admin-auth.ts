import { error, type RequestEvent } from '@sveltejs/kit';
import { getAuth } from 'firebase-admin/auth';
import { ADMIN_EMAIL } from '$lib/config/admin';
import { adminApp, adminDb, hasAdminCredentials } from '$lib/server/firebase-admin';

export interface AdminIdentity {
	uid: string;
	email: string | null;
}

/**
 * Verify a Firebase ID token and apply the same rule as `isAdmin()` in
 * firestore.rules: the organiser password account, or a doc at admins/{uid}.
 */
export async function verifyAdminToken(token: string): Promise<AdminIdentity | null> {
	if (!token || typeof token !== 'string' || token.length > 4096) return null;
	let decoded;
	try {
		decoded = await getAuth(adminApp()).verifyIdToken(token);
	} catch {
		return null;
	}
	const identity = { uid: decoded.uid, email: decoded.email ?? null };
	if (decoded.email?.toLowerCase() === ADMIN_EMAIL && decoded.firebase?.sign_in_provider === 'password') {
		return identity;
	}
	if (!hasAdminCredentials()) return null;
	try {
		const snap = await adminDb().collection('admins').doc(decoded.uid).get();
		return snap.exists ? identity : null;
	} catch (err) {
		console.error('[live] admin lookup failed', err);
		return null;
	}
}

/** Guard for admin API routes: `Authorization: Bearer <Firebase ID token>`. */
export async function requireAdmin(event: RequestEvent): Promise<AdminIdentity> {
	const header = event.request.headers.get('authorization') ?? '';
	const token = header.startsWith('Bearer ') ? header.slice(7) : '';
	const admin = await verifyAdminToken(token);
	if (!admin) error(401, 'Organiser sign-in required.');
	return admin;
}
