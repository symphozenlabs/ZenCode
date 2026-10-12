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
		description: 'An ice breaker for the whole room. Players fly as often as they like until time runs out — each new flight replaces their last score, so only the latest counts.',
		tags: ['Ice breaker', 'Arcade', 'Timed'],
		presenterHref: (code) => `/admin/games/flappy/live/${code}`
	}
];

export const gameName = (id: string) => GAMES.find((g) => g.id === id)?.name ?? id;
export const presenterHref = (gameType: string, code: string) => (GAMES.find((g) => g.id === gameType) ?? GAMES[0]).presenterHref(code);
