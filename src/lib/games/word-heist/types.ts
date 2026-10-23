/**
 * Firestore shapes for a Word Heist tournament. Everything lives under the
 * shared games collection so the admin Games list and history clean-up work
 * unchanged:
 *
 *   liveSessions/{code}                  HeistSession — public get, server-only write
 *   liveSessions/{code}/players/{id}     HeistPlayer  — public get, admin list, server-only write
 *   liveSessions/{code}/rooms/{roomId}   RoomSummary  — public get, admin list (small: drives the admin Top 3 board)
 *   liveSessions/{code}/boards/{roomId}  Board        — public get (one room's live words, moves and scores)
 *   liveSessions/{code}/rounds/{n}       RoundResult  — public get, admin list
 *   liveSessions/{code}/playerState/*    private      — server only (device token hash)
 *   liveSessions/{code}/names/*          private      — server only (unique display names)
 *   liveSessions/{code}/secret/heist     private      — server only (seed for room ids and starter words)
 *   gameConfig/wordHeist                 ModerationConfig — organisers only
 *
 * Room ids are derived from a server secret, so a player only learns the ids
 * of their own room (from their player doc), never another room's.
 */

export const GAME_TYPE = 'word-heist';
export const CODE_RE = /^ZH[A-Z2-9]{4}$/;
export const CONFIG_COLLECTION = 'gameConfig';
export const CONFIG_DOC = 'wordHeist';

/** Round lengths the admin can pick, in seconds. */
export const ROUND_DURATIONS = [120, 180, 240, 300, 420, 600] as const;
export const STARTERS_PER_PLAYER = 3;
/** Most players a tournament accepts (registrations beyond it are refused). */
export const MAX_PLAYERS = 1000;
/** Moves shown in a room's recent-moves feed. */
export const FEED_SIZE = 20;
/** Seconds before the end of a round when players are warned. */
export const WARNING_SECONDS = 30;
/** A player counts as connected if their phone checked in this recently. */
export const CONNECTED_MS = 60_000;
export const HEARTBEAT_MS = 20_000;

export interface HeistRules {
	roundSeconds: number;
	/** Shortest word a player may create or steal into. */
	minWordLength: number;
	/** Longest brand-new word (keeps creation from out-scoring stealing). */
	maxCreateLength: number;
	/** Longest word overall (steals included). */
	maxWordLength: number;
}

export const DEFAULT_RULES: HeistRules = { roundSeconds: 240, minWordLength: 3, maxCreateLength: 5, maxWordLength: 15 };
export const RULE_LIMITS = {
	minWordLength: [3, 5],
	maxCreateLength: [3, 8],
	maxWordLength: [6, 20]
} as const;

/**
 *  lobby    registration; provisional rooms shown
 *  ready    a round's rooms and starter words exist, waiting for Start
 *  playing  round live
 *  paused   round paused (timer frozen)
 *  scoring  round closed, results being written
 *  review   results written; ties may need a decision, then the next round is prepared
 *  finished final round decided
 */
export type HeistStatus = 'lobby' | 'ready' | 'playing' | 'paused' | 'scoring' | 'review' | 'finished';

export interface PodiumEntry {
	playerId: string;
	name: string;
	score: number;
	rank: number;
}

export interface HeistSession {
	code: string;
	gameType: typeof GAME_TYPE;
	status: HeistStatus;
	registrationOpen: boolean;
	createdAt: number;
	createdBy: string;
	startedAt: number | null;
	endedAt: number | null;
	rules: HeistRules;
	/** Everyone who registered (reserve included). Shown in the admin Games list. */
	playerCount: number;
	/** 0 until round 1 is prepared. */
	round: number;
	/** Rooms in the current round. */
	roomCount: number;
	/** Players in the current round. */
	roundPlayers: number;
	timerEndsAt: number | null;
	/** While paused: time that was left. */
	pausedRemainingMs: number | null;
	/** True if the current round is the final (one room). */
	final: boolean;
	/** Lobby only: rooms if the lobby were locked now. */
	lobbyRooms: number;
	/** Ties at a cutoff still waiting for an organiser decision. */
	openTies: number;
	podium: PodiumEntry[];
	/** For the shared Games history list. */
	winner: { name: string; score: number } | null;
}

export type PlayerStatus = 'lobby' | 'playing' | 'qualified' | 'eliminated' | 'tied' | 'reserve' | 'removed' | 'champion';

export interface HeistPlayer {
	name: string;
	joinedAt: number;
	status: PlayerStatus;
	/** Round the player is (or last was) in; 0 in the lobby. */
	round: number;
	roomId: string | null;
	roomNumber: number | null;
	lastSeenAt: number;
	/** Final placing (finalists only). */
	place?: number | null;
}

export interface BoardWord {
	text: string;
	owner: string;
	at: number;
	/** The word it was stolen/extended from. */
	from?: string;
	starter?: boolean;
}

export interface PlayerScore {
	name: string;
	/** Sum of lengths of the words this player currently owns. */
	score: number;
	/** Longest word currently owned (tie-break). */
	longest: number;
	/** Successful steals from other players (tie-break). */
	steals: number;
	/** Server time this score was last changed (earlier wins a tie). */
	lastScoreAt: number;
	removed?: boolean;
}

export type MoveKind = 'create' | 'steal' | 'extend';

export interface FeedEntry {
	seq: number;
	kind: MoveKind;
	by: string;
	byName: string;
	text: string;
	from?: string;
	victim?: string;
	victimName?: string;
	at: number;
}

export type BoardStatus = 'ready' | 'playing' | 'paused' | 'finished';

export interface Board {
	round: number;
	roomId: string;
	number: number;
	status: BoardStatus;
	endsAt: number | null;
	pausedRemainingMs: number | null;
	rules: HeistRules;
	players: Record<string, PlayerScore>;
	words: Record<string, BoardWord>;
	feed: FeedEntry[];
	seq: number;
	/** seq after the starter words were dealt (seq − startSeq = moves made). */
	startSeq: number;
	/** Recent request ids → outcome, so a retried move is never applied twice. */
	requests: Record<string, { seq: number; ok: boolean; message: string }>;
}

export interface RankEntry {
	playerId: string;
	name: string;
	score: number;
	longest: number;
	steals: number;
	lastScoreAt: number;
	rank: number;
}

export interface RoomSummary {
	round: number;
	roomId: string;
	number: number;
	status: BoardStatus;
	playerCount: number;
	top3: RankEntry[];
	wordCount: number;
	moves: number;
	updatedAt: number;
}

export interface CutoffTie {
	/** Players fully tied across the cutoff. */
	candidates: string[];
	/** How many of them get the contested places. */
	slots: number;
	/** First contested rank (e.g. 2 when 2nd place is tied with 3rd). */
	fromRank: number;
	/** Organiser's ordered pick, once decided. */
	resolved: string[] | null;
}

export interface RoomResult {
	roomId: string;
	number: number;
	ranking: RankEntry[];
	/** Decided qualifiers in place order (the podium order in the final). Short while a tie is open. */
	advancing: string[];
	/** Fully tied groups across a place that matters (a qualifying room has at most one). */
	ties: CutoffTie[];
}

export interface RoundResult {
	round: number;
	final: boolean;
	rooms: RoomResult[];
	createdAt: number;
}

export interface ModerationConfig {
	/** Event blocklist. A trailing * blocks every word starting with the stem. */
	blocklist: string[];
	/** Undo look-alike characters (s3x → sex) and separators (s-e-x) before checking. */
	detectObfuscation: boolean;
	updatedAt: number | null;
	updatedBy: string | null;
}

/** Initial event blocklist (editable on the moderation page). */
export const DEFAULT_BLOCKLIST = ['slut', 'sex', 'porn', 'gay', 'inner', 'bra'];

export type HeistControl =
	| 'sync'
	| 'open-registration'
	| 'close-registration'
	| 'prepare'
	| 'start'
	| 'pause'
	| 'resume'
	| 'end'
	| 'resolve-tie'
	| 'next-round'
	| 'remove-player'
	| 'reset';

export type HeistPlayAction = 'state' | 'ping' | 'create' | 'steal';

export interface MoveResult {
	ok: boolean;
	message: string;
	/** Points this move gained for the player (0 when rejected). */
	gained?: number;
	duplicate?: boolean;
}

export interface HeistPlayerView {
	now: number;
	playerId: string;
	status: PlayerStatus;
	round: number;
	roomId: string | null;
	roomNumber: number | null;
	move?: MoveResult;
}

export const roundId = (n: number) => String(n);
export const formatClock = (ms: number) => {
	const s = Math.max(0, Math.ceil(ms / 1000));
	return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
};
