import type { ControlAction, PlayAction, PlayerView } from './types';

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
	return data as T;
}

/** Server clock minus local clock, so every screen counts down to the same instant. */
let clockOffset = 0;
export const syncClock = (serverNow: number) => (clockOffset = serverNow - Date.now());
export const serverNow = () => Date.now() + clockOffset;

// Admin ──────────────────────────────────────────────────────────────────

export const createSession = (token: string, duration: number) =>
	post<{ code: string; source: string }>(BASE, { duration }, token);

export async function control(token: string, code: string, action: ControlAction) {
	const res = await post<{ now: number }>(`${BASE}/${code}/control`, { action }, token);
	syncClock(res.now);
	return res;
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

export async function join(code: string, name: string): Promise<Identity> {
	const res = await post<Identity & { now: number }>(`${BASE}/${code}/join`, { name });
	syncClock(res.now);
	const id = { playerId: res.playerId, token: res.token, name: res.name };
	try {
		localStorage.setItem(key(code), JSON.stringify(id));
	} catch {
		/* still playable for this tab */
	}
	return id;
}

export async function play(
	code: string,
	id: Identity,
	action: PlayAction,
	extra: { expect?: number; answer?: string } = {}
): Promise<PlayerView> {
	const res = await post<PlayerView>(`${BASE}/${code}/play`, { playerId: id.playerId, token: id.token, action, ...extra });
	syncClock(res.now);
	return res;
}
