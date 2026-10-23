import { collection, getDocs, limit, onSnapshot, orderBy, query, where } from 'firebase/firestore';
import { db } from '$lib/firebase/client';
import { SESSIONS } from '$lib/games/tech-word-rush/types';
import type { GuessDoc, Op, StrokeChunk, TurnDoc } from './types';

/** Firestore listeners for one turn's drawing and guesses (browser only). */

export interface Chunk {
	id: string;
	seq: number;
	ops: Op[];
}

const bySeq = (a: Chunk, b: Chunk) => a.seq - b.seq || (a.id < b.id ? -1 : 1);
const strokesOf = (code: string, turn: number) => collection(db(), SESSIONS, code, 'turns', String(turn), 'strokes');

/** Every chunk of the turn's drawing, in drawing order, each time one arrives. */
export function listenStrokes(code: string, turn: number, onchunks: (chunks: Chunk[]) => void, onerror?: () => void) {
	const chunks = new Map<string, Chunk>();
	return onSnapshot(
		strokesOf(code, turn),
		(snap) => {
			for (const ch of snap.docChanges()) {
				if (ch.type === 'removed') chunks.delete(ch.doc.id);
				else {
					const d = ch.doc.data() as StrokeChunk;
					chunks.set(ch.doc.id, { id: ch.doc.id, seq: d.seq, ops: d.ops });
				}
			}
			onchunks([...chunks.values()].sort(bySeq));
		},
		() => onerror?.()
	);
}

/** One finished drawing, for the gallery. */
export async function loadStrokes(code: string, turn: number): Promise<Chunk[]> {
	const snap = await getDocs(strokesOf(code, turn));
	return snap.docs.map((d) => ({ id: d.id, ...(d.data() as StrokeChunk) })).sort(bySeq);
}

export type Guess = GuessDoc & { id: string };

/**
 * The turn's guesses, newest first. `correctOnly` is what phones use (who got
 * it); the big screen gets the whole feed, wrong guesses included.
 */
export function listenGuesses(code: string, turn: number, opts: { correctOnly?: boolean; max?: number }, onguesses: (guesses: Guess[]) => void) {
	const col = collection(db(), SESSIONS, code, 'turns', String(turn), 'guesses');
	const q = opts.correctOnly ? query(col, where('ok', '==', true)) : query(col, orderBy('at', 'desc'), limit(opts.max ?? 40));
	return onSnapshot(
		q,
		(snap) => onguesses(snap.docs.map((d) => ({ id: d.id, ...(d.data() as GuessDoc) })).sort((a, b) => b.at - a.at)),
		() => {}
	);
}

/** Turns of this game that were drawn and scored, oldest first. */
export async function loadTurns(code: string, fromTurn: number): Promise<TurnDoc[]> {
	const snap = await getDocs(collection(db(), SESSIONS, code, 'turns'));
	return snap.docs
		.map((d) => d.data() as TurnDoc)
		.filter((t) => t.turn >= fromTurn && t.scored && t.word)
		.sort((a, b) => a.turn - b.turn);
}
