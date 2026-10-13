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
	/** The name set on two lines for big titles. */
	title: [top: string, bottom: string];
	tagline: string;
	/** Key art shown on the join screen, the lobby and the take-off splash. */
	poster: string | null;
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
		title: ['Flappy', 'Bird'],
		tagline: 'One tap. Endless bamboo. One leaderboard.',
		poster: null,
		codePrefix: 'ZF',
		radius: BIRD_R,
		obstacle: ['pipe', 'pipes'],
		milestoneSound: null,
		crashSound: null,
		crashSticker: null
	},
	symba: {
		id: 'symba',
		name: 'Soar & Roar with Symba',
		title: ['Soar & Roar', 'with Symba'],
		tagline: 'A jetpack joyride through India’s skyline.',
		poster: '/games/symba/poster.webp',
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
