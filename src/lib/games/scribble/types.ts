import type { Difficulty, PackId } from './words';
import type { TournamentTag } from '$lib/games/tournament/types';

/**
 * Firestore shapes for a Scribble Showdown session. It shares the
 * `liveSessions` collection with the other live games, told apart by `gameType`.
 *
 *   liveSessions/{code}                          DrawSession — public read, server-only write
 *   liveSessions/{code}/players/{id}             DrawPlayer  — public get, admin list, server-only write
 *   liveSessions/{code}/turns/{turn}             TurnDoc     — public read (the word only once the turn ends)
 *   liveSessions/{code}/turns/{turn}/strokes/*   StrokeChunk — public read: the drawing, streamed
 *   liveSessions/{code}/turns/{turn}/guesses/*   GuessDoc    — public read: the guess feed (never a correct word)
 *   liveSessions/{code}/secret/{words|turn}      private     — server only (word pool, the current word)
 *   liveSessions/{code}/playerState/*            private     — server only (device token hash)
 *   liveSessions/{code}/names/*                  private     — server only (unique display names)
 *
 * One player draws per turn; everyone else guesses on their phone. Scores
 * are only added up when a turn ends, so the session doc every phone listens
 * to is written a handful of times per turn, never per guess.
 */

export const GAME_TYPE = 'scribble';
/** ZD… is Scribble Showdown. */
export const CODE_RE = /^ZD[A-Z2-9]{4}$/;

/** Drawing time per turn the host can pick, in seconds. */
export const DRAW_SECONDS = [60, 80, 100, 120] as const;
/** How many drawings a game has. */
export const TURN_COUNTS = [5, 8, 10, 15, 20] as const;

/** The artist has this long to pick a word, or the turn passes on. */
export const CHOOSE_MS = 15_000;
/** The word, the points and the leaderboard stay up this long between turns. */
export const REVEAL_MS = 9_000;
/** A turn the artist missed is announced this long. */
export const AWAY_MS = 4_000;
/** No ink this long into the turn: the artist has gone, end it. */
export const IDLE_MS = 25_000;
/** The artist's phone sends what it drew this often. */
export const FLUSH_MS = 250;
/** Every phone in the game says "still here" this often while it is open. */
export const HEARTBEAT_MS = 15_000;
/** No word from a phone for this long: the player has gone and is removed from the game. */
export const OFFLINE_MS = 60_000;

export type DrawStatus = 'lobby' | 'choosing' | 'drawing' | 'reveal' | 'finished';
/**
 * time = the clock ran out · all = everyone guessed · idle = nothing drawn ·
 * host = skipped · away = no word picked · offline = the artist went offline
 */
export type EndReason = 'time' | 'all' | 'idle' | 'host' | 'away' | 'offline';

export interface DrawRankEntry {
	id: string;
	name: string;
	score: number;
	rank: number;
	prevRank: number | null;
}

export interface TurnReveal {
	turn: number;
	/** Null when the artist never picked one. */
	word: string | null;
	drawerId: string;
	drawerName: string;
	difficulty: Difficulty | null;
	reason: EndReason;
	guessed: number;
	eligible: number;
	drawerPoints: number;
	masterpiece: boolean;
	/** Everyone who got it, fastest first, with what they earned (order bonus included). */
	gains: { id: string; name: string; points: number; bonus: number }[];
}

export interface DrawSession {
	code: string;
	gameType: typeof GAME_TYPE;
	status: DrawStatus;
	createdAt: number;
	createdBy: string;
	startedAt: number | null;
	endedAt: number | null;
	drawSeconds: number;
	totalTurns: number;
	packs: PackId[];
	customCount: number;
	playerCount: number;
	/** Grows every turn (and never resets), so each turn's strokes have their own path. */
	turn: number;
	/** The first turn of this game (after a restart, earlier turns belong to the last one). */
	firstTurn?: number;
	/** Turns in this game that reached drawing. */
	drawCount: number;
	drawerId: string | null;
	drawerName: string | null;
	difficulty: Difficulty | null;
	/** The word with hidden letters as `_` (spaces kept); the full word once revealed. */
	mask: string | null;
	phaseStartedAt: number | null;
	/** End of picking, drawing or the reveal. */
	phaseEndsAt: number | null;
	/** The artist has drawn something this turn. */
	inked: boolean;
	hintsShown: number;
	/** Players who could guess when drawing began. */
	eligible: number;
	/** Who has drawn in this cycle; everyone draws once before anyone draws twice. */
	drawnIds: string[];
	reveal: TurnReveal | null;
	leaderboard: DrawRankEntry[];
	winner: { name: string; score: number } | null;
	/** True while a finished turn's points are being added up. */
	scoring?: boolean;
	scoringAt?: number;
	/** How many times the host restarted this code. */
	resets?: number;
	/** The last players removed for going offline (the big screen announces them). */
	kicked?: { names: string[]; count: number; at: number } | null;
	/** Set when this session is one room of a tournament stage (players are seated by the tournament). */
	tournament?: TournamentTag;
}

export interface DrawPlayer {
	name: string;
	joinedAt: number;
	score: number;
	/** Turns in a row guessed right. */
	streak: number;
	guessed: number;
	drew: number;
}

export interface TurnDoc {
	turn: number;
	drawerId: string;
	drawerName: string;
	difficulty: Difficulty;
	startedAt: number;
	/** Set when the turn is scored. */
	word?: string;
	guessed?: number;
	scored?: boolean;
}

export interface GuessDoc {
	/** Player id. */
	pid: string;
	name: string;
	at: number;
	ok: boolean;
	/** Wrong guesses only, and only when clean. */
	text?: string | null;
	close?: boolean;
	/** Points for a correct guess (before the order bonus). */
	pts?: number;
	/** The streak this guess makes. */
	streak?: number;
}

export interface StrokeChunk {
	seq: number;
	ops: Op[];
	at: number;
}

/**
 * Drawing operations, in an 800×600 space every screen shares.
 *   s: stroke points (x, y pairs) for item `i`; later chunks append to it
 *   f: flood fill at (x, y)
 *   u: undo item `i`
 *   c: clear the canvas
 */
export type Op =
	| { t: 's'; i: number; c: number; w: number; p: number[] }
	| { t: 'f'; i: number; c: number; x: number; y: number }
	| { t: 'u'; i: number }
	| { t: 'c' };

export const CANVAS_W = 800;
export const CANVAS_H = 600;

export const PALETTE = [
	'#111827', '#ffffff', '#9ca3af', '#ef4444', '#f97316', '#facc15', '#84cc16',
	'#15803d', '#38bdf8', '#2563eb', '#8b5cf6', '#ec4899', '#92400e', '#fcd5b5'
] as const;
export const BRUSHES = [4, 10, 22, 44] as const;
/** The eraser paints white. */
export const WHITE = 1;

export interface WordOption {
	word: string;
	difficulty: Difficulty;
}

/** What the play endpoint returns to the participant. */
export interface DrawView {
	now: number;
	status: DrawStatus;
	turn: number;
	score: number;
	streak: number;
	isDrawer: boolean;
	/** The three words, while this player is picking. */
	options?: WordOption[];
	/** The word, for the artist and for anyone who has guessed it. */
	word?: string;
	/** Guessed right this turn. */
	guessed: boolean;
	/** For a guess. */
	result?: 'correct' | 'close' | 'wrong';
	points?: number;
	rejected?: string;
}

/** `sweep` removes players who have gone offline. */
export type DrawControl = 'sync' | 'start' | 'advance' | 'skip' | 'finish' | 'restart' | 'sweep';
/** `ping` is the phone's heartbeat. */
export type DrawAction = 'state' | 'choose' | 'draw' | 'guess' | 'advance' | 'ping';

export const drawDurationLabel = (seconds: number) => `${seconds} sec`;

/** In the shape the shared Leaderboard component draws. */
export const asRankEntries = (list: readonly DrawRankEntry[]) =>
	list.map((e) => ({ id: e.id, name: e.name, xp: e.score, correct: 0, rank: e.rank, prevRank: e.prevRank }));
