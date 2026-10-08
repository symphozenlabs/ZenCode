import { env } from '$env/dynamic/public';
import { getApp, getApps, initializeApp, type FirebaseApp } from 'firebase/app';

let app: FirebaseApp | undefined;

/** Lazily initialise the browser Firebase app. */
export function firebaseApp(): FirebaseApp {
	if (app) return app;
	if (!env.PUBLIC_FIREBASE_API_KEY || !env.PUBLIC_FIREBASE_PROJECT_ID) {
		throw new Error('Firebase is not configured. Set the PUBLIC_FIREBASE_* variables.');
	}
	app = getApps().length
		? getApp()
		: initializeApp({
				apiKey: env.PUBLIC_FIREBASE_API_KEY,
				authDomain: env.PUBLIC_FIREBASE_AUTH_DOMAIN,
				projectId: env.PUBLIC_FIREBASE_PROJECT_ID,
				storageBucket: env.PUBLIC_FIREBASE_STORAGE_BUCKET,
				messagingSenderId: env.PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
				appId: env.PUBLIC_FIREBASE_APP_ID
			});
	return app;
}
