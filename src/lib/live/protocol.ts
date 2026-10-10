/**
 * WebSocket protocol for live sessions. Every frame is JSON with a `t` tag.
 * The server is authoritative: on every (re)connect the client says hello and
 * receives a full `welcome_*` snapshot, then incremental events.
 *
 * Timestamps (`endsAt`, `serverNow`) are server clock; clients only use them
 * to draw the countdown. Correct answers reach phones only after a reveal.
 */
import type { PublicSlide } from './slides';
import type {
	LeaderboardEntry,
	LiveSession,
	LiveState,
	LiveView,
	PublicParticipant,
	ResponseValue,
	SessionSettings,
	SessionStatus,
	SlidePhase,
	SlideResults
} from './types';

export const SOCKET_PATH = '/live';

// ---- Client → server ------------------------------------------------------

export type HostAction =
	| { t: 'start_session' }
	| { t: 'change_slide'; index: number }
	| { t: 'start_timer' }
	| { t: 'close_responses' }
	| { t: 'reveal_answer' }
	| { t: 'toggle_results'; show: boolean }
	| { t: 'reset_slide' }
	| { t: 'show_leaderboard'; show: boolean }
	/** Reopen an ended session with a fresh code and an empty lobby. */
	| { t: 'open_lobby' }
	| { t: 'end_session' };

export type ClientMessage =
	/** Admin presenter. `token` is a Firebase ID token, verified server side. */
	| { t: 'host'; sessionId: string; token: string }
	| { t: 'join'; code: string; nickname: string; avatar: string }
	| { t: 'resume'; code: string; participantId: string; secret: string }
	| { t: 'submit_response'; slideId: string; value: ResponseValue }
	| HostAction;

// ---- Server → client ------------------------------------------------------

/** What the presenter needs about the current slide beyond the session. */
export interface HostSlideData {
	results: SlideResults | null;
	answered: number;
	eligible: number;
}

export interface HostSnapshot extends HostSlideData {
	session: LiveSession;
	participants: PublicParticipant[];
	leaderboard: LeaderboardEntry[];
	serverNow: number;
}

/** One phone's view of the current moment. */
export interface PlayerSlideState {
	index: number;
	total: number;
	view: LiveView;
	slide: PublicSlide | null;
	phase: SlidePhase;
	endsAt: number | null;
	serverNow: number;
	/** This player's own answer to the current slide. */
	answered: ResponseValue | null;
	/** After the host reveals the answer. */
	reveal: { correctIds: string[]; correct: boolean | null; points: number } | null;
	/** Shown after reveals and on the leaderboard. */
	standing: { score: number; rank: number; players: number } | null;
}

export interface PlayerSnapshot {
	title: string;
	status: SessionStatus;
	settings: Pick<SessionSettings, 'reactions' | 'qa'>;
	me: PublicParticipant;
	playerCount: number;
	slide: PlayerSlideState | null;
}

export type ServerMessage =
	| { t: 'welcome_host'; state: HostSnapshot }
	| { t: 'welcome_player'; state: PlayerSnapshot; secret: string }
	| { t: 'lobby_update'; participants: PublicParticipant[] }
	| { t: 'player_count'; count: number }
	/** Host: run state changed (slide, phase, view, reveal). */
	| { t: 'slide_state'; status: SessionStatus; live: LiveState | null; serverNow: number }
	/** Player: their view of the current moment. */
	| { t: 'player_state'; state: PlayerSlideState }
	| { t: 'timer_tick'; slideId: string; remainingMs: number; serverNow: number }
	| { t: 'response_count'; slideId: string; answered: number; eligible: number }
	| { t: 'results_update'; slideId: string; results: SlideResults }
	| { t: 'answer_reveal'; slideId: string; correctIds: string[] }
	| { t: 'leaderboard_update'; entries: LeaderboardEntry[] }
	| { t: 'response_ack'; slideId: string }
	| { t: 'session_ended' }
	| { t: 'error'; code: ErrorCode; message: string; slideId?: string };

export type ErrorCode =
	| 'bad_request'
	| 'unauthorized'
	| 'not_found'
	| 'session_closed'
	| 'nickname_taken'
	| 'nickname_invalid'
	| 'rate_limited'
	| 'resume_failed'
	| 'response_rejected'
	| 'not_ready';

/** Errors after which the client must not auto-retry the same hello. */
export const FATAL_ERRORS: ErrorCode[] = ['unauthorized', 'not_found', 'session_closed', 'resume_failed'];
