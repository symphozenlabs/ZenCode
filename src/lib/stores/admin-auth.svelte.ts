import { browser } from '$app/environment';
import {
	createUserWithEmailAndPassword,
	onAuthStateChanged,
	signInWithEmailAndPassword,
	signOut,
	type User
} from 'firebase/auth';
import { auth } from '$lib/firebase/auth';
import { ADMIN_EMAIL, ADMIN_PASSWORD } from '$lib/config/admin';

export type AuthStatus = 'loading' | 'signed-out' | 'not-admin' | 'admin' | 'unconfigured';

class AdminAuth {
	status = $state<AuthStatus>('loading');
	user = $state<User | null>(null);
	#started = false;

	/** Subscribe once to Firebase Auth and resolve admin membership. */
	start() {
		if (!browser || this.#started) return;
		this.#started = true;
		try {
			onAuthStateChanged(auth(), async (user) => {
				this.user = user;
				if (!user) {
					this.status = 'signed-out';
					return;
				}
				this.status = 'loading';
				this.status = (await this.#isAdmin(user)) ? 'admin' : 'not-admin';
			});
		} catch {
			this.status = 'unconfigured';
		}
	}

	async #isAdmin(user: User) {
		if (user.email?.toLowerCase() === ADMIN_EMAIL) return true;
		try {
			// Loaded on demand: the hard-coded admin never needs Firestore to sign in.
			const [{ doc, getDoc }, { db }] = await Promise.all([
				import('firebase/firestore'),
				import('$lib/firebase/client')
			]);
			const snap = await getDoc(doc(db(), 'admins', user.uid));
			return snap.exists();
		} catch {
			return false;
		}
	}

	async signIn(email: string, password: string) {
		if (email.toLowerCase() !== ADMIN_EMAIL || password !== ADMIN_PASSWORD) {
			throw Object.assign(new Error('bad-credentials'), { code: 'auth/invalid-credential' });
		}
		let cred;
		try {
			cred = await signInWithEmailAndPassword(auth(), ADMIN_EMAIL, ADMIN_PASSWORD);
		} catch (err) {
			const code = (err as { code?: string }).code;
			if (code !== 'auth/invalid-credential' && code !== 'auth/user-not-found') throw err;
			// First sign-in: create the Firebase Auth account for the hard-coded admin.
			try {
				cred = await createUserWithEmailAndPassword(auth(), ADMIN_EMAIL, ADMIN_PASSWORD);
			} catch (createErr) {
				if ((createErr as { code?: string }).code === 'auth/email-already-in-use') {
					throw Object.assign(new Error('admin-password-mismatch'), { code: 'zencode/admin-mismatch' });
				}
				throw createErr;
			}
		}
		const ok = await this.#isAdmin(cred.user);
		if (!ok) {
			await signOut(auth());
			throw Object.assign(new Error('not-admin'), { code: 'zencode/not-admin' });
		}
	}

	signOut() {
		return signOut(auth());
	}
}

export const adminAuth = new AdminAuth();

/** Map Firebase Auth error codes to plain language — never show raw errors. */
export function authErrorMessage(err: unknown): string {
	const code = (err as { code?: string })?.code ?? '';
	switch (code) {
		case 'auth/invalid-credential':
		case 'auth/wrong-password':
		case 'auth/user-not-found':
		case 'auth/invalid-email':
			return 'Email or password is incorrect.';
		case 'auth/too-many-requests':
			return 'Too many attempts. Wait a moment, then try again.';
		case 'auth/network-request-failed':
			return 'Network problem — check your connection.';
		case 'auth/user-disabled':
			return 'This account has been disabled.';
		case 'auth/operation-not-allowed':
			return 'Email/Password sign-in is turned off in Firebase (Authentication → Sign-in method).';
		case 'zencode/admin-mismatch':
			return 'The admin account exists in Firebase with a different password. Reset or delete it in the Firebase console.';
		case 'zencode/not-admin':
			return "This account doesn't have organiser access.";
		default:
			return 'Unable to sign in right now. Please try again.';
	}
}
