import type { FlyGame } from './skins';
import type { TournamentTag } from '$lib/games/tournament/types';

/**
 * Firestore shapes for a Flappy Bird or Soar & Roar session (same game,
 * different skin). It shares the `liveSessions`
 * collection (and its rules) with Tech Word Rush, told apart by `gameType`.
 *
 *   liveSessions/{code}                 FlapSession — public read, server-only write
 *   liveSessions/{code}/players/{id}    FlapPlayer  — public get, admin list, server-only write
 *   liveSessions/{code}/playerState/*   private     — server only (device token hash)
 *   liveSessions/{code}/names/*         private     — server only (unique display names)
 *
 * Players fly as many times as they like while the timer runs; their best
 * flight is the one that counts (40 then 30 stays 40).
 *
 * Built for a full room (a few hundred phones): joining never writes the
 * session doc every phone listens to, and a flight is two writes to the
 * player's own doc (start, land).
 */

/** ZF… is Flappy Bird, ZS… is Soar & Roar. */
export const CODE_RE = /^Z[FS][A-Z2-9]{4}$/;
/** Round window lengths the admin can pick, in seconds. */
export const DURATIONS = [60, 120, 180, 300, 600] as const;

export type FlapStatus = 'lobby' | 'playing' | 'finished';

export interface FlapRankEntry {
	id: string;
	name: string;
	score: number;
	rounds: number;
	rank: number;
}

export interface FlapSession {
	code: string;
	gameType: FlyGame;
	status: FlapStatus;
	createdAt: number;
	createdBy: string;
	startedAt: number | null;
	endedAt: number | null;
	/** Length of the play window in seconds. */
	duration: number;
	/** Server time (ms) when flights close. */
	timerEndsAt: number | null;
	/** Filled in when the game starts and ends (the presenter counts live). */
	playerCount: number;
	leaderboard: FlapRankEntry[];
	winner: { name: string; score: number } | null;
	/** True while the final scores are being counted. */
	ranking?: boolean;
	/** How many times the host restarted this code; phones clear their last flight when it changes. */
	resets?: number;
	/** Set when this session is one room of a tournament stage (players are seated by the tournament). */
	tournament?: TournamentTag;
}

export interface FlapPlayer {
	name: string;
	joinedAt: number;
	/** Best flight so far. */
	score: number;
	/** When that best was reached (earlier wins a tie). */
	scoredAt: number | null;
	rounds: number;
	flying: boolean;
	/** Number of the latest flight. */
	round: number;
	/** Server time the flight in the air began; null when landed. */
	flightStartedAt: number | null;
}

/** What the play endpoint returns to the participant. */
export interface FlapView {
	now: number;
	status: FlapStatus;
	/** Number of the current/last flight; send it back with its score. */
	round: number;
	/** Best flight so far. */
	score: number;
	rounds: number;
	flying: boolean;
	/** The flight's score as saved, when a flight was just submitted (may be capped). */
	saved?: number;
	rejected?: string;
}

/** `restart` sends the same code back to the lobby with every score cleared; players stay joined. */
export type FlapControl = 'sync' | 'start' | 'finish' | 'restart';
export type FlapAction = 'state' | 'start' | 'end';

export const formatClock = (ms: number) => {
	const total = Math.max(0, Math.ceil(ms / 1000));
	return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
};

export const durationLabel = (seconds: number) => (seconds % 60 ? `${seconds} seconds` : `${seconds / 60} minute${seconds === 60 ? '' : 's'}`);

/** In the shape the shared Leaderboard component draws (score shown as its value). */
export const asRankEntries = (list: readonly FlapRankEntry[]) =>
	list.map((e) => ({ id: e.id, name: e.name, xp: e.score, correct: e.rounds, rank: e.rank, prevRank: null }));
