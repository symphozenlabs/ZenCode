import { collection, deleteDoc, getDocs, query, where, writeBatch, type Firestore } from 'firebase/firestore';
import { adminDb } from '$lib/server/admin-session';
import { SESSIONS } from '$lib/games/tech-word-rush/types';

/**
 * Everything a game session keeps under `liveSessions/{code}` (every game;
 * rooms, boards and rounds are Word Heist's). Firestore never deletes
 * sub-collections with their parent, so each is cleared by name — Scribble's
 * turns (each with its strokes and guesses) included.
 */
const SUBCOLLECTIONS = ['players', 'playerState', 'names', 'secret', 'rooms', 'boards', 'rounds'] as const;
const TURN_SUBCOLLECTIONS = ['strokes', 'guesses'] as const;
const BATCH = 450; // under Firestore's 500 writes per batch

async function deleteAll(db: Firestore, path: [string, ...string[]]) {
	const docs = (await getDocs(collection(db, ...path))).docs;
	for (let i = 0; i < docs.length; i += BATCH) {
		const batch = writeBatch(db);
		for (const d of docs.slice(i, i + BATCH)) batch.delete(d.ref);
		await batch.commit();
	}
}

async function deleteSession(db: Firestore, code: string) {
	for (const sub of SUBCOLLECTIONS) await deleteAll(db, [SESSIONS, code, sub]);
	// Every turn has a doc (written when its word is picked), so they can be listed.
	const turns = (await getDocs(collection(db, SESSIONS, code, 'turns'))).docs;
	for (const t of turns) {
		for (const sub of TURN_SUBCOLLECTIONS) await deleteAll(db, [SESSIONS, code, 'turns', t.id, sub]);
	}
	await deleteAll(db, [SESSIONS, code, 'turns']);
}

/**
 * Admin: permanently delete every finished game session — its leaderboard,
 * players, names and device tokens. Lobbies and running games are kept.
 */
export async function clearHistory(): Promise<{ deleted: number }> {
	const db = await adminDb();
	const finished = await getDocs(query(collection(db, SESSIONS), where('status', '==', 'finished')));
	for (const s of finished.docs) {
		// Children first: if this stops halfway, the session still lists and can be cleared again.
		await deleteSession(db, s.id);
		await deleteDoc(s.ref);
	}
	return { deleted: finished.size };
}
