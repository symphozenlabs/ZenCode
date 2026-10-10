import type { Firestore } from 'firebase-admin/firestore';
import type { LiveSession, SessionSummary, StoredParticipant, StoredResponse } from '$lib/live/types';

/**
 * Persistence for live sessions. Firestore in production; an in-memory store
 * when no Admin SDK credentials exist (local dev and tests). Only the server
 * touches these collections — firestore.rules deny all client access.
 *
 *   liveQuizSessions/{id}                       session + ordered slides
 *   liveQuizSessions/{id}/participants/{pid}    nickname, avatar, score, secret
 *   liveQuizSessions/{id}/responses/{slide_pid} one per participant per slide (create-only)
 *   liveQuizJoinCodes/{code}                    reserves a code while a session is open
 */
export interface LiveRepo {
	listSessions(): Promise<SessionSummary[]>;
	getSession(id: string): Promise<LiveSession | null>;
	putSession(session: LiveSession): Promise<void>;
	patchSession(id: string, patch: Partial<LiveSession>): Promise<void>;
	deleteSession(id: string): Promise<void>;
	/** Atomically reserve a join code; false if another open session holds it. */
	claimJoinCode(code: string, sessionId: string): Promise<boolean>;
	releaseJoinCode(code: string): Promise<void>;
	resolveJoinCode(code: string): Promise<string | null>;
	listParticipants(sessionId: string): Promise<StoredParticipant[]>;
	putParticipant(sessionId: string, p: StoredParticipant): Promise<void>;
	/** Batched score updates after a reveal or reset. */
	putParticipants(sessionId: string, list: StoredParticipant[]): Promise<void>;
	clearParticipants(sessionId: string): Promise<void>;
	listResponses(sessionId: string): Promise<StoredResponse[]>;
	/** Create-only: false if this participant already answered this slide. */
	createResponse(sessionId: string, r: StoredResponse): Promise<boolean>;
	deleteResponses(sessionId: string, slideId: string): Promise<void>;
	clearResponses(sessionId: string): Promise<void>;
}

const summary = (s: LiveSession): SessionSummary => ({
	id: s.id,
	title: s.title,
	status: s.status,
	joinCode: s.joinCode,
	slideCount: s.slides.length,
	updatedAt: s.updatedAt
});

export class MemoryRepo implements LiveRepo {
	#sessions = new Map<string, LiveSession>();
	#participants = new Map<string, Map<string, StoredParticipant>>();
	#codes = new Map<string, string>();
	#responses = new Map<string, Map<string, StoredResponse>>();

	async listSessions() {
		return [...this.#sessions.values()].sort((a, b) => b.updatedAt - a.updatedAt).map(summary);
	}
	async getSession(id: string) {
		const s = this.#sessions.get(id);
		return s ? structuredClone(s) : null;
	}
	async putSession(s: LiveSession) {
		this.#sessions.set(s.id, structuredClone(s));
	}
	async patchSession(id: string, patch: Partial<LiveSession>) {
		const s = this.#sessions.get(id);
		if (s) this.#sessions.set(id, { ...s, ...structuredClone(patch) });
	}
	async deleteSession(id: string) {
		this.#sessions.delete(id);
		this.#participants.delete(id);
		this.#responses.delete(id);
	}
	async claimJoinCode(code: string, sessionId: string) {
		if (this.#codes.has(code)) return false;
		this.#codes.set(code, sessionId);
		return true;
	}
	async releaseJoinCode(code: string) {
		this.#codes.delete(code);
	}
	async resolveJoinCode(code: string) {
		return this.#codes.get(code) ?? null;
	}
	async listParticipants(sessionId: string) {
		return [...(this.#participants.get(sessionId)?.values() ?? [])].map((p) => ({ ...p }));
	}
	async putParticipant(sessionId: string, p: StoredParticipant) {
		let m = this.#participants.get(sessionId);
		if (!m) this.#participants.set(sessionId, (m = new Map()));
		m.set(p.id, { ...p });
	}
	async putParticipants(sessionId: string, list: StoredParticipant[]) {
		for (const p of list) await this.putParticipant(sessionId, p);
	}
	async clearParticipants(sessionId: string) {
		this.#participants.delete(sessionId);
	}
	async listResponses(sessionId: string) {
		return [...(this.#responses.get(sessionId)?.values() ?? [])].map((r) => structuredClone(r));
	}
	async createResponse(sessionId: string, r: StoredResponse) {
		let m = this.#responses.get(sessionId);
		if (!m) this.#responses.set(sessionId, (m = new Map()));
		if (m.has(r.id)) return false;
		m.set(r.id, structuredClone(r));
		return true;
	}
	async deleteResponses(sessionId: string, slideId: string) {
		const m = this.#responses.get(sessionId);
		if (m) for (const [id, r] of m) if (r.slideId === slideId) m.delete(id);
	}
	async clearResponses(sessionId: string) {
		this.#responses.delete(sessionId);
	}
}

// Own collections: `liveSessions` belongs to the Tech Word Rush game, whose
// rules let anyone read a session doc. Quiz sessions hold the answers, so they
// live apart and are reached only through the server (Admin SDK).
const SESSIONS = 'liveQuizSessions';
const JOIN_CODES = 'liveQuizJoinCodes';

export class FirestoreRepo implements LiveRepo {
	constructor(private db: Firestore) {}

	#session = (id: string) => this.db.collection(SESSIONS).doc(id);
	#players = (id: string) => this.#session(id).collection('participants');
	#responses = (id: string) => this.#session(id).collection('responses');

	async listSessions() {
		const snap = await this.db
			.collection(SESSIONS)
			.orderBy('updatedAt', 'desc')
			.limit(200)
			.select('title', 'status', 'joinCode', 'slideCount', 'updatedAt')
			.get();
		return snap.docs.map((d) => ({
			id: d.id,
			title: d.get('title') ?? '',
			status: d.get('status') ?? 'draft',
			joinCode: d.get('joinCode') ?? null,
			slideCount: d.get('slideCount') ?? 0,
			updatedAt: d.get('updatedAt') ?? 0
		}));
	}
	async getSession(id: string) {
		const d = await this.#session(id).get();
		if (!d.exists) return null;
		const { slideCount: _, ...data } = d.data() as LiveSession & { slideCount?: number };
		return { ...data, id: d.id };
	}
	async putSession(s: LiveSession) {
		const { id, ...data } = s;
		await this.#session(id).set({ ...data, slideCount: s.slides.length });
	}
	async patchSession(id: string, patch: Partial<LiveSession>) {
		const { id: _, ...data } = patch;
		const extra = data.slides ? { slideCount: data.slides.length } : {};
		await this.#session(id).update({ ...data, ...extra });
	}
	async deleteSession(id: string) {
		await this.db.recursiveDelete(this.#session(id));
	}
	async claimJoinCode(code: string, sessionId: string) {
		try {
			await this.db.collection(JOIN_CODES).doc(code).create({ sessionId, createdAt: Date.now() });
			return true;
		} catch (err) {
			if ((err as { code?: number }).code === 6) return false; // ALREADY_EXISTS
			throw err;
		}
	}
	async releaseJoinCode(code: string) {
		await this.db.collection(JOIN_CODES).doc(code).delete();
	}
	async resolveJoinCode(code: string) {
		const d = await this.db.collection(JOIN_CODES).doc(code).get();
		return d.exists ? (d.get('sessionId') as string) : null;
	}
	async listParticipants(sessionId: string) {
		const snap = await this.#players(sessionId).get();
		return snap.docs.map((d) => ({ ...(d.data() as StoredParticipant), id: d.id }));
	}
	async putParticipant(sessionId: string, p: StoredParticipant) {
		const { id, ...data } = p;
		await this.#players(sessionId).doc(id).set(data);
	}
	async putParticipants(sessionId: string, list: StoredParticipant[]) {
		for (let i = 0; i < list.length; i += 400) {
			const batch = this.db.batch();
			for (const { id, ...data } of list.slice(i, i + 400)) batch.set(this.#players(sessionId).doc(id), data);
			await batch.commit();
		}
	}
	async clearParticipants(sessionId: string) {
		await this.db.recursiveDelete(this.#players(sessionId));
	}
	async listResponses(sessionId: string) {
		const snap = await this.#responses(sessionId).get();
		return snap.docs.map((d) => ({ ...(d.data() as StoredResponse), id: d.id }));
	}
	async createResponse(sessionId: string, r: StoredResponse) {
		const { id, ...data } = r;
		try {
			await this.#responses(sessionId).doc(id).create(data);
			return true;
		} catch (err) {
			if ((err as { code?: number }).code === 6) return false; // ALREADY_EXISTS
			throw err;
		}
	}
	async deleteResponses(sessionId: string, slideId: string) {
		const snap = await this.#responses(sessionId).where('slideId', '==', slideId).get();
		for (let i = 0; i < snap.docs.length; i += 400) {
			const batch = this.db.batch();
			snap.docs.slice(i, i + 400).forEach((d) => batch.delete(d.ref));
			await batch.commit();
		}
	}
	async clearResponses(sessionId: string) {
		await this.db.recursiveDelete(this.#responses(sessionId));
	}
}
