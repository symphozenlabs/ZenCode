import { collection, deleteDoc, doc, onSnapshot, updateDoc, writeBatch, type DocumentData, type Unsubscribe } from 'firebase/firestore';
import { db } from '$lib/firebase/client';
import { adminAuth } from './admin-auth.svelte';
import { EVENT_IDS, type EventId } from '$lib/config/site';
import {
	COLLECTION_BY_EVENT,
	COLLECTIONS,
	EVENT_NAME,
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
	const status: RegistrationStatus = d.status === 'rejected' ? 'rejected' : 'approved';
	return {
		id,
		event,
		teamName: str(d.teamName),
		teamSize: typeof d.teamSize === 'number' ? d.teamSize : members.length,
		teamLeader: {
			name: str(d.teamLeader?.name),
			admissionNumber: str(d.teamLeader?.admissionNumber),
			// main's form stores the year of study in both fields; older entries may only have one.
			classSection: str(d.teamLeader?.classSection || d.teamLeader?.yearOfStudy),
			email: str(d.teamLeader?.email),
			mobileNumber: str(d.teamLeader?.mobileNumber)
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
	/** Leader mobile numbers from the admin-only contacts collection, by registration ID */
	#mobiles = $state<Record<string, string>>({});
	#unsubs: Unsubscribe[] = [];
	#refs = 0;

	items = $derived(
		[...this.#byEvent.hackathon, ...this.#byEvent['pitch-fest']]
			.map((r) => (this.#mobiles[r.id] ? { ...r, teamLeader: { ...r.teamLeader, mobileNumber: this.#mobiles[r.id] } } : r))
			.sort((a, b) => b.createdAt - a.createdAt)
	);
	status = $derived<'loading' | 'ready' | 'error'>(
		this.#error ? 'error' : EVENT_IDS.every((id) => this.#ready[id]) ? 'ready' : 'loading'
	);

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
		this.#unsubs.push(
			onSnapshot(
				collection(db(), COLLECTIONS.CONTACTS),
				(snap) => {
					this.#mobiles = Object.fromEntries(snap.docs.map((d) => [d.id, str(d.data().mobileNumber)]));
				},
				// Registrations still work without contacts (e.g. rules not deployed yet).
				(err) => console.error('[registrations:contacts]', err)
			)
		);
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

	update(r: Registration, data: { teamName: string; teamLeader: TeamLeader; members: TeamMember[] }) {
		const members = data.members.map((m, i) => ({ ...m, memberNumber: i + 1 }));
		// The mobile number is private, so it's kept out of the public registration doc.
		const { mobileNumber, ...teamLeader } = data.teamLeader;
		const batch = writeBatch(db());
		batch.update(this.#ref(r), {
			teamName: data.teamName,
			teamLeader,
			members,
			teamSize: members.length,
			...searchFields(members)
		});
		if (mobileNumber !== r.teamLeader.mobileNumber) {
			batch.set(this.#contactRef(r), { event: EVENT_NAME[r.event], mobileNumber }, { merge: true });
		}
		return batch.commit();
	}

	async remove(r: Registration) {
		await deleteDoc(this.#ref(r));
		await deleteDoc(this.#contactRef(r)).catch(() => {});
	}

	#contactRef(r: Pick<Registration, 'id'>) {
		return doc(db(), COLLECTIONS.CONTACTS, r.id);
	}
}

export const registrations = new RegistrationsStore();
