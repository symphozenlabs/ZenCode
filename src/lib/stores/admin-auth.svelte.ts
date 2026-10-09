import { browser } from '$app/environment';
import { onAuthStateChanged, signInWithEmailAndPassword, signOut, type User } from 'firebase/auth';
import { auth } from '$lib/firebase/auth';

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

	/** The server decides: the .env organiser account, or a user listed in /admins. */
	async #isAdmin(user: User) {
		try {
			const token = await user.getIdToken();
			const res = await fetch('/api/admin/check', { headers: { authorization: `Bearer ${token}` } });
			return res.ok;
		} catch {
			return false;
		}
	}

	async signIn(email: string, password: string) {
		let cred;
		try {
			cred = await signInWithEmailAndPassword(auth(), email, password);
		} catch (err) {
			const code = (err as { code?: string }).code;
			if (code !== 'auth/invalid-credential' && code !== 'auth/user-not-found') throw err;
			// First sign-in: the server creates the organiser account if this login matches .env.
			const res = await fetch('/api/admin/setup', {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ email, password })
			}).catch(() => null);
			if (!res?.ok) throw err;
			cred = await signInWithEmailAndPassword(auth(), email, password);
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
		case 'zencode/not-admin':
			return "This account doesn't have organiser access.";
		default:
			return 'Unable to sign in right now. Please try again.';
	}
}
