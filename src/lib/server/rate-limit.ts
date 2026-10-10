const hits = new Map<string, number[]>();

/** Small in-memory sliding-window limiter (per server process). */
export function rateLimit(key: string, limit: number, windowMs: number): boolean {
	const now = Date.now();
	const recent = (hits.get(key) ?? []).filter((t) => now - t < windowMs);
	if (recent.length >= limit) {
		hits.set(key, recent);
		return false;
	}
	recent.push(now);
	hits.set(key, recent);
	if (hits.size > 5000) hits.clear();
	return true;
}
