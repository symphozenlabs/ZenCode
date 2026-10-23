import { error, isHttpError, json } from '@sveltejs/kit';
import { randomInt } from 'node:crypto';
import { precheck, type MoveDeps } from '$lib/games/word-heist/engine';
import { DEFAULT_RULES, ROUND_DURATIONS, RULE_LIMITS, type HeistRules, type ModerationConfig } from '$lib/games/word-heist/types';
import { isWord, starterPools } from './dictionary';
import { defaultModeration, moderateWord, parseBlocklist, screenRaw } from './moderation';
import { FirestoreHeistStore, saveModerationDoc } from './store';

/**
 * Word Heist helpers shared by the live-server hub (hub.ts) and the admin
 * HTTP routes: rules, moderation settings and the dictionary checks.
 * Tournaments themselves run in hub.ts / tournament.ts.
 */

export async function handle(fn: () => Promise<unknown>) {
	try {
		return json(await fn());
	} catch (err) {
		if (isHttpError(err)) return json({ message: err.body.message }, { status: err.status });
		console.error('[word-heist]', err);
		return json({ message: 'Something went wrong. Please try again.' }, { status: 500 });
	}
}

export async function readBody(request: Request): Promise<Record<string, unknown>> {
	try {
		const body = await request.json();
		return body && typeof body === 'object' ? body : {};
	} catch {
		error(400, 'Invalid request.');
	}
}

const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
export function newCode() {
	let s = 'ZH';
	for (let i = 0; i < 4; i++) s += CODE_ALPHABET[randomInt(CODE_ALPHABET.length)];
	return s;
}

/** Validate the organiser's round rules (400 with a plain message if wrong). */
export function parseRules(raw: unknown): HeistRules {
	const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
	const num = (v: unknown, d: number) => (Number.isInteger(v) ? (v as number) : d);
	const rules: HeistRules = {
		roundSeconds: num(r.roundSeconds, DEFAULT_RULES.roundSeconds),
		minWordLength: num(r.minWordLength, DEFAULT_RULES.minWordLength),
		maxCreateLength: num(r.maxCreateLength, DEFAULT_RULES.maxCreateLength),
		maxWordLength: num(r.maxWordLength, DEFAULT_RULES.maxWordLength)
	};
	if (!ROUND_DURATIONS.includes(rules.roundSeconds as never)) error(400, 'Choose a valid round length.');
	for (const key of ['minWordLength', 'maxCreateLength', 'maxWordLength'] as const) {
		const [lo, hi] = RULE_LIMITS[key];
		if (rules[key] < lo || rules[key] > hi) error(400, 'Word length limits are out of range.');
	}
	if (rules.maxCreateLength < rules.minWordLength) error(400, 'New words can’t be shorter than the minimum word length.');
	if (rules.maxWordLength <= rules.maxCreateLength) error(400, 'The longest word must be longer than the longest new word, so steals are possible.');
	return rules;
}

// ── Moderation ───────────────────────────────────────────────────────────

let configCache: { at: number; value: ModerationConfig } | null = null;
const CONFIG_TTL_MS = 10_000;
const store = new FirestoreHeistStore();

/** The event's moderation settings (cached for a few seconds). */
export async function loadModeration(): Promise<ModerationConfig> {
	if (configCache && Date.now() - configCache.at < CONFIG_TTL_MS) return configCache.value;
	const value = (await store.moderation()) ?? defaultModeration();
	configCache = { at: Date.now(), value };
	return value;
}

export const depsFor = (config: ModerationConfig): MoveDeps => ({
	isWord,
	moderate: (w) => moderateWord(w, config),
	screen: (raw) => screenRaw(raw, config)
});

export const startersFor = (config: ModerationConfig) => starterPools((w) => !moderateWord(w, config));

export const getModeration = loadModeration;

export async function saveModeration(email: string, body: Record<string, unknown>): Promise<ModerationConfig> {
	const list = parseBlocklist(body.blocklist);
	if (typeof list === 'string') error(400, list);
	const value: ModerationConfig = { blocklist: list, detectObfuscation: body.detectObfuscation !== false, updatedAt: Date.now(), updatedBy: email };
	await saveModerationDoc(value);
	configCache = { at: Date.now(), value };
	return value;
}

/** Organiser tool: would this word be accepted (ignoring the board)? */
export async function testWord(raw: unknown): Promise<{ ok: boolean; message: string }> {
	const out = precheck('steal', raw, { ...DEFAULT_RULES, minWordLength: 1, maxWordLength: 40 }, depsFor(await loadModeration()));
	return 'word' in out ? { ok: true, message: `${out.word} would be accepted.` } : { ok: false, message: out.message };
}
