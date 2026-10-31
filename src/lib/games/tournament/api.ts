import { GameError } from '$lib/games/tech-word-rush/api';
import { saveIdentity as saveTwrIdentity } from '$lib/games/tech-word-rush/api';
import { saveIdentity as saveFlyIdentity } from '$lib/games/flappy/api';
import { saveIdentity as saveDrawIdentity } from '$lib/games/scribble/api';
import { playerHref } from '$lib/games/registry';
import type { GameSettings, TournamentControl, TournamentGame, TournamentPlayerView, TournamentRules } from './types';

/**
 * Browser calls to the tournament endpoints (the Firestore-run games'
 * tournaments; Word Heist's are created through its own API). Messages shown
 * to people come from the server's plain-language `message` or a fallback.
 */

const BASE = '/api/games/tournament/sessions';

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

export interface CreateTournament {
	game: TournamentGame;
	settings: GameSettings;
	rules: TournamentRules;
}

export const createTournament = (token: string, body: CreateTournament) => post<{ code: string }>(BASE, body, token);

export const control = (token: string, code: string, action: TournamentControl, extra: Record<string, unknown> = {}) =>
	post<{ now: number }>(`${BASE}/${code}/control`, { action, ...extra }, token);

// Participant ────────────────────────────────────────────────────────────

export interface Identity {
	playerId: string;
	token: string;
	name: string;
}

const key = (code: string) => `zencode:tour:${code}`;

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
	const id = { playerId: res.playerId, token: res.token, name: res.name };
	try {
		localStorage.setItem(key(code), JSON.stringify(id));
	} catch {
		/* still playable for this tab */
	}
	return id;
}

/** Check this device is still in the tournament (401 → it isn't). */
export const state = (code: string, id: Identity) => post<TournamentPlayerView>(`${BASE}/${code}/play`, { playerId: id.playerId, token: id.token, action: 'state' });

/**
 * Take the tournament identity into one of its rooms: the room's game was
 * seeded with the same player id and device token, so the game's own player
 * screen resumes as if the player had joined it. Returns the screen's URL.
 */
export function enterRoom(game: TournamentGame, roomCode: string, id: Identity): string {
	if (game === 'tech-word-rush') saveTwrIdentity(roomCode, id);
	else if (game === 'scribble') saveDrawIdentity(roomCode, id);
	else saveFlyIdentity(roomCode, id);
	return playerHref(game, roomCode);
}
