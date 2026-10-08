import { env } from '$env/dynamic/public';
import { getApp, initializeApp, type FirebaseApp } from 'firebase/app';
import { getFirestore, type Firestore } from 'firebase/firestore';

const APP_NAME = 'zencode-server-public';

/**
 * Unauthenticated Firebase client used on the server when no Admin SDK
 * credentials are configured. Everything it does is limited by
 * firestore.rules exactly like an anonymous browser would be.
 */
export function publicDb(): Firestore {
	if (!env.PUBLIC_FIREBASE_API_KEY || !env.PUBLIC_FIREBASE_PROJECT_ID) {
		throw new Error('Firebase is not configured. Set the PUBLIC_FIREBASE_* variables.');
	}
	let app: FirebaseApp;
	try {
		app = getApp(APP_NAME);
	} catch {
		app = initializeApp(
			{
				apiKey: env.PUBLIC_FIREBASE_API_KEY,
				authDomain: env.PUBLIC_FIREBASE_AUTH_DOMAIN,
				projectId: env.PUBLIC_FIREBASE_PROJECT_ID,
				appId: env.PUBLIC_FIREBASE_APP_ID
			},
			APP_NAME
		);
	}
	return getFirestore(app);
}

export function hasPublicConfig() {
	return Boolean(env.PUBLIC_FIREBASE_API_KEY && env.PUBLIC_FIREBASE_PROJECT_ID);
}
