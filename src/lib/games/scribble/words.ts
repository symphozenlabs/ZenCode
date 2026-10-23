/**
 * Word packs for Scribble Showdown. Each turn the artist picks one easy, one
 * medium and one hard word; harder words pay everyone more (see MULTIPLIER).
 * Words are lowercase letters, digits and single spaces only.
 */

export type Difficulty = 'easy' | 'medium' | 'hard';
export type PackId = 'everyday' | 'tech' | 'india';

export interface WordEntry {
	w: string;
	d: Difficulty;
}

export interface WordPack {
	id: PackId;
	name: string;
	description: string;
	words: Record<Difficulty, string[]>;
}

export const PACKS: WordPack[] = [
	{
		id: 'everyday',
		name: 'Everyday',
		description: 'Animals, food, places and silly situations',
		words: {
			easy: ['cat', 'dog', 'sun', 'moon', 'tree', 'house', 'car', 'fish', 'apple', 'banana', 'star', 'ball', 'hat', 'cake', 'boat', 'bird', 'flower', 'cup', 'key', 'book', 'chair', 'clock', 'egg', 'shoe', 'rain', 'snake', 'pizza', 'heart', 'cloud', 'ice cream'],
			medium: ['rainbow', 'umbrella', 'snowman', 'guitar', 'bicycle', 'giraffe', 'octopus', 'volcano', 'castle', 'pirate', 'dragon', 'penguin', 'ladder', 'candle', 'mermaid', 'sandwich', 'lighthouse', 'butterfly', 'toothbrush', 'scissors', 'popcorn', 'kangaroo', 'waterfall', 'treasure chest', 'campfire', 'skateboard', 'hot air balloon', 'alarm clock'],
			hard: ['traffic jam', 'roller coaster', 'sleepwalking', 'haunted house', 'black hole', 'time travel', 'quicksand', 'jellyfish', 'hide and seek', 'solar eclipse', 'birthday party', 'magic trick', 'sunburn', 'earthquake', 'fireworks', 'tug of war', 'invisible man', 'monday morning', 'brain freeze', 'gravity']
		}
	},
	{
		id: 'tech',
		name: 'Tech',
		description: 'Gadgets, code and developer life',
		words: {
			easy: ['laptop', 'mouse', 'robot', 'phone', 'battery', 'bug', 'wifi', 'camera', 'email', 'charger', 'printer', 'headphones', 'tablet', 'drone', 'server', 'rocket'],
			medium: ['keyboard', 'password', 'firewall', 'satellite', 'database', 'hashtag', 'smartwatch', 'joystick', 'qr code', 'hard drive', 'selfie', 'emoji', 'spaceship', 'microchip', 'bluetooth', 'virus', 'router', 'hacker', 'pixel', 'cursor', 'download', 'recycle bin', 'search bar', 'video call'],
			hard: ['blockchain', 'artificial intelligence', 'cloud computing', 'infinite loop', 'open source', 'pull request', 'merge conflict', 'stack overflow', 'binary tree', 'phishing', 'captcha', 'rubber duck debugging', 'hackathon', 'dark mode', 'loading screen', 'blue screen', 'machine learning', 'virtual reality', 'deadline', 'coffee to code']
		}
	},
	{
		id: 'india',
		name: 'India',
		description: 'Food, festivals, landmarks and street life',
		words: {
			easy: ['chai', 'mango', 'kite', 'cricket', 'samosa', 'lotus', 'peacock', 'tiger', 'elephant', 'diya', 'cow', 'temple', 'train', 'coconut', 'bangle'],
			medium: ['taj mahal', 'auto rickshaw', 'rangoli', 'biryani', 'dosa', 'holi', 'diwali', 'saree', 'tabla', 'sitar', 'pani puri', 'jalebi', 'cricket bat', 'yoga', 'monsoon', 'bollywood', 'tiffin box', 'chess'],
			hard: ['lotus temple', 'india gate', 'gateway of india', 'dabbawala', 'chandrayaan', 'kabaddi', 'mehendi', 'kathakali', 'street food', 'filter coffee', 'bullock cart', 'red fort', 'qutub minar', 'traffic signal', 'local train', 'wedding baraat']
		}
	}
];

export const PACK_IDS = PACKS.map((p) => p.id);
export const isPackId = (v: unknown): v is PackId => PACK_IDS.includes(v as PackId);

/** Normalise a word for the pool: lowercase letters, digits and single spaces, 2–30 long. Null if unusable. */
export function cleanWord(raw: string): string | null {
	const w = raw
		.toLowerCase()
		.normalize('NFKD')
		.replace(/[̀-ͯ]/g, '')
		.replace(/[^a-z0-9 ]/g, '')
		.replace(/\s+/g, ' ')
		.trim();
	return w.length >= 2 && w.length <= 30 ? w : null;
}

/** A host's own word: rated by length, since we can't know how hard it is to draw. */
export const guessDifficulty = (w: string): Difficulty => (w.replace(/ /g, '').length <= 5 ? 'easy' : w.includes(' ') || w.length > 9 ? 'hard' : 'medium');

/** Comma- or line-separated words → unique clean entries (at most `max`). */
export function parseCustomWords(raw: string, max = 200): WordEntry[] {
	const seen = new Set<string>();
	const out: WordEntry[] = [];
	for (const part of raw.split(/[,\n;]/)) {
		const w = cleanWord(part);
		if (!w || seen.has(w)) continue;
		seen.add(w);
		out.push({ w, d: guessDifficulty(w) });
		if (out.length >= max) break;
	}
	return out;
}

/** Every word in the chosen packs plus the host's own; a host word replaces a pack word it duplicates. */
export function buildPool(packs: readonly PackId[], custom: readonly WordEntry[] = []): WordEntry[] {
	const pool = new Map<string, WordEntry>();
	for (const pack of PACKS) {
		if (!packs.includes(pack.id)) continue;
		for (const d of ['easy', 'medium', 'hard'] as const) for (const w of pack.words[d]) pool.set(w, { w, d });
	}
	for (const e of custom) pool.set(e.w, e);
	return [...pool.values()];
}
