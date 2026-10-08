// Grant (or revoke) ZenCode organiser access for an existing Firebase Auth user.
//
//   npm run grant-admin -- organiser@example.com
//   npm run grant-admin -- organiser@example.com --revoke
//
// Reads Admin SDK credentials from .env (same variables as the server).
import { readFileSync, existsSync } from 'node:fs';
import { cert, initializeApp, applicationDefault } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';

if (existsSync('.env')) {
	for (const line of readFileSync('.env', 'utf8').split(/\r?\n/)) {
		const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
		if (m && !(m[1] in process.env)) process.env[m[1]] = m[2].replace(/^(['"])(.*)\1$/, '$2');
	}
}

const [email, flag] = process.argv.slice(2);
if (!email) {
	console.error('Usage: npm run grant-admin -- <email> [--revoke]');
	process.exit(1);
}

const env = process.env;
const credential = env.FIREBASE_SERVICE_ACCOUNT
	? cert(JSON.parse(env.FIREBASE_SERVICE_ACCOUNT))
	: env.FIREBASE_PROJECT_ID && env.FIREBASE_CLIENT_EMAIL && env.FIREBASE_PRIVATE_KEY
		? cert({
				projectId: env.FIREBASE_PROJECT_ID,
				clientEmail: env.FIREBASE_CLIENT_EMAIL,
				privateKey: env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n')
			})
		: applicationDefault();

initializeApp({ credential });

try {
	const user = await getAuth().getUserByEmail(email);
	const ref = getFirestore().collection('admins').doc(user.uid);
	if (flag === '--revoke') {
		await ref.delete();
		console.log(`Revoked organiser access for ${email}`);
	} else {
		await ref.set({ email: user.email, grantedAt: FieldValue.serverTimestamp() });
		console.log(`Granted organiser access to ${email} (uid ${user.uid})`);
	}
} catch (err) {
	if (err?.code === 'auth/user-not-found') {
		console.error(`No Firebase Auth user with email ${email}. Create it first in the Firebase console (Authentication → Users).`);
	} else {
		console.error(err?.message ?? err);
	}
	process.exit(1);
}
