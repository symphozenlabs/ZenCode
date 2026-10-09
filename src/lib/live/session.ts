import { DEFAULT_SETTINGS, LIMITS, type SessionSettings } from './types';

export function sanitizeTitle(v: unknown): string {
	return typeof v === 'string' ? v.replace(/\s+/g, ' ').trim().slice(0, LIMITS.title) : '';
}

export function sanitizeSettings(v: unknown, base: SessionSettings = DEFAULT_SETTINGS): SessionSettings {
	const s = (v && typeof v === 'object' ? v : {}) as Record<string, unknown>;
	const b = (k: keyof SessionSettings) => (typeof s[k] === 'boolean' ? (s[k] as boolean) : (base[k] as boolean));
	return {
		scoring: s.scoring === 'equal' || s.scoring === 'speed' ? s.scoring : base.scoring,
		reactions: b('reactions'),
		qa: b('qa'),
		moderation: b('moderation'),
		profanityFilter: b('profanityFilter')
	};
}

export const JOIN_CODE_RE = /^\d{6}$/;

/** Collapse whitespace and strip control characters; '' when unusable. */
export function cleanNickname(v: unknown): string {
	if (typeof v !== 'string') return '';
	return v
		.replace(/[\p{C}]/gu, '')
		.replace(/\s+/g, ' ')
		.trim()
		.slice(0, LIMITS.nickname);
}

export function nicknameError(nickname: string): string | null {
	if (!nickname) return 'Enter a nickname.';
	if (nickname.length < 2) return 'Use at least 2 characters.';
	return null;
}

/** Spaced for reading aloud: 482 913 */
export const formatCode = (code: string) => `${code.slice(0, 3)} ${code.slice(3)}`;
