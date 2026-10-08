// End-to-end database check. Exercises the same Firestore calls the app makes,
// then removes everything it created.
//
//   npm run dev            (in another terminal)
//   npm run db:check       (optionally: BASE_URL=http://localhost:5173)
import { readFileSync, existsSync } from 'node:fs';
import { initializeApp } from 'firebase/app';
import { getAuth, signInWithEmailAndPassword, signOut } from 'firebase/auth';
import {
	getFirestore, collection, doc, getDoc, getDocs, query, orderBy, limit,
	updateDoc, setDoc, deleteDoc, writeBatch, terminate
} from 'firebase/firestore';

if (existsSync('.env')) {
	for (const line of readFileSync('.env', 'utf8').split(/\r?\n/)) {
		const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
		if (m && !(m[1] in process.env)) process.env[m[1]] = m[2];
	}
}
const env = process.env;
const BASE = env.BASE_URL ?? 'http://localhost:5173';
const { ADMIN_EMAIL, ADMIN_PASSWORD } = await import('../src/lib/config/admin.ts').catch(() => ({
	ADMIN_EMAIL: 'admin@gmail.com',
	ADMIN_PASSWORD: 'admin@123'
}));

const app = initializeApp({
	apiKey: env.PUBLIC_FIREBASE_API_KEY,
	authDomain: env.PUBLIC_FIREBASE_AUTH_DOMAIN,
	projectId: env.PUBLIC_FIREBASE_PROJECT_ID,
	appId: env.PUBLIC_FIREBASE_APP_ID
});
const auth = getAuth(app);
const db = getFirestore(app);

let failed = 0;
const ok = (msg) => console.log(`  ✓ ${msg}`);
const bad = (msg, err) => {
	failed++;
	console.log(`  ✗ ${msg}${err ? ` — ${err.code ?? err.message ?? err}` : ''}`);
};
async function step(name, fn) {
	try {
		await fn();
	} catch (err) {
		bad(name, err);
	}
}

const marker = `db-check-${Date.now()}`;
const email = `${marker}@example.com`;
let regId = null;
let originalConfig;

console.log(`\nZenCode database check — project ${env.PUBLIC_FIREBASE_PROJECT_ID}\n`);

await step('Admin sign-in', async () => {
	const cred = await signInWithEmailAndPassword(auth, ADMIN_EMAIL, ADMIN_PASSWORD);
	ok(`Admin sign-in (${cred.user.email})`);
});

await step('Read config/site', async () => {
	const snap = await getDoc(doc(db, 'config', 'site'));
	originalConfig = snap.exists() ? snap.data() : null;
	ok(`Read config/site (${snap.exists() ? 'exists' : 'not created yet — defaults in use'})`);
});

await step('Public registration via /api/register', async () => {
	const res = await fetch(`${BASE}/api/register`, {
		method: 'POST',
		headers: { 'content-type': 'application/json' },
		body: JSON.stringify({
			event: 'hackathon',
			personal: { name: 'DB Check', email, phone: '+91 90000 00000' },
			academic: { college: 'Check College', department: 'CSE', year: '2nd year' },
			team: { name: 'Check Team', track: '', members: [{ name: 'Member Two', email: `two-${email}` }] }
		})
	});
	const body = await res.json();
	if (!body.ok) throw new Error(`${res.status} ${body.message}`);
	regId = body.registrationId;
	ok(`Public registration saved (${regId})`);
});

await step('Duplicate registration blocked', async () => {
	const res = await fetch(`${BASE}/api/register`, {
		method: 'POST',
		headers: { 'content-type': 'application/json' },
		body: JSON.stringify({
			event: 'hackathon',
			personal: { name: 'DB Check', email, phone: '+91 90000 00000' },
			academic: { college: 'Check College', department: 'CSE', year: '2nd year' },
			team: { name: 'Check Team', track: '', members: [{ name: 'Member Two', email: `two-${email}` }] }
		})
	});
	if (res.status !== 409) throw new Error(`expected 409, got ${res.status}`);
	ok('Duplicate registration blocked');
});

await step('Admin lists registrations (dashboard query)', async () => {
	const snap = await getDocs(query(collection(db, 'registrations'), orderBy('createdAt', 'desc'), limit(50)));
	const found = snap.docs.find((d) => d.id === regId);
	if (!found) throw new Error('new registration not returned by the query');
	const d = found.data();
	if (d.personal.email !== email || d.status !== 'pending' || d.team.members.length !== 1) {
		throw new Error('stored fields do not match what was submitted');
	}
	ok(`Admin query returns ${snap.size} registration(s), new entry fields match`);
});

await step('Admin approves registration', async () => {
	await updateDoc(doc(db, 'registrations', regId), { status: 'approved', updatedAt: Date.now(), reviewedBy: ADMIN_EMAIL });
	const back = await getDoc(doc(db, 'registrations', regId));
	if (back.data().status !== 'approved') throw new Error('status did not change');
	ok('Status update persisted (pending → approved)');
});

await step('Admin edits event settings → public site', async () => {
	await setDoc(doc(db, 'config', 'site'), { venue: marker }, { merge: true });
	// The public site caches settings for 30s, so poll for up to 40s.
	const start = Date.now();
	while (true) {
		const html = await (await fetch(`${BASE}/hackathon`)).text();
		if (html.includes(marker)) break;
		if (Date.now() - start > 40_000) throw new Error('public page never showed the saved venue');
		await new Promise((r) => setTimeout(r, 2000));
	}
	ok(`Settings saved by admin appear on the public site (after ${Math.round((Date.now() - start) / 1000)}s)`);
});

console.log('\nCleaning up…');
await step('Restore config/site', async () => {
	if (originalConfig) await setDoc(doc(db, 'config', 'site'), originalConfig);
	else await deleteDoc(doc(db, 'config', 'site'));
	ok('config/site restored');
});
await step('Delete test registration', async () => {
	if (!regId) return;
	const b = writeBatch(db);
	b.delete(doc(db, 'registrations', regId));
	b.delete(doc(db, 'registrationKeys', `hackathon__${email}`));
	await b.commit();
	ok(`Deleted ${regId} and its uniqueness key`);
});

await signOut(auth).catch(() => {});
await terminate(db);
console.log(failed ? `\n${failed} check(s) failed.\n` : '\nAll checks passed.\n');
process.exit(failed ? 1 : 0);
