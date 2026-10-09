import { db, COLLECTIONS } from '../firebase.js';
import { doc, getDoc } from 'firebase/firestore';
import { sendTeamConfirmationEmails } from './email.js';

const DEFAULT_PUBLIC_BASE_URL = 'https://zencode.symphozen.com';

const EVENT_BY_COLLECTION = {
  [COLLECTIONS.HACKATHON]: 'Hackathon',
  [COLLECTIONS.PITCH_FEST]: 'Pitch Fest'
};

/** Auto-generated Firestore document IDs. */
const FIRESTORE_ID = /^[A-Za-z0-9]{20}$/;

/** Passes can only be sent this soon after the team registered. */
const SEND_WINDOW_MS = 15 * 60 * 1000;

const MAX_BODY_BYTES = 16 * 1024;

function sendJson(res, status, body) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json');
  res.end(JSON.stringify(body));
}

function normalizeBaseUrl(rawUrl) {
  const trimmed = (rawUrl || '').trim();
  if (!trimmed) return DEFAULT_PUBLIC_BASE_URL;

  const withProtocol = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
  return withProtocol.replace(/\/+$/, '');
}

function getPublicBaseUrl() {
  return normalizeBaseUrl(
    process.env.PUBLIC_SITE_URL ||
    process.env.SITE_URL ||
    process.env.VITE_PUBLIC_SITE_URL ||
    DEFAULT_PUBLIC_BASE_URL
  );
}

/**
 * Handles server-side API request for sending confirmation passes.
 *
 * @param {Object} req Node HTTP request
 * @param {Object} res Node HTTP response
 */
export async function handleSendConfirmationApi(req, res) {
  if (req.method !== 'POST') {
    res.statusCode = 405;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ error: 'Method not allowed' }));
    return;
  }

  let bodyStr = '';
  let tooLarge = false;
  req.on('data', chunk => {
    bodyStr += chunk;
    if (bodyStr.length > MAX_BODY_BYTES) tooLarge = true;
  });

  req.on('end', async () => {
    if (tooLarge) return sendJson(res, 413, { error: 'Request too large' });
    try {
      const payload = JSON.parse(bodyStr || '{}');
      const { collectionName, teamId } = payload;

      // Only the IDs are taken from the request. Names, emails and the team
      // name always come from the stored registration, so this endpoint can't
      // be used to send our passes to arbitrary addresses.
      const eventName = EVENT_BY_COLLECTION[collectionName];
      if (!eventName || typeof teamId !== 'string' || !FIRESTORE_ID.test(teamId)) {
        return sendJson(res, 400, { error: 'A valid collectionName and teamId are required' });
      }

      const docSnap = await getDoc(doc(db, collectionName, teamId));
      if (!docSnap.exists()) {
        return sendJson(res, 404, { error: 'Registration not found' });
      }

      const data = docSnap.data();
      const registeredAt = typeof data.registeredAt?.toMillis === 'function' ? data.registeredAt.toMillis() : 0;
      if (!registeredAt || Date.now() - registeredAt > SEND_WINDOW_MS) {
        // Passes go out right after registering; older teams can't be re-mailed from here.
        return sendJson(res, 409, { error: 'Confirmation window for this registration has closed' });
      }

      const resolvedTeamLeader = data.teamLeader;
      const resolvedMembers = Array.isArray(data.members) ? data.members : [];
      const resolvedTeamName = typeof data.teamName === 'string' ? data.teamName.trim() : '';

      // Count valid members
      const validMembersCount = (resolvedMembers.length > 0)
        ? resolvedMembers.length
        : (resolvedTeamLeader ? 1 : 0);

      // Server-side registration logging as required
      console.log(`[REGISTRATION] Registration received`);
      console.log(`[REGISTRATION] Event: ${eventName}`);
      console.log(`[REGISTRATION] Team ID: ${teamId}`);
      console.log(`[REGISTRATION] Members: ${validMembersCount}`);
      console.log(`[REGISTRATION] Database save successful`);
      console.log(`[REGISTRATION] Generating team QR`);

      // Use the canonical public URL so emailed passes never point at localhost or preview hosts.
      const baseUrl = getPublicBaseUrl();

      // Dispatch team confirmation emails to each valid member
      const emailOutcome = await sendTeamConfirmationEmails({
        teamId: teamId,
        event: eventName,
        teamName: resolvedTeamName,
        teamLeader: resolvedTeamLeader,
        members: resolvedMembers,
        baseUrl: baseUrl
      });

      res.statusCode = emailOutcome.success ? 200 : 500;
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({
        success: emailOutcome.success,
        allSuccess: emailOutcome.allSuccess,
        teamId: teamId,
        results: emailOutcome.results
      }));
    } catch (err) {
      console.error('❌ [REGISTRATION ERROR] Error handling send-confirmation API:', err);
      res.statusCode = 500;
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ error: 'Failed to process confirmation email' }));
    }
  });
}
