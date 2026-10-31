import type { FlyGame } from '$lib/games/flappy/skins';
import type { DrawSettings } from '$lib/games/scribble/api';
import type { AllocationLimits, Stage } from '$lib/games/word-heist/allocation';

/**
 * Tournaments for the Firestore-run games (Tech Word Rush, Flappy Bird,
 * Soar & Roar, Scribble Showdown). Word Heist has its own tournament engine
 * on the live server (see docs/word-heist.md); the Tournament module on the
 * Games page offers both.
 *
 *   liveSessions/{code}                  TournamentSession — public get, server-only write
 *   liveSessions/{code}/players/{id}     TournamentPlayer  — public get, admin list, server-only write
 *   liveSessions/{code}/stages/{n}       StageResult       — organisers only
 *   liveSessions/{code}/playerState/*    private           — server only (device token hash)
 *   liveSessions/{code}/names/*          private           — server only (unique display names)
 *
 * Every stage is made of real game sessions (one per room) created with the
 * game's own settings and run by the game's own rules and presenter. The
 * tournament pre-seats its players in them: one QR code, one name, one
 * device token for the whole tournament. Those child sessions carry a
 * `tournament` tag so the Games page lists them under the tournament.
 */

export const GAME_TYPE = 'tournament';
export const CODE_RE = /^ZT[A-Z2-9]{4}$/;

/** Games a tournament can run here (Word Heist runs its own). */
export type TournamentGame = 'tech-word-rush' | FlyGame | 'scribble';
export const TOURNAMENT_GAMES: readonly TournamentGame[] = ['tech-word-rush', 'flappy', 'symba', 'scribble'];
export const isTournamentGame = (v: unknown): v is TournamentGame => TOURNAMENT_GAMES.includes(v as TournamentGame);

/**
 *  elimination  whole-room games (everyone plays the same game on one screen):
 *               every stage is one game; the top of the leaderboard goes
 *               through, the last stage is the final
 *  rooms        small-group games: players are split into rooms of a chosen
 *               size, the top N of each room go through, the final is one room
 */
export type TournamentFormat = 'elimination' | 'rooms';
export const FORMAT_OF: Record<TournamentGame, TournamentFormat> = {
	'tech-word-rush': 'elimination',
	flappy: 'elimination',
	symba: 'elimination',
	scribble: 'rooms'
};

export const MAX_STAGES = 5;
/** Most players any of these games takes in one session. */
export const MAX_PLAYERS = 300;

/** Elimination: how many play the final. */
export const FINALIST_LIMITS = [3, 100] as const;
export const DEFAULT_FINALISTS = 10;

/** Rooms (Scribble Showdown): a room needs 2+ players; beyond 12 not everyone gets to draw. */
export const ROOMS_LIMITS: AllocationLimits = { roomMin: 2, roomMax: 12, maxStages: MAX_STAGES, maxPlayers: MAX_PLAYERS };
export const DEFAULT_ROOM_SIZE = 8;

/** Tech Word Rush: words played in each stage (picked from the bank, no repeats across stages). */
export const WORDS_PER_STAGE = [5, 8, 10, 15] as const;

export interface EliminationRules {
	format: 'elimination';
	/** Registrations accepted. */
	maxPlayers: number;
	/** Stages, the final included (2–MAX_STAGES). */
	stages: number;
	/** Players in the final. */
	finalists: number;
}

export interface RoomsRules {
	format: 'rooms';
	maxPlayers: number;
	stages: number;
	/** Most players in one room. */
	roomSize: number;
	/** Players who go through from each room. */
	advance: number;
}

export type TournamentRules = EliminationRules | RoomsRules;

export interface TwrSettings {
	/** Seconds per word. */
	duration: number;
	/** Words per stage. */
	words: number;
}
export interface FlySettings {
	/** Flight window per stage, in seconds. */
	duration: number;
}
export type GameSettings = TwrSettings | FlySettings | DrawSettings;

/** A planned stage: players, rooms and how many go through (0 in the final). */
export type PlannedStage = Stage;

/** One room of the current stage: a real game session of the tournament's game. */
export interface RoomRef {
	code: string;
	number: number;
	players: number;
}

/**
 *  lobby     registration; entries are locked when the organiser prepares stage 1
 *  stage     a stage's games exist (in their lobby, running or finished); the
 *            organiser finishes the stage once every room's game has ended
 *  finished  final decided, or closed by an organiser
 */
export type TournamentStatus = 'lobby' | 'stage' | 'finished';

export interface PodiumEntry {
	playerId: string;
	name: string;
	score: number;
	rank: number;
}

export interface TournamentSession {
	code: string;
	gameType: typeof GAME_TYPE;
	game: TournamentGame;
	format: TournamentFormat;
	status: TournamentStatus;
	registrationOpen: boolean;
	createdAt: number;
	createdBy: string;
	startedAt: number | null;
	endedAt: number | null;
	rules: TournamentRules;
	settings: GameSettings;
	/** Everyone who registered (reserve included). Shown in the admin Games list. */
	playerCount: number;
	/** 0 until stage 1 is prepared. */
	stage: number;
	/** Stages this tournament will play (fewer than planned if few registered). */
	totalStages: number;
	/** The current stage is the final. */
	final: boolean;
	/** Stages as planned: from the participant limit in the lobby, then from who actually plays. */
	plan: PlannedStage[];
	/** The current stage's games. */
	rooms: RoomRef[];
	/** Tech Word Rush: words already played, so later stages get new ones. */
	usedWords?: string[];
	/** An organiser closed it before the end (no results). */
	closed: boolean;
	podium: PodiumEntry[];
	/** For the shared Games history list. */
	winner: { name: string; score: number } | null;
}

export type TournamentPlayerStatus = 'lobby' | 'playing' | 'qualified' | 'eliminated' | 'reserve' | 'removed' | 'finalist' | 'champion';

export interface TournamentPlayer {
	name: string;
	joinedAt: number;
	status: TournamentPlayerStatus;
	/** Stage the player is (or last was) in; 0 in the lobby. */
	stage: number;
	/** Game code of their current room. */
	room: string | null;
	roomNumber: number | null;
	/** Final placing (finalists only). */
	place: number | null;
	/** Where they finished in their last stage's room. */
	lastRank: number | null;
	lastScore: number | null;
}

export interface StageRanking {
	id: string;
	name: string;
	score: number;
	rank: number;
}

export interface StageRoomResult {
	code: string;
	number: number;
	ranking: StageRanking[];
	/** Who went through, in place order (the podium in the final). */
	advancing: string[];
}

export interface StageResult {
	stage: number;
	final: boolean;
	rooms: StageRoomResult[];
	createdAt: number;
}

/** Put on a game session that is one room of a tournament stage. */
export interface TournamentTag {
	code: string;
	game: TournamentGame;
	stage: number;
	totalStages: number;
	room: number;
	rooms: number;
	final: boolean;
}

/** A tournament player as seated in a room's game: same id and device token as in the tournament. */
export interface SeatedPlayer {
	id: string;
	name: string;
	tokenHash: string;
	joinedAt: number;
}

/** Shown to anyone who tries to join a room's game directly. */
export const ROOM_JOIN_MESSAGE = 'This game is part of a tournament. Scan the tournament QR code to take part.';

export type TournamentControl = 'sync' | 'open-registration' | 'close-registration' | 'prepare' | 'finish-stage' | 'remove-player' | 'close';

/** What the state endpoint returns to a phone (its player doc is also public). */
export interface TournamentPlayerView {
	now: number;
	playerId: string;
	player: TournamentPlayer;
}

export const formatLabel = (f: TournamentFormat) => (f === 'rooms' ? 'Rooms & knockout' : 'Elimination');
