import type { LeaderboardEntry } from '$lib/live/types';

interface Player {
	id: string;
	nickname: string;
	avatar: string;
	score: number;
	joinedAt: number;
}

/**
 * Standard competition ranking (1, 2, 2, 4): equal scores share a rank.
 * Display order within a tie is by who joined first, so it is stable.
 */
export function rankOf<T extends { id: string; joinedAt: number }>(list: T[], score: (p: T) => number): Map<string, number> {
	const sorted = [...list].sort((a, b) => score(b) - score(a) || a.joinedAt - b.joinedAt);
	const ranks = new Map<string, number>();
	let prevScore = Number.NaN;
	let prevRank = 0;
	sorted.forEach((p, i) => {
		const s = score(p);
		const rank = s === prevScore ? prevRank : i + 1;
		ranks.set(p.id, rank);
		prevScore = s;
		prevRank = rank;
	});
	return ranks;
}

/**
 * Full leaderboard. `gained` holds the points each player earned on the most
 * recently revealed slide; previous ranks are computed from score - gained.
 */
export function buildLeaderboard(players: Player[], gained: Map<string, number>): LeaderboardEntry[] {
	const now = rankOf(players, (p) => p.score);
	const before = rankOf(players, (p) => p.score - (gained.get(p.id) ?? 0));
	return players
		.map((p) => ({
			id: p.id,
			nickname: p.nickname,
			avatar: p.avatar,
			score: p.score,
			gained: gained.get(p.id) ?? 0,
			rank: now.get(p.id)!,
			prevRank: before.get(p.id)!,
			joinedAt: p.joinedAt
		}))
		.sort((a, b) => a.rank - b.rank || a.joinedAt - b.joinedAt)
		.map(({ joinedAt: _, ...e }) => e);
}
