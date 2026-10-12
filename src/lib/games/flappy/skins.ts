import { BIRD_R } from './engine';

/**
 * The tap-to-fly games share one engine, server and leaderboard; a skin is
 * everything that differs: name, art, hitbox and sounds.
 */

export const GAME_TYPES = ['flappy', 'symba'] as const;
export type FlyGame = (typeof GAME_TYPES)[number];

export interface Skin {
	id: FlyGame;
	name: string;
	tagline: string;
	/** First two letters of a game code. */
	codePrefix: 'ZF' | 'ZS';
	/** Hitbox radius in world units. */
	radius: number;
	/** What a point is for (shown as "12 pipes"). */
	obstacle: [singular: string, plural: string];
	/** Clip played at every 10 points, instead of the synthesised fanfare. */
	milestoneSound: string | null;
	/** Clip and comic sticker for a crash (a building or the ground). */
	crashSound: string | null;
	crashSticker: string | null;
}

export const SKINS: Record<FlyGame, Skin> = {
	flappy: {
		id: 'flappy',
		name: 'Flappy Bird',
		tagline: 'One tap. Endless bamboo. One leaderboard.',
		codePrefix: 'ZF',
		radius: BIRD_R,
		obstacle: ['pipe', 'pipes'],
		milestoneSound: null,
		crashSound: null,
		crashSticker: null
	},
	symba: {
		id: 'symba',
		name: 'Symba Ride',
		tagline: 'Jetpack Symba through India’s skyline.',
		codePrefix: 'ZS',
		radius: 16,
		obstacle: ['building', 'buildings'],
		milestoneSound: '/games/symba/singam-tone.mp3',
		crashSound: '/games/symba/faah.mp3',
		crashSticker: '/games/symba/faah.webp'
	}
};

export const isFlyGame = (v: unknown): v is FlyGame => GAME_TYPES.includes(v as FlyGame);
export const skinFor = (gameType: string | null | undefined): Skin => SKINS[isFlyGame(gameType) ? gameType : 'flappy'];
