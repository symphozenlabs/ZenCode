import { db, COLLECTIONS } from '../firebase.js';
import { doc, getDoc, updateDoc } from 'firebase/firestore';
import { sendTeamConfirmationEmails } from './email.js';

/**
 * Handles server-side API request for sending confirmation passes.
 *
 * @param {Object} req Node HTTP request
 * @param {Object} res Node HTTP response
 */
export async function handleSendConfirmationApi(req, res) {
  if (req.method !== 'POST') {
    res.statusCode = 455;
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
      const { collectionName, teamId, forceSend, isDevTest, devOverrideRecipient } = payload;

      if (!collectionName || !teamId) {
        res.statusCode = 400;
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({ error: 'collectionName and teamId are required' }));
        return;
      }

      // Fetch registration document from Firestore
      const docRef = doc(db, collectionName, teamId);
      const docSnap = await getDoc(docRef);

      if (!docSnap.exists()) {
        res.statusCode = 404;
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({ error: 'Registration document not found' }));
        return;
      }

      const data = docSnap.data();

      // Idempotency check: if already sent and not forceSend (explicit dev test), do not send duplicate emails
      if (data.confirmationEmailStatus === 'sent' && !forceSend) {
        console.log(`ℹ️ [Idempotency] Confirmation emails already sent for teamId: ${teamId}. Skipping repeat email dispatch.`);
        res.statusCode = 200;
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({
          status: 'already_sent',
          message: 'Confirmation emails have already been sent for this team.',
          teamId
        }));
        return;
      }

      // Determine base host URL for QR code
      const host = req.headers.host || 'localhost:5173';
      const protocol = req.headers['x-forwarded-proto'] || 'http';
      const baseUrl = `${protocol}://${host}`;

      // Dispatch team emails to actual registered participant emails (member.email)
      const emailOutcome = await sendTeamConfirmationEmails({
        teamId: teamId,
        event: data.event || (collectionName === COLLECTIONS.HACKATHON ? 'Hackathon' : 'Pitch Fest'),
        teamLeader: data.teamLeader,
        members: data.members || [],
        baseUrl: baseUrl,
        isDevTest: Boolean(isDevTest),
        devOverrideRecipient: devOverrideRecipient || null
      });

      // Update Firestore registration document with metadata
      const newStatus = emailOutcome.allSuccess ? 'sent' : (emailOutcome.success ? 'partial' : 'failed');

      await updateDoc(docRef, {
        teamId: teamId,
        qrGenerated: true,
        qrVersion: 1,
        confirmationEmailStatus: newStatus,
        emailSentAt: new Date().toISOString(),
        emailResults: emailOutcome.results || []
      });

      res.statusCode = 200;
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({
        success: emailOutcome.success,
        allSuccess: emailOutcome.allSuccess,
        teamId: teamId,
        confirmationEmailStatus: newStatus,
        results: emailOutcome.results
      }));
    } catch (err) {
      console.error('Error handling send-confirmation API:', err);
      res.statusCode = 500;
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({
        error: 'Failed to process confirmation email',
        details: err.message
      }));
    }
  });
}
