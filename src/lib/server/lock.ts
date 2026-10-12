const locks = new Map<string, Promise<unknown>>();

/**
 * Run `fn` after any earlier call with the same key has finished (per server
 * process). The live games use it instead of Firestore transactions, which
 * this SDK runs roughly one at a time: one player's requests are queued, while
 * different players run in parallel.
 */
export function withLock<T>(key: string, fn: () => Promise<T>): Promise<T> {
	const run = (locks.get(key) ?? Promise.resolve()).catch(() => {}).then(fn);
	locks.set(key, run);
	run.finally(() => locks.get(key) === run && locks.delete(key)).catch(() => {});
	return run;
}
