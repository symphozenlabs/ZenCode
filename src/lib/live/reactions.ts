/** Emoji reactions phones can send; they float up on the big screen. */
export const REACTIONS = [
	{ id: 'heart', emoji: '❤️', label: 'Love' },
	{ id: 'fire', emoji: '🔥', label: 'Fire' },
	{ id: 'clap', emoji: '👏', label: 'Applause' },
	{ id: 'laugh', emoji: '😂', label: 'Funny' },
	{ id: 'wow', emoji: '😮', label: 'Wow' },
	{ id: 'party', emoji: '🎉', label: 'Celebrate' }
] as const;

export type ReactionId = (typeof REACTIONS)[number]['id'];

const BY_ID = new Map<string, (typeof REACTIONS)[number]>(REACTIONS.map((r) => [r.id, r]));

export const isReaction = (id: unknown): id is ReactionId => typeof id === 'string' && BY_ID.has(id);
export const reactionEmoji = (id: ReactionId) => BY_ID.get(id)!.emoji;
