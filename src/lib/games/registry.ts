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
	/** Admin page for the game's questions/content. */
	manageHref: string;
}

export const GAMES: GameDefinition[] = [
	{
		id: 'tech-word-rush',
		name: 'Tech Word Rush',
		tagline: 'Guess the tech. Earn the XP.',
		description: 'Players decode a technical term from its description and a partly revealed word. Hints cost XP, so speed and nerve both count.',
		tags: ['Word guessing', 'Live', 'Competitive'],
		manageHref: '/admin/games/tech-word-rush/questions'
	}
];

export const gameName = (id: string) => GAMES.find((g) => g.id === id)?.name ?? id;
