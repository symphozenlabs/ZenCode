import { adminDb, hasAdminCredentials } from '$lib/server/firebase-admin';
import { verifyAdminToken } from './admin-auth';
import { LiveHub } from './hub';
import { FirestoreRepo, MemoryRepo, type LiveRepo } from './repo';

const KEY = '__zencodeLive';
const REPO_KEY = '__zencodeLiveRepo';
/** The cached hub may be built from an older version of the classes (dev reload). */
type CachedHub = LiveHub | { close?: () => void; repo?: Partial<LiveRepo> };
type G = typeof globalThis & { [KEY]?: CachedHub; [REPO_KEY]?: Partial<LiveRepo> };

const REPO_METHODS: (keyof LiveRepo)[] = [
	'listSessions',
	'getSession',
	'putSession',
	'patchSession',
	'deleteSession',
	'claimJoinCode',
	'releaseJoinCode',
	'resolveJoinCode',
	'listParticipants',
	'putParticipant',
	'putParticipants',
	'clearParticipants',
	'listResponses',
	'createResponse',
	'deleteResponses',
	'clearResponses'
];

/** Copy an older in-memory store into a new one through its public methods. */
async function copyMemory(from: Partial<LiveRepo>, to: LiveRepo) {
	for (const summary of (await from.listSessions?.()) ?? []) {
		const s = await from.getSession?.(summary.id);
		if (!s) continue;
		await to.putSession(s);
		if (s.joinCode) await to.claimJoinCode(s.joinCode, s.id);
		for (const p of (await from.listParticipants?.(s.id)) ?? []) await to.putParticipant(s.id, p);
		for (const r of (await from.listResponses?.(s.id)) ?? []) await to.createResponse(s.id, r);
	}
}

/** Every method waits for `ready` (the copy above) before running. */
function gated<T extends object>(target: T, ready: Promise<unknown>): T {
	return new Proxy(target, {
		get(t, key, receiver) {
			const v = Reflect.get(t, key, receiver);
			return typeof v === 'function' ? async (...args: unknown[]) => (await ready, v.apply(t, args)) : v;
		}
	});
}

function memoryRepo(g: G, previous: Partial<LiveRepo> | undefined): LiveRepo {
	if (previous instanceof MemoryRepo) return previous;
	const fresh = new MemoryRepo();
	if (!previous) return fresh;
	// Dev hot reload replaced the repo class: carry the in-memory sessions over.
	const ready = copyMemory(previous, fresh).catch((err) => console.error('[live] could not carry over in-memory sessions', err));
	return gated(fresh, ready);
}

/**
 * The process-wide live hub. Stored on globalThis so the SvelteKit routes,
 * the dev-server upgrade hook and the production server.js share one
 * instance. Live state is in-memory: run a single server process.
 *
 * In `vite dev`, editing the live server code re-evaluates this module with
 * new classes. A hub built from the old code is then closed and replaced —
 * clients reconnect on their own and resume from the repository.
 */
export function liveHub(): LiveHub {
	const g = globalThis as G;
	const existing = g[KEY];
	if (existing instanceof LiveHub) return existing;

	const previousRepo = g[REPO_KEY] ?? existing?.repo;
	if (existing) {
		console.info('[live] Live server code changed — restarting the live hub.');
		existing.close?.();
	}

	let repo: LiveRepo;
	if (hasAdminCredentials()) {
		repo = new FirestoreRepo(adminDb());
	} else {
		console.warn('[live] No Firebase Admin credentials — live sessions are stored in memory and lost on restart.');
		repo = memoryRepo(g, previousRepo && REPO_METHODS.some((m) => typeof previousRepo[m] === 'function') ? previousRepo : undefined);
	}
	const hub = new LiveHub({ repo, verifyAdmin: verifyAdminToken });
	g[REPO_KEY] = repo;
	g[KEY] = hub;
	return hub;
}
