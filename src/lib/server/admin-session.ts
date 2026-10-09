import { env as priv } from '$env/dynamic/private';
import { env as pub } from '$env/dynamic/public';
import { error } from '@sveltejs/kit';
import { timingSafeEqual } from 'node:crypto';
import { getApp, initializeApp, type FirebaseApp } from 'firebase/app';
import {
	connectAuthEmulator,
	createUserWithEmailAndPassword,
	getAuth,
	signInWithEmailAndPassword,
	type Auth
} from 'firebase/auth';
import { connectFirestoreEmulator, doc, getDoc, getFirestore, type Firestore } from 'firebase/firestore';

/**
 * The server's own Firebase session, signed in as the organiser account from
 * ADMIN_EMAIL / ADMIN_PASSWORD in .env. Live games run through it: every write
 * is still checked by firestore.rules `isAdmin()`, and the credentials never
 * reach the browser.
 */
const APP_NAME = 'zencode-server-admin';

export const NOT_CONFIGURED = 'Live games need ADMIN_EMAIL and ADMIN_PASSWORD in .env. Add them and restart the server.';

const adminEmail = () => (priv.ADMIN_EMAIL ?? '').trim().toLowerCase();

export function adminConfigured() {
	return Boolean(adminEmail() && priv.ADMIN_PASSWORD && pub.PUBLIC_FIREBASE_API_KEY && pub.PUBLIC_FIREBASE_PROJECT_ID);
}

function app(): FirebaseApp {
	try {
		return getApp(APP_NAME);
	} catch {
		const created = initializeApp(
			{
				apiKey: pub.PUBLIC_FIREBASE_API_KEY,
				authDomain: pub.PUBLIC_FIREBASE_AUTH_DOMAIN,
				projectId: pub.PUBLIC_FIREBASE_PROJECT_ID,
				appId: pub.PUBLIC_FIREBASE_APP_ID
			},
			APP_NAME
		);
		// Local testing against the Firebase emulators.
		if (priv.FIREBASE_AUTH_EMULATOR_HOST) {
			connectAuthEmulator(getAuth(created), `http://${priv.FIREBASE_AUTH_EMULATOR_HOST}`, { disableWarnings: true });
		}
		if (priv.FIRESTORE_EMULATOR_HOST) {
			const [host, port] = priv.FIRESTORE_EMULATOR_HOST.split(':');
			connectFirestoreEmulator(getFirestore(created), host, Number(port));
		}
		return created;
	}
}

/** Sign in, creating the organiser account on first use. */
async function signIn(auth: Auth) {
	const email = adminEmail();
	const password = priv.ADMIN_PASSWORD ?? '';
	try {
		await signInWithEmailAndPassword(auth, email, password);
	} catch (err) {
		const code = (err as { code?: string }).code;
		if (code !== 'auth/invalid-credential' && code !== 'auth/user-not-found') throw err;
		try {
			await createUserWithEmailAndPassword(auth, email, password);
		} catch (createErr) {
			if ((createErr as { code?: string }).code === 'auth/email-already-in-use') {
				throw new Error('ADMIN_PASSWORD in .env does not match the Firebase account for ADMIN_EMAIL.');
			}
			throw createErr;
		}
	}
}

let session: Promise<Firestore> | null = null;

/** Firestore signed in as the organiser. Retries sign-in after a failure. */
export function adminDb(): Promise<Firestore> {
	if (!adminConfigured()) error(503, NOT_CONFIGURED);
	const a = app();
	const auth = getAuth(a);
	if (session && auth.currentUser) return session;
	session = signIn(auth)
		.then(() => getFirestore(a))
		.catch((err) => {
			session = null;
			console.error('[admin-session] sign-in failed:', err);
			error(503, 'The server could not sign in to Firebase. Check ADMIN_EMAIL and ADMIN_PASSWORD in .env.');
		});
	return session;
}

/** True when the typed credentials match .env (constant-time). */
export function matchesAdminCredentials(email: string, password: string) {
	if (!adminConfigured()) return false;
	const a = Buffer.from(`${email.trim().toLowerCase()}\n${password}`);
	const b = Buffer.from(`${adminEmail()}\n${priv.ADMIN_PASSWORD}`);
	return a.length === b.length && timingSafeEqual(a, b);
}

// ── Verifying a signed-in browser user ───────────────────────────────────

interface VerifiedUser {
	uid: string;
	email: string;
	provider: string;
}

function decodePayload(token: string): Record<string, unknown> {
	try {
		return JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString('utf8'));
	} catch {
		return {};
	}
}

/** Check a Firebase ID token with Google's Identity Toolkit (no service account needed). */
async function verifyIdToken(idToken: string): Promise<VerifiedUser | null> {
	const base = priv.FIREBASE_AUTH_EMULATOR_HOST
		? `http://${priv.FIREBASE_AUTH_EMULATOR_HOST}/identitytoolkit.googleapis.com`
		: 'https://identitytoolkit.googleapis.com';
	const res = await fetch(`${base}/v1/accounts:lookup?key=${pub.PUBLIC_FIREBASE_API_KEY}`, {
		method: 'POST',
		headers: { 'content-type': 'application/json' },
		body: JSON.stringify({ idToken })
	}).catch(() => null);
	if (!res?.ok) return null;
	const user = ((await res.json()) as { users?: { localId: string; email?: string }[] }).users?.[0];
	if (!user) return null;
	// The token was accepted above, so its claims can be trusted.
	const claims = decodePayload(idToken) as { aud?: string; firebase?: { sign_in_provider?: string } };
	if (claims.aud !== pub.PUBLIC_FIREBASE_PROJECT_ID) return null;
	return { uid: user.localId, email: (user.email ?? '').toLowerCase(), provider: claims.firebase?.sign_in_provider ?? '' };
}

/** Same organiser check as firestore.rules `isAdmin()`. */
export async function isAdminUser(user: VerifiedUser): Promise<boolean> {
	if (user.email === adminEmail() && user.provider === 'password') return true;
	const snap = await getDoc(doc(await adminDb(), 'admins', user.uid));
	return snap.exists();
}

/** Verify `Authorization: Bearer <Firebase ID token>` belongs to an organiser. */
export async function requireAdmin(request: Request): Promise<{ uid: string; email: string }> {
	if (!adminConfigured()) error(503, NOT_CONFIGURED);
	const header = request.headers.get('authorization') ?? '';
	const token = header.startsWith('Bearer ') ? header.slice(7) : '';
	const user = token ? await verifyIdToken(token) : null;
	if (!user) error(401, 'Your session expired. Sign in again.');
	if (!(await isAdminUser(user))) error(403, "This account doesn't have organiser access.");
	return { uid: user.uid, email: user.email };
}

export async function requireServerCredentials() {
	if (!adminConfigured()) error(503, NOT_CONFIGURED);
}
