import { Resend } from 'resend';
import { generateTeamQRCode } from './qr.js';
import { buildRegistrationPassEmailHtml } from './emailTemplate.js';

/**
 * Gets server environment variable safely
 * @param {string} key
 * @returns {string}
 */
function getServerEnv(key) {
  const proc = typeof process !== 'undefined' && process.env ? process.env[key] : '';
  const meta = typeof import.meta !== 'undefined' && import.meta.env ? import.meta.env[key] : '';
  return proc || meta || '';
}

/**
 * Validates and sanitizes the sender address for Resend.
 * Resend free tier prohibits unverified @gmail.com sender addresses.
 *
 * @param {string} rawSender
 * @returns {{ sender: string, warning?: string }}
 */
function getSanitizedSender(rawSender) {
  const defaultSender = 'ZEN CODE 2026 <onboarding@resend.dev>';
  if (!rawSender) {
    return { sender: defaultSender };
  }

  // Check if sender uses @gmail.com directly without custom verified domain
  if (rawSender.toLowerCase().includes('@gmail.com')) {
    return {
      sender: defaultSender,
      warning: `Configured RESEND_FROM_EMAIL ("${rawSender}") uses @gmail.com. Resend requires a verified custom domain to send from @gmail.com. Defaulted to "${defaultSender}".`
    };
  }

  return { sender: rawSender };
}

/**
 * Sends personalized registration passes with the shared Team QR code to all members.
 *
 * @param {Object} params
 * @param {string} params.teamId - Document ID / Unique Team Registration ID
 * @param {string} params.event - "Hackathon" or "Pitch Fest"
 * @param {Object} params.teamLeader - Leader details { name, admissionNumber, yearOfStudy, email }
 * @param {Array<Object>} params.members - List of all team members
 * @param {string} [params.baseUrl] - Domain/host origin URL for check-in route
 * @param {boolean} [params.isDevTest] - Explicit CLI test mode flag
 * @param {string} [params.devOverrideRecipient] - Optional CLI test recipient override
 * @returns {Promise<{ success: boolean, allSuccess: boolean, qrUrl: string, results: Array<Object> }>}
 */
export async function sendTeamConfirmationEmails({
  teamId,
  event,
  teamLeader,
  members = [],
  baseUrl = 'http://localhost:5173',
  isDevTest = false,
  devOverrideRecipient = null
}) {
  if (!teamId) {
    throw new Error('teamId is required for generating registration passes');
  }

  const apiKey = getServerEnv('RESEND_API_KEY');
  const configuredFromEmail = getServerEnv('RESEND_FROM_EMAIL');

  console.log(`[Email Service] RESEND_API_KEY configured: ${Boolean(apiKey)}`);
  console.log(`[Email Service] RESEND_FROM_EMAIL configured: ${Boolean(configuredFromEmail)}`);

  if (!apiKey) {
    console.warn('❌ RESEND_API_KEY is not configured in environment variables. Email sending skipped.');
    return {
      success: false,
      allSuccess: false,
      skipped: true,
      message: 'RESEND_API_KEY missing from environment',
      qrUrl: `${baseUrl.replace(/\/$/, '')}/check-in/${teamId}`,
      results: []
    };
  }

  const resend = new Resend(apiKey);
  const { sender: fromAddress, warning: senderWarning } = getSanitizedSender(configuredFromEmail);

  if (senderWarning) {
    console.warn(`⚠️ [Resend Sender Notice]: ${senderWarning}`);
  }

  // Generate URL encoded into the QR code
  const checkInUrl = `${baseUrl.replace(/\/$/, '')}/check-in/${teamId}`;
  
  // Generate 1 shared QR code for the entire team on the server
  const qrDataUrl = await generateTeamQRCode(checkInUrl);

  // Extract base64 PNG string for CID inline attachment (without data URI prefix)
  const base64Content = qrDataUrl.replace(/^data:image\/png;base64,/, '');

  // Derive Team Name
  const eventName = event || 'ZenCode Event';
  const leaderName = teamLeader?.name || 'Team';
  const teamName = `${leaderName}'s ${eventName} Team`;

  // Combine team leader and members into a deduplicated unique member list
  const allRecipientsMap = new Map();

  if (teamLeader && teamLeader.email && teamLeader.email.trim()) {
    const normLeaderEmail = teamLeader.email.trim().toLowerCase();
    allRecipientsMap.set(normLeaderEmail, {
      name: teamLeader.name,
      admissionNumber: teamLeader.admissionNumber,
      yearOfStudy: teamLeader.yearOfStudy,
      email: normLeaderEmail
    });
  }

  members.forEach(m => {
    if (m && m.email && m.email.trim()) {
      const normEmail = m.email.trim().toLowerCase();
      if (!allRecipientsMap.has(normEmail)) {
        allRecipientsMap.set(normEmail, {
          name: m.name,
          admissionNumber: m.admissionNumber,
          yearOfStudy: m.yearOfStudy,
          email: normEmail
        });
      }
    }
  });

  const uniqueMembers = Array.from(allRecipientsMap.values());
  const emailResults = [];

  for (const member of uniqueMembers) {
    // STRICT PRODUCTION RECIPIENT LOGIC:
    // Normal registration ALWAYS uses member.email.
    // devOverrideRecipient is ONLY applied if isDevTest === true.
    const targetEmail = (isDevTest && devOverrideRecipient) 
      ? devOverrideRecipient.trim().toLowerCase()
      : member.email.trim().toLowerCase();

    console.log(`📧 Preparing confirmation email for "${member.name}" -> Destination: ${targetEmail}`);

    const htmlContent = buildRegistrationPassEmailHtml({
      studentName: member.name,
      admissionNumber: member.admissionNumber,
      yearOfStudy: member.yearOfStudy,
      eventType: eventName,
      teamName: teamName,
      teamId: teamId,
      qrDataUrl: qrDataUrl
    });

    try {
      const response = await resend.emails.send({
        from: fromAddress,
        to: [targetEmail],
        subject: `🎟️ Your ZEN CODE 2026 Check-in Pass (${eventName})`,
        html: htmlContent,
        attachments: [
          {
            filename: 'team-checkin-qr.png',
            content: base64Content,
            contentType: 'image/png',
            contentId: 'team-qr-code'
          }
        ]
      });

      // Resend SDK returns { data, error }
      if (response.error) {
        console.error(`❌ Resend API Error for ${targetEmail}:`, response.error);
        emailResults.push({
          memberEmail: member.email,
          sentTo: targetEmail,
          status: 'failed',
          id: null,
          error: response.error.message || JSON.stringify(response.error)
        });
      } else if (response.data && response.data.id) {
        console.log(`✅ Resend Email accepted for ${targetEmail}. Resend Message ID: ${response.data.id}`);
        emailResults.push({
          memberEmail: member.email,
          sentTo: targetEmail,
          status: 'sent',
          id: response.data.id,
          error: null
        });
      } else {
        console.warn(`⚠️ Unexpected Resend response structure for ${targetEmail}:`, response);
        emailResults.push({
          memberEmail: member.email,
          sentTo: targetEmail,
          status: 'failed',
          id: null,
          error: 'Empty response data from Resend'
        });
      }
    } catch (err) {
      console.error(`❌ Exception sending pass email to ${targetEmail}:`, err);
      emailResults.push({
        memberEmail: member.email,
        sentTo: targetEmail,
        status: 'failed',
        id: null,
        error: err.message || 'Network exception during Resend request'
      });
    }
  }

  const anySuccess = emailResults.some(r => r.status === 'sent');
  const allSuccess = emailResults.length > 0 && emailResults.every(r => r.status === 'sent');

  return {
    success: anySuccess,
    allSuccess: allSuccess,
    qrUrl: checkInUrl,
    results: emailResults
  };
}
