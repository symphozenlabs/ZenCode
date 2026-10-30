import { assignRooms, fitStages, maxParticipants, planStages, type Stage } from '$lib/games/word-heist/allocation';
import { FINALIST_LIMITS, MAX_PLAYERS, MAX_STAGES, ROOMS_LIMITS, type EliminationRules, type PlannedStage, type PodiumEntry, type RoomsRules, type StageRanking, type TournamentRules } from './types';

/**
 * Tournament shapes. Pure and deterministic.
 *
 * Elimination (whole-room games): every stage is one game for everyone still
 * in; the cut after each stage is spread evenly (in ratio) from the players
 * who start down to the finalists, so each stage knocks out a similar share.
 * E.g. 100 players, 3 stages, 10 finalists → 100 → 32 → 10.
 *
 * Rooms (small-group games): Word Heist's allocation with this game's limits —
 * the fewest rooms of at most `roomSize`, the top `advance` of each go
 * through, one final room.
 */

export { assignRooms };

/** The stages for `n` players over `stages` stages ending with `finalists`, or why that can't work. */
export function planElimination(n: number, stages: number, finalists: number): PlannedStage[] | string {
	if (!Number.isInteger(n) || n < 2) return 'At least 2 players are needed.';
	if (n > MAX_PLAYERS) return `At most ${MAX_PLAYERS} participants.`;
	if (!Number.isInteger(stages) || stages < 1 || stages > MAX_STAGES) return `Choose 1–${MAX_STAGES} stages.`;
	if (!Number.isInteger(finalists) || finalists < FINALIST_LIMITS[0] || finalists > FINALIST_LIMITS[1]) return `Between ${FINALIST_LIMITS[0]} and ${FINALIST_LIMITS[1]} players can play the final.`;
	if (stages === 1) return [{ stage: 1, players: n, sizes: [n], advance: 0, final: true }];
	if (n <= finalists) return `Not enough players: ${stages} stages need more than ${finalists} participants (the final has ${finalists}).`;
	// Each cut keeps the same share: sizes fall from n to finalists in ratio.
	const sizes = [n];
	for (let k = 1; k < stages; k++) {
		let s = k === stages - 1 ? finalists : Math.round(n * Math.pow(finalists / n, k / (stages - 1)));
		if (s >= sizes[k - 1]) s = sizes[k - 1] - 1;
		if (s < finalists) return `Not enough players for ${stages} stages: every stage must knock someone out before a final of ${finalists}. Use fewer stages or fewer finalists.`;
		sizes.push(s);
	}
	return sizes.map((players, i) => ({ stage: i + 1, players, sizes: [players], advance: i === stages - 1 ? 0 : sizes[i + 1], final: i === stages - 1 }));
}

/**
 * The elimination actually played with the players who turned up: `stages`
 * if it works, else fewer (a small crowd goes straight to the final).
 */
export function fitElimination(n: number, stages: number, finalists: number): PlannedStage[] | null {
	for (let s = Math.max(1, stages); s >= 1; s--) {
		const plan = planElimination(n, s, finalists);
		if (typeof plan !== 'string') return plan;
	}
	return null;
}

export const planRooms = (n: number, r: Pick<RoomsRules, 'stages' | 'advance' | 'roomSize'>): Stage[] | string => planStages(n, r.stages, r.advance, r.roomSize, ROOMS_LIMITS);
export const fitRooms = (n: number, stages: number, r: Pick<RoomsRules, 'advance' | 'roomSize'>): Stage[] | null => fitStages(n, stages, r.advance, r.roomSize, ROOMS_LIMITS);
export const maxRoomsParticipants = (r: Pick<RoomsRules, 'stages' | 'advance' | 'roomSize'>) => maxParticipants(r.stages, r.advance, r.roomSize, ROOMS_LIMITS);

/** The plan for `n` players under `rules` exactly as set, or why it can't work. */
export function planFor(rules: TournamentRules, n: number): PlannedStage[] | string {
	return rules.format === 'elimination' ? planElimination(n, rules.stages, rules.finalists) : planRooms(n, rules);
}

/** The plan for `n` players with at most `stages` stages left, shortened if they can't fill it. Null if impossible. */
export function fitFor(rules: TournamentRules, n: number, stages = rules.stages): PlannedStage[] | null {
	return rules.format === 'elimination' ? fitElimination(n, stages, rules.finalists) : fitRooms(n, stages, rules);
}

/**
 * Validate rules from a form or request body. Returns the rules, or a plain
 * reason. `maxPlayers` must itself make a valid plan, so a full tournament
 * always works.
 */
export function parseRules(raw: unknown): TournamentRules | string {
	const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
	const num = (v: unknown) => (typeof v === 'number' && Number.isInteger(v) ? v : typeof v === 'string' && /^\d+$/.test(v.trim()) ? Number(v) : NaN);
	const maxPlayers = num(r.maxPlayers);
	const stages = num(r.stages);
	if (!Number.isInteger(maxPlayers) || maxPlayers < 2) return 'Enter the number of participants.';
	if (maxPlayers > MAX_PLAYERS) return `At most ${MAX_PLAYERS} participants.`;
	if (!Number.isInteger(stages) || stages < 2 || stages > MAX_STAGES) return `A tournament has 2–${MAX_STAGES} stages.`;
	if (r.format === 'rooms') {
		const rules: RoomsRules = { format: 'rooms', maxPlayers, stages, roomSize: num(r.roomSize), advance: num(r.advance) };
		const plan = planRooms(maxPlayers, rules);
		return typeof plan === 'string' ? plan : rules;
	}
	const rules: EliminationRules = { format: 'elimination', maxPlayers, stages, finalists: num(r.finalists) };
	const plan = planElimination(maxPlayers, stages, rules.finalists);
	return typeof plan === 'string' ? plan : rules;
}

export function describeStage(st: PlannedStage, format: 'elimination' | 'rooms'): string {
	if (st.final) return `${st.players} players · one ${format === 'rooms' ? 'room' : 'game'} · top 3 on the podium`;
	if (format === 'elimination') return `${st.players} players · top ${st.advance} go through`;
	return `${st.players} players · ${st.sizes.length} rooms · top ${st.advance} from each room go through`;
}

// ── Results ─────────────────────────────────────────────────────────────

/** A game session's leaderboard entry as every game writes it (XP or score). */
export interface LeaderboardLike {
	id: string;
	name: string;
	xp?: number;
	score?: number;
}

/**
 * A room's ranking from its game's final leaderboard, in the game's own
 * order (each game breaks its ties). Members the leaderboard no longer
 * lists (removed for going offline) are placed last with 0.
 */
export function rankingOf(leaderboard: readonly LeaderboardLike[], members: readonly { id: string; name: string }[]): StageRanking[] {
	const ids = new Set(members.map((m) => m.id));
	const out: StageRanking[] = [];
	for (const e of leaderboard) {
		if (!ids.has(e.id)) continue;
		ids.delete(e.id);
		out.push({ id: e.id, name: e.name, score: e.score ?? e.xp ?? 0, rank: 0 });
	}
	for (const m of members) if (ids.has(m.id)) out.push({ id: m.id, name: m.name, score: 0, rank: 0 });
	// Standard competition ranking (1, 2, 2, 4) on score, keeping the game's order.
	let rank = 0;
	return out.map((e, i) => ({ ...e, rank: (rank = i === 0 || e.score !== out[i - 1].score ? i + 1 : rank) }));
}

/** The first `count` of a ranking (the cutoff is the game's own order; no ties are left open). */
export const advancing = (ranking: readonly StageRanking[], count: number): string[] => ranking.slice(0, Math.max(0, count)).map((e) => e.id);

export const podiumOf = (ranking: readonly StageRanking[]): PodiumEntry[] =>
	ranking.slice(0, 3).map((e, i) => ({ playerId: e.id, name: e.name, score: e.score, rank: i + 1 }));

/**
 * Next stage's roster from this stage's rooms: every room's 1st, then every
 * room's 2nd, … so dealing round-robin keeps last stage's winners apart.
 */
export function nextRoster(rooms: readonly { advancing: readonly string[] }[]): string[] {
	const out: string[] = [];
	const most = Math.max(0, ...rooms.map((r) => r.advancing.length));
	for (let p = 0; p < most; p++) for (const r of rooms) if (r.advancing[p]) out.push(r.advancing[p]);
	return out;
}
