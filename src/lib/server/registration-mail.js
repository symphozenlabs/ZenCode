import { doc, getDoc, updateDoc } from 'firebase/firestore';
import { adminDb } from './admin-session';
import { sendTeamConfirmationEmails } from './email.js';

const DEFAULT_PUBLIC_BASE_URL = 'https://zencode.symphozen.com';

function normalizeBaseUrl(rawUrl) {
  const trimmed = (rawUrl || '').trim();
  if (!trimmed) return DEFAULT_PUBLIC_BASE_URL;

  const withProtocol = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
  return withProtocol.replace(/\/+$/, '');
}

export function getPublicBaseUrl() {
  return normalizeBaseUrl(
    process.env.PUBLIC_SITE_URL ||
    process.env.SITE_URL ||
    process.env.VITE_PUBLIC_SITE_URL ||
    DEFAULT_PUBLIC_BASE_URL
  );
}

/** Every address a team's passes go to: the leader plus members, deduplicated. */
export function teamRecipients(data) {
  const emails = new Set();
  const add = value => {
    const email = typeof value === 'string' ? value.trim().toLowerCase() : '';
    if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) emails.add(email);
  };
  add(data?.teamLeader?.email);
  if (Array.isArray(data?.members)) data.members.forEach(m => add(m?.email));
  return [...emails];
}

/**
 * Save the outcome of a send on the registration (as the organiser), merged
 * with earlier attempts, so the admin Track page can show who got their pass.
 * Recording never fails the send itself.
 */
export async function recordEmailResults(collectionName, teamId, results) {
  if (!results?.length) return;
  try {
    const db = await adminDb();
    const ref = doc(db, collectionName, teamId);
    const snap = await getDoc(ref);
    if (!snap.exists()) return;
    const data = snap.data();

    const byEmail = new Map(
      (Array.isArray(data.emailDelivery) ? data.emailDelivery : []).map(entry => [entry.email, entry])
    );
    const now = Date.now();
    for (const r of results) {
      const previous = byEmail.get(r.memberEmail);
      byEmail.set(r.memberEmail, {
        email: r.memberEmail,
        status: r.status,
        resendId: r.id || null,
        error: r.error ? String(r.error).slice(0, 300) : null,
        sendCount: (previous?.sendCount || 0) + 1,
        lastAttemptAt: now,
        ...(r.status === 'sent' ? { sentAt: now } : previous?.sentAt ? { sentAt: previous.sentAt } : {})
      });
    }

    const recipients = teamRecipients(data);
    const sentCount = recipients.filter(email => byEmail.get(email)?.status === 'sent').length;
    const overall = sentCount === recipients.length ? 'sent' : sentCount > 0 ? 'partial' : 'failed';

    await updateDoc(ref, {
      emailDelivery: [...byEmail.values()],
      confirmationEmailStatus: overall,
      emailUpdatedAt: now
    });
  } catch (err) {
    console.error(`❌ [EMAIL TRACKING] Could not record email results for ${teamId}:`, err?.body?.message || err);
  }
}

/**
 * Send (or resend) a team's passes from the stored registration and record the outcome.
 *
 * @param {string} collectionName
 * @param {string} eventName
 * @param {string} teamId
 * @param {Record<string, any>} data - The stored registration
 * @param {string[] | null} [onlyEmails] - Limit to these addresses
 */
export async function sendAndRecord(collectionName, eventName, teamId, data, onlyEmails = null) {
  const outcome = await sendTeamConfirmationEmails({
    teamId,
    event: eventName,
    teamName: typeof data.teamName === 'string' ? data.teamName.trim() : '',
    teamLeader: data.teamLeader,
    members: Array.isArray(data.members) ? data.members : [],
    // Use the canonical public URL so emailed passes never point at localhost or preview hosts.
    baseUrl: getPublicBaseUrl(),
    onlyEmails
  });
  await recordEmailResults(collectionName, teamId, outcome.results);
  return outcome;
}
