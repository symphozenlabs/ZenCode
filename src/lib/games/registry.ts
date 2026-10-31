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
		description: 'A real-time word-stealing game for one room of up to 15: letter tiles drop into a shared row, make words from them or steal a rival’s word by adding a tile. Run it for a big crowd from the Tournament module.',
		tags: ['Word stealing', 'Real-time', 'Party'],
		manageHref: '/admin/games/word-heist/moderation',
		manageLabel: 'Word moderation',
		presenterHref: (code) => `/admin/games/word-heist/live/${code}`
	},
	{
		id: 'scribble',
		name: 'Scribble Showdown',
		tagline: 'One draws. Everyone guesses. Fastest wins.',
		description: 'Players take turns drawing a secret word on their phone while the room races to guess it. Speed bonuses, streaks and harder words score big — and the big screen ends on a gallery of every drawing.',
		tags: ['Drawing', 'Party', 'Turn-based'],
		presenterHref: (code) => `/admin/games/scribble/live/${code}`
	}
];

/**
 * The Tournament module: not a game card, but a way of running any game as a
 * knockout. Word Heist tournaments keep their own engine and dashboard;
 * every other game's tournament is run from the tournament dashboard.
 */
export const TOURNAMENT: GameDefinition = {
	id: 'tournament',
	name: 'Tournament',
	tagline: 'Any game. Several stages. One champion.',
	description: 'Pick a game, keep its own rules and setup, and add tournament rules on top: who registers, how many stages, and how many go through. One QR code for everyone.',
	tags: ['Knockout', 'Multi-stage', 'Any game'],
	presenterHref: (code) => `/admin/games/tournament/live/${code}`
};

const ALL = [...GAMES, TOURNAMENT];
export const gameName = (id: string) => ALL.find((g) => g.id === id)?.name ?? id;
export const presenterHref = (gameType: string, code: string) => (ALL.find((g) => g.id === gameType) ?? GAMES[0]).presenterHref(code);

/** The phone screen for a session of `gameType`. */
export function playerHref(gameType: string, code: string): string {
	switch (gameType) {
		case 'flappy':
		case 'symba':
			return `/join/flap/${code}`;
		case 'word-heist':
			return `/join/heist/${code}`;
		case 'scribble':
			return `/join/draw/${code}`;
		case 'tournament':
			return `/join/t/${code}`;
		default:
			return `/join/${code}`;
	}
}
