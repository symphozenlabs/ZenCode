/**
 * Live games available in the admin Games area. Add an entry here (plus its
 * routes under /admin/games/<id>) to list a new game.
 */
export interface GameDefinition {
	id: string;
	name: string;
	tagline: string;
	description: string;
	tags: string[];
	/** Admin page for the game's questions/content, if it has any. */
	manageHref?: string;
	/** Button label for manageHref (default "Question bank"). */
	manageLabel?: string;
	/** Card art, if any. */
	poster?: string;
	/** Big-screen page for a running session. */
	presenterHref: (code: string) => string;
}

export const GAMES: GameDefinition[] = [
	{
		id: 'tech-word-rush',
		name: 'Tech Word Rush',
		tagline: 'Guess the tech. Earn the XP.',
		description: 'Players decode a technical term from its description and a partly revealed word. Hints cost XP, so speed and nerve both count.',
		tags: ['Word guessing', 'Live', 'Competitive'],
		manageHref: '/admin/games/tech-word-rush/questions',
		presenterHref: (code) => `/admin/games/tech-word-rush/live/${code}`
	},
	{
		id: 'flappy',
		name: 'Flappy Bird',
		tagline: 'One tap. Endless bamboo. One leaderboard.',
		description: 'An ice breaker for the whole room. Players fly as often as they like until time runs out — only their best flight counts.',
		tags: ['Ice breaker', 'Arcade', 'Timed'],
		presenterHref: (code) => `/admin/games/flappy/live/${code}`
	},
	{
		id: 'symba',
		name: 'Soar & Roar with Symba',
		tagline: 'A jetpack joyride through India’s skyline.',
		description: 'Our mascot Symba jetpacks between skyscrapers and Indian landmarks. Same rules as Flappy Bird — fly as often as you like, only your best flight counts — and a roar at every 10 points.',
		tags: ['Ice breaker', 'Mascot', 'Timed'],
		poster: '/games/symba/poster-sm.webp',
		presenterHref: (code) => `/admin/games/flappy/live/${code}`
	},
	{
		id: 'word-heist',
		name: 'Word Heist',
		tagline: 'Make words. Steal words. Keep the most letters.',
		description: 'A knockout word-stealing tournament for big crowds. Everyone scans one QR code, rooms of about ten are made automatically, and the top two in each room go through until one room plays the final.',
		tags: ['Tournament', 'Word stealing', 'Multi-room'],
		manageHref: '/admin/games/word-heist/moderation',
		manageLabel: 'Word moderation',
		presenterHref: (code) => `/admin/games/word-heist/live/${code}`
	}
];

export const gameName = (id: string) => GAMES.find((g) => g.id === id)?.name ?? id;
export const presenterHref = (gameType: string, code: string) => (GAMES.find((g) => g.id === gameType) ?? GAMES[0]).presenterHref(code);
