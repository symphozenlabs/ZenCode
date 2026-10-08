import { env } from '$env/dynamic/private';
import { cert, getApps, initializeApp, applicationDefault, type App } from 'firebase-admin/app';
import { getFirestore, type Firestore } from 'firebase-admin/firestore';

let app: App | undefined;

function credential() {
	if (env.FIREBASE_SERVICE_ACCOUNT) {
		return cert(JSON.parse(env.FIREBASE_SERVICE_ACCOUNT));
	}
	if (env.FIREBASE_PROJECT_ID && env.FIREBASE_CLIENT_EMAIL && env.FIREBASE_PRIVATE_KEY) {
		return cert({
			projectId: env.FIREBASE_PROJECT_ID,
			clientEmail: env.FIREBASE_CLIENT_EMAIL,
			privateKey: env.FIREBASE_PRIVATE_KEY.replace(/\n/g, '\n')
		});
	}
	return applicationDefault();
}

/** True when some form of Admin SDK credential is configured. */
export function hasAdminCredentials() {
	return Boolean(
		env.FIREBASE_SERVICE_ACCOUNT ||
			(env.FIREBASE_PROJECT_ID && env.FIREBASE_CLIENT_EMAIL && env.FIREBASE_PRIVATE_KEY) ||
			env.GOOGLE_APPLICATION_CREDENTIALS ||
			env.K_SERVICE // running on Google Cloud
	);
}

/** Server-only Firestore with Admin SDK privileges. Never import from client code. */
export function adminDb(): Firestore {
	if (!app) app = getApps()[0] ?? initializeApp({ credential: credential() });
	return getFirestore(app);
}
