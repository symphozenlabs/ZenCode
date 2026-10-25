/**
 * Word Heist avatars and player colours. A player picks an avatar when they
 * join; nobody in a room shares one. Each player in a room also gets a
 * colour (by seat) used for their avatar ring and their words.
 */

/** 100 avatars: animals, plus a few friends. Stored by index. */
export const AVATARS = [
	'🐶', '🐱', '🐭', '🐹', '🐰', '🦊', '🐻', '🐼', '🐨', '🐯',
	'🦁', '🐮', '🐷', '🐸', '🐵', '🐔', '🐧', '🐦', '🐤', '🦆',
	'🦅', '🦉', '🦇', '🐺', '🐗', '🐴', '🦄', '🐝', '🐛', '🦋',
	'🐌', '🐞', '🐜', '🦗', '🦂', '🐢', '🐍', '🦎', '🦖', '🦕',
	'🐙', '🦑', '🦐', '🦞', '🦀', '🐡', '🐠', '🐟', '🐬', '🐳',
	'🐋', '🦈', '🐊', '🐅', '🐆', '🦓', '🦍', '🐘', '🦛', '🦏',
	'🐪', '🐫', '🦒', '🦘', '🐃', '🐂', '🐄', '🐎', '🐖', '🐏',
	'🐑', '🦙', '🐐', '🦌', '🐕', '🐩', '🐈', '🐓', '🦃', '🦚',
	'🦜', '🦢', '🐇', '🦝', '🦡', '🐁', '🐀', '🦔', '🐉', '🐲',
	'🦩', '🦥', '🦦', '🦨', '🦧', '🐣', '🐥', '👾', '🤖', '👻'
] as const;
export const AVATAR_COUNT = AVATARS.length;

export const isAvatar = (v: unknown): v is number => Number.isInteger(v) && (v as number) >= 0 && (v as number) < AVATAR_COUNT;
export const avatarOf = (i: number | undefined) => AVATARS[(((i ?? 0) % AVATAR_COUNT) + AVATAR_COUNT) % AVATAR_COUNT];

/**
 * Everyone in a room gets a different avatar: whoever comes first in `chosen`
 * keeps theirs; a later player with the same one (or a bad pick) gets the
 * next avatar nobody in the room picked. Two passes, so a bumped player
 * never takes the avatar someone else asked for.
 */
export function uniqueAvatars(chosen: readonly number[]): number[] {
	const used = new Set<number>();
	const out = chosen.map((want) => {
		if (!isAvatar(want) || used.has(want)) return -1;
		used.add(want);
		return want;
	});
	return out.map((a, i) => {
		if (a >= 0) return a;
		let next = isAvatar(chosen[i]) ? (chosen[i] + 1) % AVATAR_COUNT : 0;
		while (used.has(next)) next = (next + 1) % AVATAR_COUNT;
		used.add(next);
		return next;
	});
}

/** One colour per seat in a room (up to 15 players), all readable on the dark stage. */
export const PLAYER_COLORS = [
	'#e8543b', // red
	'#2b9bd6', // blue
	'#2fb67a', // green
	'#a35de0', // purple
	'#f08a24', // orange
	'#e0559b', // pink
	'#18b3a8', // teal
	'#7b8cf0', // periwinkle
	'#b5c934', // lime
	'#c97a4a', // copper
	'#5ad1e6', // cyan
	'#d94c6b', // rose
	'#8fbf5a', // olive
	'#c9a0f5', // lavender
	'#e8a07a' // peach
] as const;

export const colorOf = (seat: number | undefined) => PLAYER_COLORS[(seat ?? 0) % PLAYER_COLORS.length];

/** Dark or white text, whichever reads better on `hex`. */
export function inkOn(hex: string) {
	const n = parseInt(hex.slice(1), 16);
	const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((c) => {
		const s = c / 255;
		return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
	});
	return 0.2126 * r + 0.7152 * g + 0.0722 * b > 0.3 ? '#14110a' : '#ffffff';
}
