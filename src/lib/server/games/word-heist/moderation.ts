import { hasProfanity } from '$lib/server/live/profanity';
import { DEFAULT_BLOCKLIST, type ModerationConfig } from '$lib/games/word-heist/types';

/**
 * Word Heist moderation — two independent layers, both enforced on the server:
 *
 *  1. The site's general profanity filter (src/lib/server/live/profanity.ts),
 *     the same one used for live-session nicknames.
 *  2. The event blocklist an organiser edits on the moderation page. These
 *     are event policy, not a judgement that a word is offensive.
 *
 * Blocklist matching is by whole word, never by substring: "bra" blocks BRA
 * and BRAS but not BRAIN; "inner" blocks INNER but not WINNER. An entry
 * ending in * blocks every word that starts with it ("porn*" → PORNO).
 *
 * Limits: no filter catches every evasion. Words must be A–Z dictionary words,
 * which already rules out most disguises; with obfuscation detection on,
 * look-alike characters and separators in the raw input (s3x, s-e-x) are
 * undone and screened too. Prefix (*) entries can block legitimate words —
 * check them with the tester on the moderation page.
 */

export const BLOCKED_MESSAGE = "That word isn't allowed in this event.";

/** Inflections of a blocked word that are blocked with it. */
const INFLECTIONS = ['', 's', 'es', 'ed', 'ing'];

const SWAPS: Record<string, string> = { '0': 'o', '1': 'i', '!': 'i', '|': 'i', '3': 'e', '4': 'a', '@': 'a', '5': 's', $: 's', '7': 't', '8': 'b', '+': 't' };

export function defaultModeration(): ModerationConfig {
	return { blocklist: [...DEFAULT_BLOCKLIST], detectObfuscation: true, updatedAt: null, updatedBy: null };
}

/** Clean an organiser's list: lower case a–z, optional trailing *, no duplicates. */
export function parseBlocklist(raw: unknown): string[] | string {
	if (!Array.isArray(raw)) return 'Send the blocklist as a list of words.';
	if (raw.length > 500) return 'Keep the blocklist under 500 entries.';
	const out = new Set<string>();
	for (const item of raw) {
		if (typeof item !== 'string') return 'Each blocklist entry must be a word.';
		const entry = item.normalize('NFKD').replace(/[̀-ͯ]/g, '').trim().toLowerCase();
		if (!entry) continue;
		if (!/^[a-z]{2,30}\*?$/.test(entry)) return `"${item.slice(0, 30)}" — use 2–30 letters, optionally ending in *.`;
		out.add(entry);
	}
	return [...out].sort();
}

function compile(list: readonly string[]) {
	const exact = new Set<string>();
	const prefixes: string[] = [];
	for (const entry of list) {
		if (entry.endsWith('*')) prefixes.push(entry.slice(0, -1));
		else for (const suffix of INFLECTIONS) exact.add(entry + suffix);
	}
	return (w: string) => exact.has(w) || prefixes.some((p) => w.startsWith(p));
}

const compiled = new WeakMap<ModerationConfig, (w: string) => boolean>();
const matcher = (config: ModerationConfig) => {
	let m = compiled.get(config);
	if (!m) compiled.set(config, (m = compile(config.blocklist)));
	return m;
};

/** Screen a normalised A–Z word. Returns a message when blocked, else null. */
export function moderateWord(word: string, config: ModerationConfig): string | null {
	const w = word.toLowerCase();
	if (hasProfanity(w)) return BLOCKED_MESSAGE;
	if (matcher(config)(w)) return BLOCKED_MESSAGE;
	return null;
}

/**
 * Screen raw input before it is normalised: with obfuscation detection on,
 * undo look-alike characters and drop separators (s.e.x, s3x), then check the
 * result against both layers.
 */
export function screenRaw(raw: string, config: ModerationConfig): string | null {
	if (!config.detectObfuscation) return null;
	const undone = raw
		.toLowerCase()
		.normalize('NFKD')
		.replace(/[̀-ͯ]/g, '')
		.replace(/[01!|3457@$8+]/g, (c) => SWAPS[c] ?? c)
		.replace(/[^a-z]/g, '');
	if (!undone || undone === raw.trim().toLowerCase()) return null; // nothing was disguised
	return moderateWord(undone, config);
}
