import { getAuth, type Auth } from 'firebase/auth';
import { firebaseApp } from './app';

/** Firebase Auth only — kept separate so the login page doesn't load Firestore. */
export const auth = (): Auth => getAuth(firebaseApp());
