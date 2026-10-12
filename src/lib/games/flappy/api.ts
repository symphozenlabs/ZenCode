import { GameError, syncClock } from '$lib/games/tech-word-rush/api';
import type { FlapAction, FlapControl, FlapView } from './types';

/**
 * Browser calls to the Flappy Bird endpoints. Shares the clock offset with
 * Tech Word Rush, so `serverNow()` and the Countdown work for both games.
 */

const BASE = '/api/games/flappy/sessions';

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

// Admin ──────────────────────────────────────────────────────────────────

export const createSession = (token: string, duration: number) => post<{ code: string }>(BASE, { duration }, token);

export async function control(token: string, code: string, action: FlapControl) {
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

const key = (code: string) => `zencode:flappy:${code}`;

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

export async function play(code: string, id: Identity, action: FlapAction, extra: { round?: number; score?: number } = {}): Promise<FlapView> {
	const res = await post<FlapView>(`${BASE}/${code}/play`, { playerId: id.playerId, token: id.token, action, ...extra });
	syncClock(res.now);
	return res;
}
