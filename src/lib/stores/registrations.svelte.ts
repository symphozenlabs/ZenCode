import { collection, deleteDoc, doc, onSnapshot, updateDoc, type DocumentData, type Unsubscribe } from 'firebase/firestore';
import { db } from '$lib/firebase/client';
import { adminAuth } from './admin-auth.svelte';
import { EVENT_IDS, type EventId } from '$lib/config/site';
import {
	COLLECTION_BY_EVENT,
	REGISTRATION_STATUSES,
	searchFields,
	type Registration,
	type RegistrationStatus,
	type TeamLeader,
	type TeamMember
} from '$lib/registrations/model';

function toMillis(v: unknown): number {
	if (typeof v === 'number') return v;
	if (v && typeof v === 'object' && 'toMillis' in v && typeof v.toMillis === 'function') return v.toMillis();
	return 0;
}

const str = (v: unknown) => (typeof v === 'string' ? v : '');

/** Normalise a stored document (tolerates older/partial docs). */
function fromDoc(id: string, event: EventId, d: DocumentData): Registration {
	const members: TeamMember[] = Array.isArray(d.members)
		? d.members.map((m: DocumentData, i: number) => ({
				memberNumber: typeof m?.memberNumber === 'number' ? m.memberNumber : i + 1,
				name: str(m?.name),
				admissionNumber: str(m?.admissionNumber),
				email: str(m?.email)
			}))
		: [];
	const status = (REGISTRATION_STATUSES as readonly string[]).includes(d.status) ? (d.status as RegistrationStatus) : 'pending';
	return {
		id,
		event,
		teamSize: typeof d.teamSize === 'number' ? d.teamSize : members.length,
		teamLeader: {
			name: str(d.teamLeader?.name),
			admissionNumber: str(d.teamLeader?.admissionNumber),
			classSection: str(d.teamLeader?.classSection),
			email: str(d.teamLeader?.email)
		},
		members,
		status,
		createdAt: toMillis(d.registeredAt),
		reviewedBy: typeof d.reviewedBy === 'string' ? d.reviewedBy : null
	};
}

/**
 * Live view of both registration collections, shared by every admin page
 * and reference-counted so the listeners close when no page needs them.
 */
class RegistrationsStore {
	#byEvent = $state<Record<EventId, Registration[]>>({ hackathon: [], 'pitch-fest': [] });
	#ready = $state<Record<EventId, boolean>>({ hackathon: false, 'pitch-fest': false });
	#error = $state(false);
	#unsubs: Unsubscribe[] = [];
	#refs = 0;

	items = $derived(
		[...this.#byEvent.hackathon, ...this.#byEvent['pitch-fest']].sort((a, b) => b.createdAt - a.createdAt)
	);
	status = $derived<'loading' | 'ready' | 'error'>(
		this.#error ? 'error' : EVENT_IDS.every((id) => this.#ready[id]) ? 'ready' : 'loading'
	);
	pending = $derived(this.items.filter((r) => r.status === 'pending').length);

	subscribe() {
		this.#refs++;
		if (!this.#unsubs.length) this.#listen();
		return () => {
			if (--this.#refs <= 0) this.#stop();
		};
	}

	retry() {
		this.#stop();
		this.#listen();
	}

	#listen() {
		this.#error = false;
		for (const id of EVENT_IDS) {
			this.#ready[id] = false;
			this.#unsubs.push(
				onSnapshot(
					collection(db(), COLLECTION_BY_EVENT[id]),
					(snap) => {
						this.#byEvent[id] = snap.docs.map((d) => fromDoc(d.id, id, d.data()));
						this.#ready[id] = true;
					},
					(err) => {
						console.error(`[registrations:${id}]`, err);
						this.#error = true;
					}
				)
			);
		}
	}

	#stop() {
		this.#unsubs.forEach((u) => u());
		this.#unsubs = [];
		this.#refs = Math.max(0, this.#refs);
	}

	#ref(r: Pick<Registration, 'id' | 'event'>) {
		return doc(db(), COLLECTION_BY_EVENT[r.event], r.id);
	}

	setStatus(r: Registration, status: RegistrationStatus) {
		return updateDoc(this.#ref(r), {
			status,
			reviewedBy: adminAuth.user?.email ?? null,
			reviewedAt: Date.now()
		});
	}

	update(r: Registration, data: { teamLeader: TeamLeader; members: TeamMember[] }) {
		const members = data.members.map((m, i) => ({ ...m, memberNumber: i + 1 }));
		return updateDoc(this.#ref(r), {
			teamLeader: data.teamLeader,
			members,
			teamSize: members.length,
			...searchFields(members)
		});
	}

	remove(r: Registration) {
		return deleteDoc(this.#ref(r));
	}
}

export const registrations = new RegistrationsStore();
