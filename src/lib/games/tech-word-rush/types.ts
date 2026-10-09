import type { Guess, QuestionStatus, RankEntry } from './engine';
import type { Category, Difficulty } from './questions';

/**
 * Firestore shapes for a live Tech Word Rush session.
 *
 *   liveSessions/{code}                 LiveSession   — public read, server-only write
 *   liveSessions/{code}/players/{id}    PlayerDoc     — public get, admin list, server-only write
 *   liveSessions/{code}/playerState/*   private       — server only (token hash, revealed letters)
 *   liveSessions/{code}/names/*         private       — server only (unique display names)
 *   liveSessions/{code}/secret/questions private      — server only (the words)
 *
 * Answers never appear in a client-readable document until the question ends.
 */

export const GAME_TYPE = 'tech-word-rush';
export const SESSIONS = 'liveSessions';
export const QUESTIONS_COLLECTION = 'techWordRushQuestions';

export type SessionStatus = 'lobby' | 'question' | 'result' | 'leaderboard' | 'finished';

export interface PublicQuestion {
	index: number;
	description: string;
	category: Category;
	difficulty: Difficulty;
	length: number;
	first: string;
	last: string;
}

export interface QuestionStats {
	players: number;
	correct: number;
	failed: number;
	skipped: number;
}

export interface LiveSession {
	code: string;
	gameType: typeof GAME_TYPE;
	status: SessionStatus;
	createdAt: number;
	createdBy: string;
	startedAt: number | null;
	endedAt: number | null;
	/** -1 until the first question starts. */
	questionIndex: number;
	totalQuestions: number;
	/** Seconds per word. */
	duration: number;
	current: PublicQuestion | null;
	/** Server time (ms) when answering closes. */
	timerEndsAt: number | null;
	/** The current word — only set once the question has ended. */
	answer: string | null;
	playerCount: number;
	lastStats: QuestionStats | null;
	leaderboard: RankEntry[];
	winner: { name: string; xp: number } | null;
	/** True between a question ending and its leaderboard being written. */
	ranking?: boolean;
}

export interface PlayerDoc {
	name: string;
	joinedAt: number;
	xp: number;
	correct: number;
	failed: number;
	skipped: number;
	hintsUsed: number;
	/** Status on the most recent question this player touched (`guesses` = how many sent). */
	q: { index: number; status: QuestionStatus; hintsUsed: number; guesses: number } | null;
}

/** What the play endpoint returns to the participant. */
export interface PlayerView {
	now: number;
	xp: number;
	q: {
		index: number;
		status: QuestionStatus;
		hintsUsed: number;
		/** `correct` is only filled in once the answer has been revealed. */
		guesses: (Guess & { correct?: boolean })[];
		reward: number;
		earned: number;
		/** position → letter for revealed middle letters */
		revealed: Record<number, string>;
	} | null;
	/** Full word, once the host has revealed it. */
	answer: string | null;
	rejected?: string;
	result?: 'guess' | 'skipped' | 'hint';
}

export type ControlAction = 'sync' | 'start' | 'next' | 'end' | 'leaderboard' | 'finish';
export type PlayAction = 'state' | 'hint' | 'answer' | 'skip';
