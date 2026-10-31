import { GameError, syncClock } from '$lib/games/tech-word-rush/api';
import type { DrawAction, DrawControl, DrawView, Op } from './types';
import type { PackId } from './words';

/**
 * Browser calls to the Scribble Showdown endpoints. Shares the clock offset
 * with the other games, so `serverNow()` and the Countdown work here too.
 */

const BASE = '/api/games/scribble/sessions';

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

// Admin ──────────────────────────────────────────────────────────────────

export interface DrawSettings {
	drawSeconds: number;
	turns: number;
	packs: PackId[];
	/** The host's own words, comma or line separated. */
	custom: string;
}

export const createSession = (token: string, settings: DrawSettings) => post<{ code: string }>(BASE, settings, token);

export const control = (token: string, code: string, action: DrawControl) => post<{ now: number }>(`${BASE}/${code}/control`, { action }, token);

// Participant ────────────────────────────────────────────────────────────

export interface Identity {
	playerId: string;
	token: string;
	name: string;
}

const key = (code: string) => `zencode:draw:${code}`;

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

export const play = (code: string, id: Identity, action: DrawAction, extra: { turn?: number; index?: number; text?: string } = {}) =>
	post<DrawView>(`${BASE}/${code}/play`, { playerId: id.playerId, token: id.token, action, ...extra });

/** Heartbeat: "this phone is still here". A 401 means the player was removed for going offline. */
export const ping = (code: string, id: Identity) =>
	post<{ now: number }>(`${BASE}/${code}/play`, { playerId: id.playerId, token: id.token, action: 'ping' });

/** The artist's strokes. `closed`: the turn is over, stop sending. Failures throw. */
export const sendStrokes = (code: string, id: Identity, turn: number, seq: number, ops: Op[]) =>
	post<{ now: number; closed?: boolean }>(`${BASE}/${code}/play`, { playerId: id.playerId, token: id.token, action: 'draw', turn, seq, ops });
