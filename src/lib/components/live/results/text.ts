/** Stable 32-bit hash of a string (FNV-1a). */
export function hash(s: string): number {
	let h = 2166136261;
	for (const ch of s) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
	return h >>> 0;
}

/** Chart token (1–6) for a piece of audience text, stable across updates. */
export const hashTint = (s: string) => (hash(s) % 6) + 1;

/** A small stable tilt in degrees (−max..max) so cards feel hand-placed. */
export const hashTilt = (s: string, max = 1.6) => ((hash(s) % 1000) / 1000 - 0.5) * 2 * max;

export const fmtNum = (n: number) => n.toLocaleString('en-IN', { maximumFractionDigits: 1 });
