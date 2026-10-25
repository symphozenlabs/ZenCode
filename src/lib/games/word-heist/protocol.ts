import type {
	BoardStatus,
	BoardWord,
	FeedEntry,
	HeistControl,
	HeistRules,
	HeistStatus,
	MoveResult,
	PlayerScore,
	PlayerStatus,
	PodiumEntry,
	RoomSummary,
	RoundResult,
	Tile,
	TilePlan
} from './types';

/**
 * Word Heist runs on the live server (server.js), like live sessions: the
 * tournament, rooms and boards are held in the server's memory and phones
 * talk to it over one WebSocket at HEIST_SOCKET_PATH. Every move is judged
 * there and pushed to the room at once; Firestore is only a periodic backup
 * (and what the admin Games list reads).
 */
export const HEIST_SOCKET_PATH = '/heist';

/** Tournament state every connected screen sees. */
export interface TournamentView {
	code: string;
	status: HeistStatus;
	registrationOpen: boolean;
	rules: HeistRules;
	playerCount: number;
	round: number;
	final: boolean;
	/** Stages this tournament will play (1 for a game). */
	totalStages: number;
	/** An organiser closed it before the end. */
	closed: boolean;
	/** A game's avatars already picked (a tournament checks per room when rooms are locked). */
	takenAvatars: number[];
	roomCount: number;
	roundPlayers: number;
	timerEndsAt: number | null;
	pausedRemainingMs: number | null;
	/** Rooms if the lobby were locked now. */
	lobbyRooms: number;
	openTies: number;
	podium: PodiumEntry[];
}

/** One phone's own state. */
export interface MeView {
	playerId: string;
	name: string;
	status: PlayerStatus;
	round: number;
	roomNumber: number | null;
	place: number | null;
	/** Provisional room while in the lobby. */
	lobbyRoom: number | null;
	avatar: number;
}

/** A room's board as sent to its players (no request ids, and never the bag). */
export interface BoardView {
	round: number;
	roomId: string;
	number: number;
	status: BoardStatus;
	endsAt: number | null;
	pausedRemainingMs: number | null;
	rules: HeistRules;
	/** How this room's tiles drop. */
	tiles: TilePlan;
	/** Tiles turned over so far. */
	drawn: number;
	/** Face-up tiles nobody has used yet, oldest first. */
	pool: Tile[];
	players: Record<string, PlayerScore>;
	words: Record<string, BoardWord>;
	feed: FeedEntry[];
}

export interface AdminPlayer {
	id: string;
	name: string;
	status: PlayerStatus;
	round: number;
	roomNumber: number | null;
	place: number | null;
	connected: boolean;
}

export type HeistClientMessage =
	| { t: 'hello'; code: string; playerId?: string; token?: string }
	| { t: 'join'; code: string; name: string; avatar?: number }
	/** Just the word: the server works out whether it is a steal or made from tiles. */
	| { t: 'move'; requestId: string; text: string }
	| { t: 'admin'; code: string; token: string }
	| { t: 'control'; reqId: string; action: HeistControl; [key: string]: unknown }
	| { t: 'watch'; roomId: string | null };

export type HeistErrorCode = 'not_found' | 'auth' | 'closed' | 'bad_request' | 'rate_limited' | 'join';

export type HeistServerMessage =
	| { t: 'tournament'; now: number; s: TournamentView }
	| { t: 'me'; me: MeView | null }
	| { t: 'joined'; playerId: string; token: string; name: string }
	| { t: 'board'; b: BoardView | null }
	| { t: 'move'; requestId: string; result: MoveResult }
	| { t: 'admin'; rooms: RoomSummary[]; players: AdminPlayer[]; rounds?: RoundResult[] }
	| { t: 'room'; b: BoardView | null }
	| { t: 'control'; reqId: string; ok: boolean; message?: string }
	| { t: 'error'; code: HeistErrorCode; message: string };
