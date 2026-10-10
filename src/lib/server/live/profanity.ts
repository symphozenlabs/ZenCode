/**
 * Small local profanity filter for nicknames and audience text.
 * Matches whole words after undoing common character swaps (sh1t → shit),
 * plus a few unambiguous stems inside run-together text (“bigfuckguy”). No “shit” or “cunt” stems: they would block Kshitij and Scunthorpe.
 */
const WORDS = [
	'arse', 'arsehole', 'ass', 'asshole', 'bastard', 'bitch', 'bitches', 'bollocks', 'bullshit', 'cock',
	'cunt', 'dick', 'dickhead', 'dildo', 'douche', 'fag', 'faggot', 'fuck', 'fucked',
	'fucker', 'fucking', 'jerkoff', 'motherfucker', 'nazi', 'nigga', 'nigger', 'piss', 'porn', 'prick',
	'pussy', 'retard', 'shit', 'shitty', 'slut', 'twat', 'wank', 'wanker', 'whore',
	// common Indian-English slang
	'bhenchod', 'chutiya', 'gandu', 'madarchod', 'randi'
];
const STEMS = ['fuck', 'bitch', 'nigg', 'chutiya', 'madarchod', 'bhenchod', 'whore'];

const SWAPS: Record<string, string> = { '0': 'o', '1': 'i', '!': 'i', '3': 'e', '4': 'a', '@': 'a', '5': 's', '$': 's', '7': 't', '8': 'b' };
const words = new Set(WORDS);

function normalize(text: string) {
	return text
		.toLowerCase()
		.normalize('NFKD')
		.replace(/[̀-ͯ]/g, '')
		.replace(/[013!4@5$78]/g, (c) => SWAPS[c])
		.replace(/(.)\1{2,}/g, '$1$1'); // fuuuuck → fuuck
}

const squeeze = (w: string) => w.replace(/(.)\1+/g, '$1');

export function hasProfanity(text: string): boolean {
	const norm = normalize(text);
	for (const w of norm.split(/[^a-z]+/)) {
		if (w && (words.has(w) || words.has(squeeze(w)))) return true;
	}
	const joined = squeeze(norm.replace(/[^a-z]/g, ''));
	return STEMS.some((s) => joined.includes(s));
}

/** Replace offending words with bullets, keeping the rest readable. */
export function maskProfanity(text: string): string {
	return text.replace(/\S+/g, (token) => (hasProfanity(token) ? '•'.repeat(Math.min(token.length, 6)) : token));
}
