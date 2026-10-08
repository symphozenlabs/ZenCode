import { doc, getDoc } from 'firebase/firestore';
import { mergeSiteConfig, DEFAULT_SITE_CONFIG, type SiteConfig } from '$lib/config/site';
import { adminDb, hasAdminCredentials } from './firebase-admin';
import { hasPublicConfig, publicDb } from './firebase-public';

let cache: { value: SiteConfig; at: number } | undefined;
const TTL_MS = 30_000;
const TIMEOUT_MS = 5_000;

function withTimeout<T>(p: Promise<T>): Promise<T> {
	return Promise.race([
		p,
		new Promise<T>((_, reject) => setTimeout(() => reject(new Error('timed out')), TIMEOUT_MS))
	]);
}

async function readStored(): Promise<unknown> {
	if (hasAdminCredentials()) {
		return (await adminDb().collection('config').doc('site').get()).data();
	}
	// config/site is publicly readable, so the plain client SDK is enough.
	return (await getDoc(doc(publicDb(), 'config', 'site'))).data();
}

/**
 * Read the public site config. Falls back to defaults (all facts "To be
 * announced") if Firestore is unreachable so the public site never breaks.
 */
export async function getSiteConfig({ fresh = false } = {}): Promise<SiteConfig> {
	if (!fresh && cache && Date.now() - cache.at < TTL_MS) return cache.value;
	if (!hasAdminCredentials() && !hasPublicConfig()) return structuredClone(DEFAULT_SITE_CONFIG);
	try {
		const value = mergeSiteConfig(await withTimeout(readStored()));
		cache = { value, at: Date.now() };
		return value;
	} catch (err) {
		console.error('[site-config] falling back to defaults:', (err as Error).message);
		return cache?.value ?? structuredClone(DEFAULT_SITE_CONFIG);
	}
}
