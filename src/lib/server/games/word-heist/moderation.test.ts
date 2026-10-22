import { describe, expect, it } from 'vitest';
import { applyMove, newBoard, precheck } from '$lib/games/word-heist/engine';
import { DEFAULT_BLOCKLIST, DEFAULT_RULES, type ModerationConfig } from '$lib/games/word-heist/types';
import { dictionarySize, isWord, starterPools } from './dictionary';
import { BLOCKED_MESSAGE, defaultModeration, moderateWord, parseBlocklist, screenRaw } from './moderation';

const config = defaultModeration();
const depsWith = (c: ModerationConfig) => ({ isWord, moderate: (w: string) => moderateWord(w, c), screen: (r: string) => screenRaw(r, c) });

describe('event blocklist', () => {
	it('starts with the requested entries, as editable config', () => {
		expect(config.blocklist).toEqual(DEFAULT_BLOCKLIST);
		expect(config.blocklist).not.toBe(DEFAULT_BLOCKLIST);
	});

	it.each(['SLUT', 'SEX', 'PORN', 'GAY', 'INNER', 'BRA', 'BRAS', 'SEXES'])('blocks %s', (w) => {
		expect(moderateWord(w, config)).toBe(BLOCKED_MESSAGE);
	});

	it.each(['WINNER', 'BRAIN', 'BRAVE', 'ZEBRA', 'ESSEX', 'SEXTANT', 'DINNER'])('does not substring-match %s', (w) => {
		expect(moderateWord(w, config)).toBeNull();
	});

	it('supports prefix entries and can be emptied', () => {
		const c = { ...config, blocklist: ['porn*'] };
		expect(moderateWord('PORNOGRAPHY', c)).toBe(BLOCKED_MESSAGE);
		expect(moderateWord('BRA', { ...config, blocklist: [] })).toBeNull();
	});

	it('validates an organiser list', () => {
		expect(parseBlocklist([' Sex ', 'sex', 'porn*', ''])).toEqual(['porn*', 'sex']);
		expect(parseBlocklist(['s3x'])).toMatch(/2–30 letters/);
		expect(parseBlocklist('sex')).toMatch(/list/);
		expect(parseBlocklist(Array(501).fill('ab'))).toMatch(/500/);
	});
});

describe('general profanity filter', () => {
	it('is a separate layer from the blocklist', () => {
		const empty = { ...config, blocklist: [] };
		expect(moderateWord('FUCK', empty)).toBe(BLOCKED_MESSAGE);
		expect(moderateWord('WHORE', empty)).toBe(BLOCKED_MESSAGE);
		expect(moderateWord('GAY', empty)).toBeNull(); // only the event list blocks it
	});
});

describe('obfuscation', () => {
	it('undoes look-alikes and separators when enabled', () => {
		expect(screenRaw('s3x', config)).toBe(BLOCKED_MESSAGE);
		expect(screenRaw('s-e-x', config)).toBe(BLOCKED_MESSAGE);
		expect(screenRaw('p0rn', config)).toBe(BLOCKED_MESSAGE);
		expect(screenRaw('crater', config)).toBeNull();
		expect(screenRaw('s3x', { ...config, detectObfuscation: false })).toBeNull();
	});

	it('a disguised word is reported as blocked, not as a typo', () => {
		expect(precheck('create', 's.e.x', DEFAULT_RULES, depsWith(config))).toEqual({ message: BLOCKED_MESSAGE });
		expect(precheck('create', 's.e.x', DEFAULT_RULES, depsWith({ ...config, detectObfuscation: false }))).toEqual({ message: 'Use letters A–Z only.' });
	});
});

describe('dictionary (SCOWL)', () => {
	it('loads a full-size word list', () => {
		expect(dictionarySize()).toBeGreaterThan(70_000);
	});

	it.each(['CARE', 'RACE', 'CRATER', 'CAT', 'BOXES', 'BERRIES', 'TRACE', 'WINNER'])('knows %s', (w) => expect(isWord(w)).toBe(true));
	it.each(['XQZT', 'CRATERX', 'QI'])('rejects %s', (w) => expect(isWord(w)).toBe(false));

	it('the brief’s examples work against the real dictionary', () => {
		const deps = depsWith(config);
		const b = newBoard({ round: 1, roomId: 'r', number: 1, rules: DEFAULT_RULES, players: [{ id: 'a', name: 'A' }, { id: 'b', name: 'B' }], starters: { a: ['CAT', 'BOX'], b: ['CARE', 'BERRY'] }, now: 0 });
		const live = { ...b, status: 'playing' as const, endsAt: 10_000 };
		const id = (t: string) => Object.entries(live.words).find(([, w]) => w.text === t)![0];
		const steal = (from: string, to: string) => applyMove(live, { requestId: `r-${from}-${to}`, playerId: 'a', kind: 'steal', text: to, sourceId: id(from) }, 1, deps).result;
		expect(steal('CARE', 'RACE')).toMatchObject({ ok: false });
		expect(steal('CAT', 'CATS')).toMatchObject({ ok: false, message: expect.stringMatching(/plural/) });
		expect(steal('BOX', 'BOXES')).toMatchObject({ ok: false, message: expect.stringMatching(/plural/) });
		expect(steal('BERRY', 'BERRIES')).toMatchObject({ ok: false, message: expect.stringMatching(/plural/) });
		expect(steal('CARE', 'CRATER')).toMatchObject({ ok: true, gained: 6 });
		expect(steal('CAT', 'ACTS')).toMatchObject({ ok: true });
	});

	it('has enough clean, common starter words for any room', () => {
		const pools = starterPools((w) => !moderateWord(w, config));
		for (const len of [3, 4, 5]) {
			expect(pools[len].length).toBeGreaterThan(100);
			for (const w of pools[len]) {
				expect(w).toHaveLength(len);
				expect(isWord(w)).toBe(true);
				expect(moderateWord(w, config)).toBeNull();
			}
		}
	});
});
