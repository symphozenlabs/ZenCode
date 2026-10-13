import { collection, deleteDoc, getDocs, query, where, writeBatch, type Firestore } from 'firebase/firestore';
import { adminDb } from '$lib/server/admin-session';
import { SESSIONS } from '$lib/games/tech-word-rush/types';

/**
 * Everything a game session keeps under `liveSessions/{code}` (all three
 * games). Firestore never deletes sub-collections with their parent, so each
 * is cleared by name.
 */
const SUBCOLLECTIONS = ['players', 'playerState', 'names', 'secret'] as const;
const BATCH = 450; // under Firestore's 500 writes per batch

async function deleteSession(db: Firestore, code: string) {
	for (const sub of SUBCOLLECTIONS) {
		const docs = (await getDocs(collection(db, SESSIONS, code, sub))).docs;
		for (let i = 0; i < docs.length; i += BATCH) {
			const batch = writeBatch(db);
			for (const d of docs.slice(i, i + BATCH)) batch.delete(d.ref);
			await batch.commit();
		}
	}
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
