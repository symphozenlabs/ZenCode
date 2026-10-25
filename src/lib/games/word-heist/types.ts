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
 *   liveSessions/{code}/secret/heist     private      — server only (seed for room ids and tile bags)
 *   gameConfig/wordHeist                 ModerationConfig — organisers only
 *
 * Room ids are derived from a server secret, so a player only learns the ids
 * of their own room (from their player doc), never another room's.
 */

export const GAME_TYPE = 'word-heist';
export const CODE_RE = /^ZH[A-Z2-9]{4}$/;
export const CONFIG_COLLECTION = 'gameConfig';
export const CONFIG_DOC = 'wordHeist';

/** Round lengths the organiser can pick, in seconds: how long tiles keep dropping (the final countdown comes after). */
export const ROUND_SECONDS = [60, 120, 180, 240, 300, 360, 420, 480, 540, 600] as const;
/**
 * Tiles in a full room's bag the organiser can set: at least 10, and at most
 * 300 for a 1-minute round rising evenly to 3000 for 20 minutes (to the
 * nearest 10) — e.g. 870 for 5 minutes, 1580 for 10.
 */
export const TILE_LIMITS = [10, 3000] as const;
export const maxTilesFor = (roundSeconds: number) => Math.round((300 + ((Math.max(60, roundSeconds) / 60 - 1) * 2700) / 19) / 10) * 10;
/** Seconds between tiles (in a full room) the organiser can set. */
export const PACE_LIMITS = [0.1, 30] as const;
/** Tiles face up the moment a round starts. */
export const OPENING_TILES = 3;
/** Countdown after the last tile drops, before the round ends: the default, and the choices. */
export const FINAL_SECONDS = 30;
export const FINAL_OPTIONS = [0, 10, 15, 20, 30, 45, 60] as const;
/** Players per room the organiser can choose (a game is one room; a tournament's final is one room). */
export const ROOM_MIN = 2;
export const ROOM_MAX = 15;
export const DEFAULT_ROOM_SIZE = 12;
/** Most stages a tournament can have. */
export const MAX_STAGES = 5;
/** Most players a tournament accepts (registrations beyond it are refused). */
export const MAX_PLAYERS = 1000;

/**
 * The suggested bag for a room: 20 + 10 a player (Pilfer's 60 for four), at
 * least 40, so tiles come every MIN_TILE_MS–MAX_TILE_MS. The organiser can
 * set any bag for a full room; smaller rooms get fewer by size band (see
 * TILE_BANDS), over the same time.
 */
export const TILES_BASE = 20;
export const TILES_PER_PLAYER = 10;
export const MIN_TILE_MS = 1_500;
export const MAX_TILE_MS = 8_000;
/** Moves shown in a room's recent-moves feed. */
export const FEED_SIZE = 20;
/** A player counts as connected if their phone checked in this recently. */
export const CONNECTED_MS = 60_000;
export const HEARTBEAT_MS = 20_000;

/**
 *  game        one room of up to ROOM_MAX players, one round
 *  tournament  `stages` rounds; the top `advance` of every room go through,
 *              the last stage is a single final room
 */
export type HeistMode = 'game' | 'tournament';

export interface HeistRules {
	mode: HeistMode;
	/** How long tiles keep dropping each round. */
	roundSeconds: number;
	/** Countdown after the last tile, with no new tiles, before the round ends. */
	finalSeconds: number;
	/** Shortest word a player may make or steal into. */
	minWordLength: number;
	/** Rounds, the final included (1 for a game). */
	stages: number;
	/** Players who go through from each room to the next stage. */
	advance: number;
	/** Registrations accepted (anyone after joins the reserve list). */
	maxPlayers: number;
	/** Most players in one room (ROOM_MIN–ROOM_MAX). */
	roomSize: number;
	/** Tiles in a full room's bag; smaller rooms get proportionally fewer over the same round. */
	tileCount: number;
}

export const DEFAULT_RULES: HeistRules = { mode: 'tournament', roundSeconds: 300, finalSeconds: FINAL_SECONDS, minWordLength: 3, stages: 3, advance: 2, maxPlayers: 432, roomSize: DEFAULT_ROOM_SIZE, tileCount: 140 };
export const GAME_RULES: HeistRules = { mode: 'game', roundSeconds: 300, finalSeconds: FINAL_SECONDS, minWordLength: 3, stages: 1, advance: 0, maxPlayers: DEFAULT_ROOM_SIZE, roomSize: DEFAULT_ROOM_SIZE, tileCount: 140 };
export const RULE_LIMITS = {
	minWordLength: [3, 5]
} as const;

/** Rules saved before modes existed open as a tournament with today's defaults. */
export function normalizeRules(r: Partial<HeistRules> | undefined): HeistRules {
	const out = { ...DEFAULT_RULES, maxPlayers: MAX_PLAYERS, ...r };
	// Saved before the countdown was separate: their round length included it.
	if (r?.roundSeconds && r.finalSeconds === undefined) out.roundSeconds = Math.max(FINAL_SECONDS, r.roundSeconds - FINAL_SECONDS);
	if (!r?.tileCount) out.tileCount = suggestedTiles(out.roomSize, out.roundSeconds);
	return out;
}

/** How one room's tiles drop. */
export interface TilePlan {
	/** Tiles in the bag. */
	count: number;
	/** Time between tiles. */
	everyMs: number;
	/** The whole round: the tiles, then the final countdown. */
	totalMs: number;
}

const tileWeight = (players: number) => TILES_BASE + TILES_PER_PLAYER * players;
const dropMsOf = (roundSeconds: number) => Math.max(1_000, roundSeconds * 1000);

/** The suggested bag for a full room of `roomSize` over a round of `roundSeconds`. */
export function suggestedTiles(roomSize: number, roundSeconds: number): number {
	const dropMs = dropMsOf(roundSeconds);
	const wanted = Math.max(tileWeight(roomSize), 40, OPENING_TILES + Math.ceil(dropMs / MAX_TILE_MS));
	return Math.max(OPENING_TILES + 1, Math.min(wanted, OPENING_TILES + Math.floor(dropMs / MIN_TILE_MS)));
}

/** Seconds between tiles when `tileCount` tiles drop over a round of `roundSeconds`. */
export const tilePace = (roundSeconds: number, tileCount: number) => dropMsOf(roundSeconds) / 1000 / Math.max(1, tileCount - OPENING_TILES);
/** Tiles that fit a round of `roundSeconds` at one every `paceSeconds`. */
export const tilesFor = (roundSeconds: number, paceSeconds: number) => OPENING_TILES + Math.max(1, Math.round(dropMsOf(roundSeconds) / 1000 / paceSeconds));

/**
 * Room-size bands for tiles: the highest player count in each. A full room's
 * bag goes to its band, and each band below gets an equal step less — e.g.
 * 150 for a room of up to 15 → 150 (11–15), 100 (6–10), 50 (2–5); for up to
 * 10 → 150 (6–10), 75 (2–5).
 */
export const TILE_BANDS = [5, 10, 15] as const;
/** 1, 2 or 3: which band a room of `players` is in. */
export const tileBand = (players: number) => TILE_BANDS.findIndex((top) => players <= top) + 1 || TILE_BANDS.length;
/** Tiles for a room of `players` when a full room of `roomSize` gets `tileCount`. */
export const bandTiles = (players: number, roomSize: number, tileCount: number) =>
	Math.max(OPENING_TILES + 1, Math.round((tileCount * Math.min(tileBand(players), tileBand(roomSize))) / tileBand(roomSize)));

/**
 * One room's tiles: the full-room bag, scaled down by size band, spread
 * evenly over the round length, then the final countdown. Every room of a
 * stage ends together.
 */
export function tilePlan(players: number, rules: Pick<HeistRules, 'roundSeconds' | 'finalSeconds' | 'roomSize' | 'tileCount'>): TilePlan {
	const totalMs = (rules.roundSeconds + rules.finalSeconds) * 1000;
	const count = bandTiles(players, rules.roomSize, rules.tileCount);
	return { count, everyMs: dropMsOf(rules.roundSeconds) / (count - OPENING_TILES), totalMs };
}

/**
 *  lobby    registration; provisional rooms shown
 *  ready    a round's rooms and tile bags exist, waiting for Start
 *  playing  round live: tiles drop on the server's clock
 *  paused   round paused (tiles and timer frozen)
 *  scoring  round closed, results being written
 *  review   results written; ties may need a decision, then the next round is prepared
 *  finished final round decided, or an organiser closed the tournament
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
	/** Stages this tournament will actually play (fewer than planned if few registered). */
	totalStages: number;
	/** An organiser closed it before the end (no results). */
	closed: boolean;
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
	/** The avatar they picked (index into AVATARS). */
	avatar?: number;
}

export interface BoardWord {
	text: string;
	owner: string;
	at: number;
	/** The word it was stolen/extended from. */
	from?: string;
}

/** A face-up letter tile. `id` is its place in the bag (unique in a room). */
export interface Tile {
	id: number;
	c: string;
}

export interface PlayerScore {
	name: string;
	/** Sum of lengths of the words this player currently owns. */
	score: number;
	/** Longest word this player made this round (tie-break). */
	longest: number;
	/** Server time they first made a word that long (earlier wins a tie). */
	longestAt: number;
	/** Successful steals from other players. */
	steals: number;
	removed?: boolean;
	/** Avatar in this room (unique in the room; index into AVATARS). */
	avatar?: number;
	/** Place at the table: picks the player's colour. */
	seat?: number;
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
	/** When the round ends (the last tile drops a final countdown before). */
	endsAt: number | null;
	pausedRemainingMs: number | null;
	rules: HeistRules;
	/** This room's tiles (they depend on how many play in it). */
	tiles: TilePlan;
	/** Every tile in the order they drop. Server only — never sent to phones. */
	bag: string;
	/** Tiles dropped so far (bag[0..drawn)). */
	drawn: number;
	/** Dropped tiles nobody has used yet, oldest first. */
	pool: Tile[];
	players: Record<string, PlayerScore>;
	words: Record<string, BoardWord>;
	feed: FeedEntry[];
	seq: number;
	/** seq when the board was made (seq − startSeq = moves made). */
	startSeq: number;
	/** Recent request ids → outcome, so a retried move is never applied twice. */
	requests: Record<string, { seq: number; ok: boolean; message: string }>;
}

export interface RankEntry {
	playerId: string;
	name: string;
	score: number;
	longest: number;
	longestAt: number;
	steals: number;
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
	/** Places that matter in each room: the podium in the final, else the players who go through. */
	places?: number;
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
	| 'close'
	| 'reset';

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
