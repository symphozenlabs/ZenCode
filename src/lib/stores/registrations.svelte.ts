import { collection, doc, onSnapshot, orderBy, query, updateDoc, writeBatch, type Unsubscribe } from 'firebase/firestore';
import { db } from '$lib/firebase/client';
import { adminAuth } from './admin-auth.svelte';
import { registrationKeyId, type Registration, type RegistrationStatus } from '$lib/validation/registration';

/**
 * One live Firestore subscription to `registrations`, shared by every admin
 * page and reference-counted so it closes when no page needs it.
 */
class RegistrationsStore {
	items = $state<Registration[]>([]);
	status = $state<'idle' | 'loading' | 'ready' | 'error'>('idle');
	#unsub: Unsubscribe | null = null;
	#refs = 0;

	pending = $derived(this.items.filter((r) => r.status === 'pending').length);

	subscribe() {
		this.#refs++;
		if (!this.#unsub) this.#listen();
		return () => {
			this.#refs--;
			if (this.#refs <= 0) this.#stop();
		};
	}

	retry() {
		this.#stop();
		this.#listen();
	}

	#listen() {
		this.status = 'loading';
		this.#unsub = onSnapshot(
			query(collection(db(), 'registrations'), orderBy('createdAt', 'desc')),
			(snap) => {
				this.items = snap.docs.map((d) => ({ ...(d.data() as Registration), registrationId: d.id }));
				this.status = 'ready';
			},
			(err) => {
				console.error('[registrations]', err);
				this.status = 'error';
				this.#unsub = null;
			}
		);
	}

	#stop() {
		this.#unsub?.();
		this.#unsub = null;
		this.#refs = Math.max(0, this.#refs);
	}

	setStatus(id: string, status: RegistrationStatus) {
		return updateDoc(doc(db(), 'registrations', id), {
			status,
			updatedAt: Date.now(),
			reviewedBy: adminAuth.user?.email ?? null
		});
	}

	update(id: string, data: Pick<Registration, 'personal' | 'academic' | 'team'>) {
		return updateDoc(doc(db(), 'registrations', id), {
			personal: data.personal,
			academic: data.academic,
			team: data.team,
			emailLower: data.personal.email.trim().toLowerCase(),
			updatedAt: Date.now()
		});
	}

	/** Delete the registration and its uniqueness key so the email can register again. */
	remove(r: Registration) {
		const batch = writeBatch(db());
		batch.delete(doc(db(), 'registrations', r.registrationId));
		batch.delete(doc(db(), 'registrationKeys', registrationKeyId(r.event, r.emailLower)));
		return batch.commit();
	}
}

export const registrations = new RegistrationsStore();
