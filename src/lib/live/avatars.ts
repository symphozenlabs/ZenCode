/** Participant avatars: a system emoji on a tinted disc (no image assets). */
export const AVATARS = [
	{ id: 'fox', emoji: '🦊', label: 'Fox' },
	{ id: 'panda', emoji: '🐼', label: 'Panda' },
	{ id: 'owl', emoji: '🦉', label: 'Owl' },
	{ id: 'frog', emoji: '🐸', label: 'Frog' },
	{ id: 'tiger', emoji: '🐯', label: 'Tiger' },
	{ id: 'koala', emoji: '🐨', label: 'Koala' },
	{ id: 'octopus', emoji: '🐙', label: 'Octopus' },
	{ id: 'penguin', emoji: '🐧', label: 'Penguin' },
	{ id: 'unicorn', emoji: '🦄', label: 'Unicorn' },
	{ id: 'turtle', emoji: '🐢', label: 'Turtle' },
	{ id: 'bee', emoji: '🐝', label: 'Bee' },
	{ id: 'lion', emoji: '🦁', label: 'Lion' },
	{ id: 'whale', emoji: '🐳', label: 'Whale' },
	{ id: 'monkey', emoji: '🐵', label: 'Monkey' },
	{ id: 'hedgehog', emoji: '🦔', label: 'Hedgehog' },
	{ id: 'cat', emoji: '🐱', label: 'Cat' }
] as const;

export type AvatarId = (typeof AVATARS)[number]['id'];

const byId = new Map<string, (typeof AVATARS)[number]>(AVATARS.map((a) => [a.id, a]));

export const isAvatar = (id: unknown): id is AvatarId => typeof id === 'string' && byId.has(id);
export const avatarOf = (id: string) => byId.get(id) ?? AVATARS[0];

/** Tint token (1–6) for an avatar disc — see --color-chart-* in app.css. */
export const avatarTint = (id: string) => (Math.max(0, AVATARS.findIndex((a) => a.id === id)) % 6) + 1;
