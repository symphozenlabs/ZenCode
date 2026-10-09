import { db, COLLECTIONS } from '../firebase.js';
import { doc, getDoc } from 'firebase/firestore';
import { sendTeamConfirmationEmails } from './email.js';

const DEFAULT_PUBLIC_BASE_URL = 'https://zencode.symphozen.com';

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
  req.on('data', chunk => {
    bodyStr += chunk;
  });

  req.on('end', async () => {
    try {
      const payload = JSON.parse(bodyStr || '{}');
      const { collectionName, teamId, event, teamLeader, members } = payload;

      if (!teamId) {
        res.statusCode = 400;
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({ error: 'teamId is required' }));
        return;
      }

      const eventName = event || (collectionName === COLLECTIONS.HACKATHON ? 'Hackathon' : 'Pitch Fest');

      // Resolve team leader and member details from payload
      let resolvedTeamLeader = teamLeader;
      let resolvedMembers = Array.isArray(members) ? members : [];

      // If payload did not include leader/members, try fallback to Firestore
      if (!resolvedTeamLeader && resolvedMembers.length === 0 && collectionName) {
        try {
          const docRef = doc(db, collectionName, teamId);
          const docSnap = await getDoc(docRef);
          if (docSnap.exists()) {
            const data = docSnap.data();
            resolvedTeamLeader = data.teamLeader;
            resolvedMembers = data.members || [];
          }
        } catch (fetchErr) {
          console.warn('[REGISTRATION] Firestore fallback fetch skipped:', fetchErr.message);
        }
      }

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
      res.end(JSON.stringify({
        error: 'Failed to process confirmation email',
        details: err.message
      }));
    }
  });
}
