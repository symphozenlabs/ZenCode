import { error, isHttpError, json } from '@sveltejs/kit';
import { randomInt } from 'node:crypto';
import { precheck, type MoveDeps } from '$lib/games/word-heist/engine';
import { maxParticipants, planStages } from '$lib/games/word-heist/allocation';
import { DEFAULT_RULES, FINAL_OPTIONS, GAME_RULES, MAX_STAGES, PACE_LIMITS, ROOM_MAX, ROOM_MIN, ROUND_SECONDS, RULE_LIMITS, TILE_LIMITS, maxTilesFor, suggestedTiles, tilePace, type HeistRules, type ModerationConfig } from '$lib/games/word-heist/types';
import { isWord } from './dictionary';
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

/**
 * Validate the organiser's rules (400 with a plain message if wrong). A game
 * is one room of up to ROOM_MAX; a tournament's participant limit must fit
 * its stages and the players going through from each room.
 */
export function parseRules(raw: unknown): HeistRules {
	const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
	const mode = r.mode === 'game' ? 'game' : 'tournament';
	const base = mode === 'game' ? GAME_RULES : DEFAULT_RULES;
	const num = (v: unknown, d: number) => (Number.isInteger(v) ? (v as number) : d);
	const rules: HeistRules = {
		mode,
		roundSeconds: num(r.roundSeconds, base.roundSeconds),
		finalSeconds: num(r.finalSeconds, base.finalSeconds),
		minWordLength: num(r.minWordLength, base.minWordLength),
		stages: mode === 'game' ? 1 : num(r.stages, base.stages),
		advance: mode === 'game' ? 0 : num(r.advance, base.advance),
		maxPlayers: num(r.maxPlayers, base.maxPlayers),
		roomSize: num(r.roomSize, base.roomSize),
		tileCount: 0
	};
	// A game is a single room: its size is the player limit.
	if (mode === 'game') rules.roomSize = rules.maxPlayers;
	rules.tileCount = num(r.tileCount, suggestedTiles(rules.roomSize, rules.roundSeconds));
	if (!ROUND_SECONDS.includes(rules.roundSeconds as never)) error(400, 'Choose a valid round length.');
	if (!FINAL_OPTIONS.includes(rules.finalSeconds as never)) error(400, 'Choose a valid final countdown.');
	const tHi = maxTilesFor(rules.roundSeconds);
	if (rules.tileCount < TILE_LIMITS[0] || rules.tileCount > tHi) error(400, `Choose ${TILE_LIMITS[0]}–${tHi} tiles per room for this round length.`);
	const pace = tilePace(rules.roundSeconds, rules.tileCount);
	const [pLo, pHi] = PACE_LIMITS;
	if (pace < pLo || pace > pHi) error(400, `That's a tile every ${pace.toFixed(1)} s — keep it between ${pLo} and ${pHi} s (change the tiles or the round length).`);
	const [lo, hi] = RULE_LIMITS.minWordLength;
	if (rules.minWordLength < lo || rules.minWordLength > hi) error(400, 'The shortest word length is out of range.');
	if (mode === 'game') {
		if (rules.maxPlayers < ROOM_MIN || rules.maxPlayers > ROOM_MAX) error(400, `A game is for ${ROOM_MIN}–${ROOM_MAX} players.`);
		return rules;
	}
	if (rules.roomSize < ROOM_MIN || rules.roomSize > ROOM_MAX) error(400, `Rooms hold ${ROOM_MIN}–${ROOM_MAX} players.`);
	if (rules.stages < 2 || rules.stages > MAX_STAGES) error(400, `A tournament has 2–${MAX_STAGES} stages.`);
	const max = maxParticipants(rules.stages, rules.advance, rules.roomSize);
	if (!max) error(400, `With ${rules.stages} stages, fewer players must go through from each room.`);
	const plan = planStages(rules.maxPlayers, rules.stages, rules.advance, rules.roomSize);
	if (typeof plan === 'string') error(400, plan);
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
	const out = precheck(raw, { minWordLength: 1 }, depsFor(await loadModeration()));
	return 'word' in out ? { ok: true, message: `${out.word} would be accepted.` } : { ok: false, message: out.message };
}
