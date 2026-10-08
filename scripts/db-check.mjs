// End-to-end database check. Exercises the same Firestore calls the app makes
// (public registration form + admin), then removes everything it created.
//
//   npm run dev            (in another terminal)
//   npm run db:check       (optionally: BASE_URL=http://localhost:5173)
import { readFileSync, existsSync } from 'node:fs';
import { initializeApp } from 'firebase/app';
import { getAuth, signInWithEmailAndPassword, signOut } from 'firebase/auth';
import {
	getFirestore, collection, doc, getDoc, getDocs, addDoc, updateDoc, setDoc, deleteDoc,
	serverTimestamp, terminate
} from 'firebase/firestore';

if (existsSync('.env')) {
	for (const line of readFileSync('.env', 'utf8').split(/\r?\n/)) {
		const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
		if (m && !(m[1] in process.env)) process.env[m[1]] = m[2];
	}
}
const env = process.env;
const BASE = env.BASE_URL ?? 'http://localhost:5173';
const ADMIN_EMAIL = 'admin@gmail.com';
const ADMIN_PASSWORD = 'admin@123';
const COLLECTIONS = {
	hackathon: 'hackathon_registered_participants',
	'pitch-fest': 'pitchfest_registered_participants'
};

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
const created = []; // [collection, id]
let originalConfig;

/** Same payload shape as src/lib/components/registration/registration-db.js */
function payload(event, size) {
	const members = Array.from({ length: size }, (_, i) => ({
		memberNumber: i + 1,
		name: `Check Member ${i + 1}`,
		admissionNumber: `${marker}-${i + 1}`.toUpperCase(),
		email: `${marker}-${i + 1}@example.com`
	}));
	return {
		event,
		teamSize: size,
		teamLeader: {
			name: members[0].name,
			admissionNumber: members[0].admissionNumber,
			classSection: 'III CSE A',
			email: members[0].email
		},
		members,
		status: 'pending',
		registeredAt: serverTimestamp(),
		_searchAdmissionNumbers: members.map((m) => m.admissionNumber.toUpperCase()),
		_searchEmails: members.map((m) => m.email.toLowerCase())
	};
}

console.log(`\nZenCode database check — project ${env.PUBLIC_FIREBASE_PROJECT_ID}\n`);

// ---- Public (signed out), exactly like the registration form ----
await step('Public Hackathon registration', async () => {
	const ref = await addDoc(collection(db, COLLECTIONS.hackathon), payload('Hackathon', 3));
	created.push([COLLECTIONS.hackathon, ref.id]);
	ok(`Public Hackathon registration saved (${ref.id})`);
});
await step('Public Pitch Fest registration', async () => {
	const ref = await addDoc(collection(db, COLLECTIONS['pitch-fest']), payload('Pitch Fest', 2));
	created.push([COLLECTIONS['pitch-fest'], ref.id]);
	ok(`Public Pitch Fest registration saved (${ref.id})`);
});
await step('Duplicate check can read existing teams', async () => {
	const snap = await getDocs(collection(db, COLLECTIONS.hackathon));
	const hit = snap.docs.some((d) => (d.data()._searchEmails ?? []).includes(`${marker}-1@example.com`));
	if (!hit) throw new Error('new team not visible to the duplicate check');
	ok('Duplicate check sees the new team');
});

// ---- Admin ----
await step('Admin sign-in', async () => {
	const cred = await signInWithEmailAndPassword(auth, ADMIN_EMAIL, ADMIN_PASSWORD);
	ok(`Admin sign-in (${cred.user.email})`);
});

await step('Admin reads both collections', async () => {
	let total = 0;
	for (const [col, id] of created) {
		const snap = await getDocs(collection(db, col));
		total += snap.size;
		const d = snap.docs.find((x) => x.id === id)?.data();
		if (!d) throw new Error(`${id} missing from ${col}`);
		if (!d.registeredAt?.toMillis || d.status !== 'pending' || d.members.length !== d.teamSize) {
			throw new Error(`${id}: stored fields do not match`);
		}
	}
	ok(`Admin listener query returns ${total} team(s); new entries have timestamp, status and members`);
});

await step('Admin approves a team', async () => {
	const [col, id] = created[0];
	await updateDoc(doc(db, col, id), { status: 'approved', reviewedBy: ADMIN_EMAIL, reviewedAt: Date.now() });
	if ((await getDoc(doc(db, col, id))).data().status !== 'approved') throw new Error('status did not change');
	ok('Status update persisted (pending → approved)');
});

await step('Admin edits a team', async () => {
	const [col, id] = created[1];
	await updateDoc(doc(db, col, id), { 'teamLeader.classSection': 'IV CSE B' });
	if ((await getDoc(doc(db, col, id))).data().teamLeader.classSection !== 'IV CSE B') throw new Error('edit not saved');
	ok('Team edit persisted');
});

await step('Admin edits event settings → public site', async () => {
	const snap = await getDoc(doc(db, 'config', 'site'));
	originalConfig = snap.exists() ? snap.data() : null;
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

await step('Register page renders', async () => {
	const res = await fetch(`${BASE}/register`);
	const html = await res.text();
	if (res.status !== 200 || !html.includes('HACKATHON') || !html.includes('PITCH FEST')) {
		throw new Error(`status ${res.status}`);
	}
	ok('/register renders both registration forms');
});

console.log('\nCleaning up…');
await step('Restore config/site', async () => {
	if (originalConfig === undefined) return;
	if (originalConfig) await setDoc(doc(db, 'config', 'site'), originalConfig);
	else await deleteDoc(doc(db, 'config', 'site'));
	ok('config/site restored');
});
await step('Delete test registrations', async () => {
	for (const [col, id] of created) await deleteDoc(doc(db, col, id));
	ok(`Deleted ${created.length} test team(s)`);
});

await signOut(auth).catch(() => {});
await terminate(db);
console.log(failed ? `\n${failed} check(s) failed.\n` : '\nAll checks passed.\n');
process.exit(failed ? 1 : 0);
