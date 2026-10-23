import { GameError } from '$lib/games/tech-word-rush/api';
import { liveApi } from '$lib/live/origin';
import type { HeistRules, ModerationConfig } from './types';

/**
 * Word Heist HTTP calls: creating a tournament (on the live server) and the
 * moderation settings. Playing and running a tournament go over the socket
 * (client.svelte.ts).
 */

const BASE = '/api/games/word-heist';

async function send<T>(method: string, url: string, body?: unknown, token?: string): Promise<T> {
	let res: Response;
	try {
		res = await fetch(url, {
			method,
			headers: { accept: 'application/json', ...(body ? { 'content-type': 'application/json' } : {}), ...(token ? { authorization: `Bearer ${token}` } : {}) },
			body: body ? JSON.stringify(body) : undefined
		});
	} catch {
		throw new GameError('Could not reach the live server — check your connection (and that the live server is running).', 0);
	}
	const data = await res.json().catch(() => ({}));
	if (!res.ok) throw new GameError(data?.message || 'Something went wrong. Please try again.', res.status);
	return data as T;
}

/** Opens the tournament on the live server (VITE_LIVE_ORIGIN, or this host). */
export const createTournament = (token: string, rules: HeistRules) => send<{ code: string }>('POST', liveApi('/heist'), { rules }, token);

export const getModeration = (token: string) => send<ModerationConfig>('GET', `${BASE}/moderation`, undefined, token);
export const saveModeration = (token: string, config: Pick<ModerationConfig, 'blocklist' | 'detectObfuscation'>) =>
	send<ModerationConfig>('PUT', `${BASE}/moderation`, config, token);
export const testWord = (token: string, word: string) => send<{ ok: boolean; message: string }>('POST', `${BASE}/moderation`, { word }, token);

// Participant identity (device token, no account) ─────────────────────────

export interface Identity {
	playerId: string;
	token: string;
	name: string;
}

const key = (code: string) => `zencode:heist:${code}`;

export function loadIdentity(code: string): Identity | null {
	try {
		const v = JSON.parse(localStorage.getItem(key(code)) ?? 'null');
		return v && typeof v.playerId === 'string' && typeof v.token === 'string' ? v : null;
	} catch {
		return null;
	}
}

export function saveIdentity(code: string, id: Identity) {
	try {
		localStorage.setItem(key(code), JSON.stringify(id));
	} catch {
		/* still playable in this tab */
	}
}

export function forgetIdentity(code: string) {
	try {
		localStorage.removeItem(key(code));
	} catch {
		/* storage unavailable */
	}
}

export const newRequestId = () =>
	typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
