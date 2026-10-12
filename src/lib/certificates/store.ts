import {
	collection,
	deleteDoc,
	doc,
	getCountFromServer,
	getDoc,
	getDocs,
	orderBy,
	query,
	serverTimestamp,
	setDoc,
	updateDoc,
	where,
	writeBatch,
	type DocumentData
} from 'firebase/firestore';
import { env } from '$env/dynamic/public';
import { db } from '$lib/firebase/client';
import { idToken } from '$lib/live/admin-api';
import { adminAuth } from '$lib/stores/admin-auth.svelte';
import type { EventId } from '$lib/config/site';
import {
	CODE_PATTERN,
	STARTERS,
	certificateCode,
	localDate,
	normaliseDesign,
	parseDesign,
	uploadedDesign,
	valuesFor
} from './design.js';
import { certificatePdf } from './render.js';

/**
 * Certificates in Firestore. The admin works on them straight from the
 * browser, like registrations; firestore.rules lets only organisers write.
 *
 * - certificateTemplates/{id}  designs organisers draw and edit
 * - certificateDesigns/{hash}  a design frozen as it was when issued, shared
 *                              by every certificate issued from it
 * - certificateIssues/{code}   one certificate for one team member. Anyone
 *                              may fetch one by its code (the verify page),
 *                              but only organisers may list them.
 */
const TEMPLATES = 'certificateTemplates';
const DESIGNS = 'certificateDesigns';
const ISSUES = 'certificateIssues';

// The design format lives in plain JS (design.js); its shape is checked by normaliseDesign.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type Design = any;

export interface CertificateTemplate {
	id: string;
	name: string;
	design: Design;
	updatedAt: number;
	updatedBy: string;
	/** Certificates issued from it (list view only) */
	issued?: number;
}

export interface IssuedCertificate {
	code: string;
	templateId: string;
	templateName: string;
	event: EventId;
	registrationId: string;
	memberNumber: number;
	name: string;
	admissionNumber: string;
	teamName: string;
	award: string;
	values: Record<string, string>;
	designId: string;
	revoked: boolean;
	issuedAt: number;
	issuedBy: string;
	/** Address it was last emailed to, and when (0 = never) */
	emailedTo: string;
	emailedAt: number;
	/** Why the last email failed, if it did */
	emailError: string;
}

/** One person a certificate can go to: a member of a registered team. */
export interface Recipient {
	registrationId: string;
	memberNumber: number;
	name: string;
	admissionNumber: string;
	teamName: string;
}

/** The event facts printed on a certificate. */
export interface EventFacts {
	title: string;
	startDate: string;
	endDate: string;
	venue: string;
}

export const recipientKey = (r: Pick<Recipient, 'registrationId' | 'memberNumber'>) =>
	`${r.registrationId}:${r.memberNumber}`;

const millis = (v: unknown) =>
	v && typeof v === 'object' && 'toMillis' in v && typeof v.toMillis === 'function' ? (v.toMillis() as number) : 0;
const str = (v: unknown) => (typeof v === 'string' ? v : '');
const who = () => adminAuth.user?.email ?? 'organiser';

const cleanName = (value: unknown, fallback = 'Untitled certificate') =>
	String(value ?? '')
		.replace(/\s+/g, ' ')
		.trim()
		.slice(0, 120) || fallback;

function toTemplate(id: string, d: DocumentData): CertificateTemplate {
	return {
		id,
		name: str(d.name) || 'Untitled certificate',
		design: parseDesign(d.design),
		updatedAt: millis(d.updatedAt),
		updatedBy: str(d.updatedBy)
	};
}

function toIssue(code: string, d: DocumentData): IssuedCertificate {
	return {
		code,
		templateId: str(d.templateId),
		templateName: str(d.templateName),
		event: d.event === 'pitch-fest' ? 'pitch-fest' : 'hackathon',
		registrationId: str(d.registrationId),
		memberNumber: typeof d.memberNumber === 'number' ? d.memberNumber : 1,
		name: str(d.name),
		admissionNumber: str(d.admissionNumber),
		teamName: str(d.teamName),
		award: str(d.award),
		values: d.values && typeof d.values === 'object' ? d.values : {},
		designId: str(d.designId),
		revoked: d.revoked === true,
		issuedAt: millis(d.issuedAt),
		issuedBy: str(d.issuedBy),
		emailedTo: str(d.emailedTo),
		emailedAt: millis(d.emailedAt),
		emailError: str(d.emailError)
	};
}

// ── Templates ───────────────────────────────────────────────────────────────

/** Every template, newest edit first, with how many certificates each has issued. */
export async function listTemplates(): Promise<CertificateTemplate[]> {
	const snap = await getDocs(query(collection(db(), TEMPLATES), orderBy('updatedAt', 'desc')));
	const templates = snap.docs.map((d) => toTemplate(d.id, d.data()));
	await Promise.all(
		templates.map(async (t) => {
			const count = await getCountFromServer(query(collection(db(), ISSUES), where('templateId', '==', t.id)));
			t.issued = count.data().count;
		})
	);
	return templates;
}

export async function getTemplate(id: string): Promise<CertificateTemplate | null> {
	const snap = await getDoc(doc(db(), TEMPLATES, id));
	return snap.exists() ? toTemplate(snap.id, snap.data()) : null;
}

/**
 * A new template from a starter design, a copy of another template, or an
 * uploaded certificate (`upload: { src, width, height }`, the image as a data
 * URL) with the name and verification QR laid on top.
 */
export async function createTemplate({
	name,
	starter = 'classic',
	copyOf = null,
	upload = null
}: {
	name?: string;
	starter?: string;
	copyOf?: string | null;
	upload?: { src: string; width: number; height: number } | null;
}): Promise<CertificateTemplate> {
	let design: Design;
	let baseName: string;
	if (upload) {
		const result = normaliseDesign(uploadedDesign(upload));
		if (!result.ok) throw new Error(result.errors.join(' '));
		design = result.design as Design;
		if (!design.page.backgroundImage) throw new Error('Upload the certificate as a PNG, JPEG or WebP image.');
		baseName = 'Uploaded certificate';
	} else if (copyOf) {
		const source = await getTemplate(copyOf);
		if (!source) throw new Error('That certificate no longer exists.');
		design = source.design;
		baseName = `${source.name} (copy)`;
	} else {
		const start = STARTERS.find((s) => s.id === starter) ?? STARTERS[0];
		design = start.build();
		baseName = start.id === 'blank' ? 'Untitled certificate' : `${start.name} certificate`;
	}

	const ref = doc(collection(db(), TEMPLATES));
	const row = {
		name: cleanName(name, baseName),
		design: JSON.stringify(design),
		createdBy: who(),
		createdAt: serverTimestamp(),
		updatedBy: who(),
		updatedAt: serverTimestamp()
	};
	await setDoc(ref, row);
	return { id: ref.id, name: row.name, design, updatedAt: Date.now(), updatedBy: row.updatedBy };
}

/** Saves a template's name and/or design. The design is validated first. */
export async function saveTemplate(id: string, input: { name?: string; design?: Design }) {
	const changes: Record<string, unknown> = { updatedBy: who(), updatedAt: serverTimestamp() };
	if (input.name !== undefined) changes.name = cleanName(input.name);
	if (input.design !== undefined) {
		const result = normaliseDesign(input.design);
		if (!result.ok) throw new Error(result.errors.join(' '));
		changes.design = JSON.stringify(result.design);
	}
	await updateDoc(doc(db(), TEMPLATES, id), changes);
}

/**
 * Deletes a template. Certificates already issued from it keep their frozen
 * copy of the design, so they still print and verify.
 */
export function deleteTemplate(id: string) {
	return deleteDoc(doc(db(), TEMPLATES, id));
}

// ── Issuing ─────────────────────────────────────────────────────────────────

/** Certificates already issued from a template at an event, by recipient key. */
export async function issuedFor(templateId: string, event: EventId): Promise<Map<string, IssuedCertificate>> {
	const snap = await getDocs(
		query(collection(db(), ISSUES), where('templateId', '==', templateId), where('event', '==', event))
	);
	return new Map(snap.docs.map((d) => {
		const issue = toIssue(d.id, d.data());
		return [recipientKey(issue), issue];
	}));
}

async function sha256(text: string) {
	const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
	return [...new Uint8Array(bytes)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/** Freezes a design for issuing. The same design is stored once, under its hash. */
async function freezeDesign(templateId: string, design: Design) {
	const json = JSON.stringify(design);
	const id = (await sha256(json)).slice(0, 40);
	const ref = doc(db(), DESIGNS, id);
	if (!(await getDoc(ref)).exists()) {
		await setDoc(ref, { design: json, templateId, createdAt: serverTimestamp() });
	}
	return id;
}

const randomBytes = (n: number) => crypto.getRandomValues(new Uint8Array(n));

/**
 * Issues a template to the chosen team members of an event.
 *
 * Someone who already holds one from this template keeps their code; their
 * copy is refreshed with the current design, details and award, and restored
 * if it had been revoked. Returns the codes, for the print sheet.
 */
export async function issueCertificates({
	template,
	event,
	facts,
	recipients,
	award = '',
	existing
}: {
	template: CertificateTemplate;
	event: EventId;
	facts: EventFacts;
	recipients: Recipient[];
	award?: string;
	existing: Map<string, IssuedCertificate>;
}): Promise<string[]> {
	if (!recipients.length) throw new Error('Choose at least one person.');
	const designId = await freezeDesign(template.id, template.design);
	const issuedOn = localDate();
	const cleanAward = award.replace(/\s+/g, ' ').trim().slice(0, 80);

	const codes: string[] = [];
	const used = new Set<string>();
	// Firestore takes at most 500 writes per batch.
	for (let i = 0; i < recipients.length; i += 400) {
		const batch = writeBatch(db());
		for (const r of recipients.slice(i, i + 400)) {
			const held = existing.get(recipientKey(r));
			let code = held?.code;
			while (!code || (!held && used.has(code))) code = certificateCode(randomBytes);
			used.add(code);
			codes.push(code);
			batch.set(
				doc(db(), ISSUES, code),
				{
					code,
					templateId: template.id,
					templateName: template.name,
					event,
					registrationId: r.registrationId,
					memberNumber: r.memberNumber,
					name: r.name,
					admissionNumber: r.admissionNumber,
					teamName: r.teamName,
					award: cleanAward,
					values: valuesFor({ event: facts, recipient: r, award: cleanAward, code, issuedOn }),
					designId,
					revoked: false,
					issuedBy: who(),
					...(held ? { reissuedAt: serverTimestamp() } : { issuedAt: serverTimestamp() })
				},
				{ merge: true }
			);
		}
		await batch.commit();
	}
	return codes;
}

export function setRevoked(code: string, revoked: boolean) {
	return updateDoc(doc(db(), ISSUES, code), { revoked, revokedAt: revoked ? serverTimestamp() : null });
}

/** A certificate with the design it was issued with, ready to draw. */
export type PrintableCertificate = IssuedCertificate & { design: Design };

async function withDesigns(issues: IssuedCertificate[]): Promise<PrintableCertificate[]> {
	const ids = [...new Set(issues.map((i) => i.designId).filter(Boolean))];
	const designs = new Map(
		await Promise.all(
			ids.map(async (id) => {
				const snap = await getDoc(doc(db(), DESIGNS, id));
				return [id, parseDesign(snap.data()?.design)] as const;
			})
		)
	);
	return issues.map((i) => ({ ...i, design: designs.get(i.designId) ?? parseDesign(null) }));
}

/** Issued certificates by code, ready to print, in name order. */
export async function getIssues(codes: string[]): Promise<PrintableCertificate[]> {
	const snaps = await Promise.all(codes.slice(0, 1000).map((code) => getDoc(doc(db(), ISSUES, code))));
	const issues = snaps.filter((s) => s.exists()).map((s) => toIssue(s.id, s.data()!));
	issues.sort((a, b) => a.teamName.localeCompare(b.teamName) || a.memberNumber - b.memberNumber);
	return withDesigns(issues);
}

/** What /verify shows for a code. Public: needs no sign-in. */
export async function verifyCode(code: string): Promise<PrintableCertificate | null> {
	const clean = String(code ?? '').trim().toUpperCase();
	if (!CODE_PATTERN.test(clean)) return null;
	const snap = await getDoc(doc(db(), ISSUES, clean));
	if (!snap.exists()) return null;
	const [issue] = await withDesigns([toIssue(snap.id, snap.data())]);
	return issue;
}

// ── Verifying and emailing ──────────────────────────────────────────────────

/**
 * Where a certificate's QR code and email link point. Set VITE_PUBLIC_SITE_URL
 * to the live site so certificates issued from a local copy still verify there.
 */
export function verifyBase() {
	const configured = (env.VITE_PUBLIC_SITE_URL ?? '').trim().replace(/\/+$/, '');
	return configured || location.origin;
}

export const verifyUrl = (code: string) => `${verifyBase()}/verify/${code}`;

/**
 * Draws an issued certificate as a PDF here in the browser and has the server
 * email it to the participant's registered address. Returns that address.
 */
export async function emailCertificate(issue: PrintableCertificate): Promise<string> {
	const pdf = await certificatePdf(issue.design, issue.values, verifyUrl(issue.code));
	const res = await fetch(`/api/certificates/${issue.code}/email?base=${encodeURIComponent(verifyBase())}`, {
		method: 'POST',
		headers: { authorization: `Bearer ${await idToken()}`, 'content-type': 'application/pdf' },
		body: new Blob([pdf as BlobPart], { type: 'application/pdf' })
	}).catch(() => null);
	if (!res) throw new Error('Network problem — check your connection.');
	const data = await res.json().catch(() => null);
	if (!res.ok) throw new Error(data?.message ?? `Could not email ${issue.name}.`);
	return data.to as string;
}
