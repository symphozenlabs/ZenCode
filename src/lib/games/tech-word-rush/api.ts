import type { ControlAction, PlayAction, PlayerView } from './types';
import type { WordQuestion } from './questions';

/**
 * Browser calls to the Tech Word Rush endpoints. Every message shown to a
 * person comes from the server's plain-language `message` or the fallback
 * here — never a raw Firebase error.
 */

const BASE = '/api/games/tech-word-rush/sessions';

export class GameError extends Error {
	constructor(
		message: string,
		readonly status: number
	) {
		super(message);
	}
}

async function post<T>(url: string, body: unknown, token?: string): Promise<T> {
	let res: Response;
	try {
		res = await fetch(url, {
			method: 'POST',
			headers: { 'content-type': 'application/json', accept: 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) },
			body: JSON.stringify(body)
		});
	} catch {
		throw new GameError('Network problem — check your connection and try again.', 0);
	}
	const data = await res.json().catch(() => ({}));
	if (!res.ok) throw new GameError(data?.message || 'Something went wrong. Please try again.', res.status);
	if (typeof data?.now === 'number') syncClock(data.now);
	return data as T;
}

/** Server clock minus local clock, so every screen counts down to the same instant. */
// Every reply stamps `now` just before it is sent, so (server now − arrival)
// is right to within the network delay however long the server took. (A
// midpoint estimate was tried and was off by many seconds under load: a busy
// server stamps late in a long round trip, not in the middle.)
let clockOffset = 0;
/** Align with a reply's `now` (also used by the Flappy Bird API, which shares this clock). */
export const syncClock = (serverNow: number) => (clockOffset = serverNow - Date.now());
export const serverNow = () => Date.now() + clockOffset;

// Admin ──────────────────────────────────────────────────────────────────

/** `questions` = a fixed set to play in order; omit it for a random pick from the bank. */
export const createSession = (token: string, duration: number, questions?: WordQuestion[]) =>
	post<{ code: string; source: string }>(BASE, { duration, ...(questions ? { questions } : {}) }, token);

/** `index`: for 'end', the word being revealed (a stale reveal is then ignored). */
export async function control(token: string, code: string, action: ControlAction, index?: number) {
	return post<{ now: number }>(`${BASE}/${code}/control`, { action, ...(index !== undefined ? { index } : {}) }, token);
}

// Participant ────────────────────────────────────────────────────────────

export interface Identity {
	playerId: string;
	token: string;
	name: string;
}

const key = (code: string) => `zencode:twr:${code}`;

export function loadIdentity(code: string): Identity | null {
	try {
		const v = JSON.parse(localStorage.getItem(key(code)) ?? 'null');
		return v && typeof v.playerId === 'string' && typeof v.token === 'string' ? v : null;
	} catch {
		return null;
	}
}

export function forgetIdentity(code: string) {
	try {
		localStorage.removeItem(key(code));
	} catch {
		/* storage unavailable */
	}
}

/** Remember this device's player for `code` (a join, or a tournament seating the player here). */
export function saveIdentity(code: string, id: Identity) {
	try {
		localStorage.setItem(key(code), JSON.stringify(id));
	} catch {
		/* still playable for this tab */
	}
}

export async function join(code: string, name: string): Promise<Identity> {
	const res = await post<Identity & { now: number }>(`${BASE}/${code}/join`, { name });
	const id = { playerId: res.playerId, token: res.token, name: res.name };
	saveIdentity(code, id);
	return id;
}

export async function play(
	code: string,
	id: Identity,
	action: PlayAction,
	extra: { expect?: number; answer?: string } = {}
): Promise<PlayerView> {
	return post<PlayerView>(`${BASE}/${code}/play`, { playerId: id.playerId, token: id.token, action, ...extra });
}
