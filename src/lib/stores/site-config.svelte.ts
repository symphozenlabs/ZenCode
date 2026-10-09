import { doc, onSnapshot, setDoc, type Unsubscribe } from 'firebase/firestore';
import { db } from '$lib/firebase/client';
import { DEFAULT_SITE_CONFIG, mergeSiteConfig, type EventConfig, type EventId, type SiteConfig } from '$lib/config/site';

/** Live view of config/site for admin pages, with typed save helpers. */
class SiteConfigStore {
	value = $state<SiteConfig>(structuredClone(DEFAULT_SITE_CONFIG));
	status = $state<'idle' | 'loading' | 'ready' | 'error'>('idle');
	#unsub: Unsubscribe | null = null;
	#refs = 0;

	subscribe() {
		this.#refs++;
		if (!this.#unsub) this.#listen();
		return () => {
			if (--this.#refs <= 0) {
				this.#unsub?.();
				this.#unsub = null;
			}
		};
	}

	retry() {
		this.#unsub?.();
		this.#listen();
	}

	#listen() {
		this.status = 'loading';
		this.#unsub = onSnapshot(
			doc(db(), 'config', 'site'),
			(snap) => {
				this.value = mergeSiteConfig(snap.data());
				this.status = 'ready';
			},
			(err) => {
				console.error('[site-config]', err);
				this.status = 'error';
				this.#unsub = null;
			}
		);
	}

	saveGeneral(data: Omit<SiteConfig, 'events'>) {
		return setDoc(doc(db(), 'config', 'site'), { ...data, updatedAt: Date.now() }, { merge: true });
	}

	saveEvent(id: EventId, data: EventConfig) {
		return setDoc(
			doc(db(), 'config', 'site'),
			{ events: { [id]: data }, updatedAt: Date.now() },
			{ merge: true }
		);
	}
}

export const siteConfig = new SiteConfigStore();
