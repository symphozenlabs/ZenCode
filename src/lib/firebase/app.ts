import { env } from '$env/dynamic/public';
import { getApp, getApps, initializeApp, type FirebaseApp } from 'firebase/app';

let app: FirebaseApp | undefined;

/** Lazily initialise the browser Firebase app. */
export function firebaseApp(): FirebaseApp {
	if (app) return app;
	if (!env.VITE_FIREBASE_API_KEY || !env.VITE_FIREBASE_PROJECT_ID) {
		throw new Error('Firebase is not configured. Set the VITE_FIREBASE_* variables.');
	}
	app = getApps().length
		? getApp()
		: initializeApp({
				apiKey: env.VITE_FIREBASE_API_KEY,
				authDomain: env.VITE_FIREBASE_AUTH_DOMAIN,
				projectId: env.VITE_FIREBASE_PROJECT_ID,
				storageBucket: env.VITE_FIREBASE_STORAGE_BUCKET,
				messagingSenderId: env.VITE_FIREBASE_MESSAGING_SENDER_ID,
				appId: env.VITE_FIREBASE_APP_ID
			});
	return app;
}
