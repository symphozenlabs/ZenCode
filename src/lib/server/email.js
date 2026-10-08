import fs from 'node:fs';
import path from 'node:path';
import { Resend } from 'resend';
import { generateTeamQRCode } from './qr.js';
import { buildRegistrationPassEmailHtml } from './emailTemplate.js';

/**
 * Loads environment variables from .env file if not already populated in process.env.
 */
function ensureEnvLoaded() {
  if (process.env.RESEND_API_KEY) return;
  try {
    const envPath = path.resolve(process.cwd(), '.env');
    if (fs.existsSync(envPath)) {
      const content = fs.readFileSync(envPath, 'utf8');
      content.split('\n').forEach(line => {
        const match = line.match(/^\s*([\w.-]+)\s*=\s*(.*)?\s*$/);
        if (match) {
          const key = match[1];
          let val = (match[2] || '').trim();
          if (val.startsWith('"') && val.endsWith('"')) val = val.slice(1, -1);
          if (val.startsWith("'") && val.endsWith("'")) val = val.slice(1, -1);
          if (val && !process.env[key]) {
            process.env[key] = val;
          }
        }
      });
    }
  } catch (e) {
    // Ignore fallback errors
  }
}

/**
 * Gets server environment variable safely across Node and Vite
 * @param {string} key
 * @returns {string}
 */
function getServerEnv(key) {
  ensureEnvLoaded();
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
  if (!rawSender || !rawSender.trim()) {
    return { sender: defaultSender };
  }

  const trimmed = rawSender.trim();

  // Check if sender uses @gmail.com directly without custom verified domain
  if (trimmed.toLowerCase().includes('@gmail.com')) {
    return {
      sender: defaultSender,
      warning: `Configured sender ("${trimmed}") uses @gmail.com. Resend requires a verified custom domain to send from @gmail.com. Defaulted to "${defaultSender}".`
    };
  }

  return { sender: trimmed };
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
 * @returns {Promise<{ success: boolean, allSuccess: boolean, qrUrl: string, results: Array<Object> }>}
 */
export async function sendTeamConfirmationEmails({
  teamId,
  event,
  teamLeader,
  members = [],
  baseUrl = 'http://localhost:5173'
}) {
  if (!teamId) {
    throw new Error('teamId is required for generating registration passes');
  }

  const apiKey = getServerEnv('RESEND_API_KEY');
  const configuredFromEmail = getServerEnv('RESEND_FROM') || getServerEnv('RESEND_FROM_EMAIL');

  if (!apiKey) {
    console.error('❌ [EMAIL ERROR] RESEND_API_KEY is not configured in environment variables.');
    return {
      success: false,
      allSuccess: false,
      skipped: true,
      message: 'RESEND_API_KEY missing from environment',
      results: []
    };
  }

  const resend = new Resend(apiKey);
  const { sender: fromAddress, warning: senderWarning } = getSanitizedSender(configuredFromEmail);

  if (senderWarning) {
    console.warn(`⚠️ [Resend Sender Notice]: ${senderWarning}`);
  }

  // Generate 1 shared URL encoded into the QR code for the ENTIRE team
  const cleanBaseUrl = baseUrl.replace(/\/$/, '');
  const checkInUrl = `${cleanBaseUrl}/check-in/${encodeURIComponent(teamId)}`;
  
  // 1. Generate QR Code image server-side via QRCode package
  let qrDataUrl = '';
  try {
    qrDataUrl = await generateTeamQRCode(checkInUrl);
    console.log('[REGISTRATION] QR generation successful');
  } catch (qrErr) {
    console.error('❌ [REGISTRATION ERROR] QR code generation failed:', qrErr);
    throw qrErr;
  }

  // Extract base64 content for email attachment
  const base64Content = qrDataUrl.replace(/^data:image\/png;base64,/, '');

  // Hosted QR image URL that renders reliably across Resend preview, Gmail, Yahoo, Outlook
  const hostedQrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=250x250&data=${encodeURIComponent(checkInUrl)}`;

  // Derive Event & Team Name
  const eventName = event || 'Hackathon';
  const leaderName = teamLeader?.name?.trim() || 'Team';
  const teamName = `${leaderName}'s ${eventName} Team`;

  // Deduplicate and validate all recipient members
  const allRecipientsMap = new Map();
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

  // Add team leader if valid email
  if (teamLeader && teamLeader.email && typeof teamLeader.email === 'string') {
    const leaderEmail = teamLeader.email.trim().toLowerCase();
    if (emailRegex.test(leaderEmail)) {
      allRecipientsMap.set(leaderEmail, {
        name: (teamLeader.name || 'Team Leader').trim(),
        admissionNumber: (teamLeader.admissionNumber || '').trim(),
        yearOfStudy: (teamLeader.yearOfStudy || teamLeader.classSection || '').trim(),
        email: leaderEmail
      });
    }
  }

  // Add other team members
  if (Array.isArray(members)) {
    members.forEach(m => {
      if (!m || !m.email || typeof m.email !== 'string') return;
      const memEmail = m.email.trim().toLowerCase();
      if (emailRegex.test(memEmail) && !allRecipientsMap.has(memEmail)) {
        allRecipientsMap.set(memEmail, {
          name: (m.name || 'Team Member').trim(),
          admissionNumber: (m.admissionNumber || '').trim(),
          yearOfStudy: (m.yearOfStudy || m.classSection || '').trim(),
          email: memEmail
        });
      }
    });
  }

  const uniqueMembers = Array.from(allRecipientsMap.values());
  const emailResults = [];

  for (const member of uniqueMembers) {
    console.log(`[EMAIL] Preparing email for ${member.email}`);
    console.log(`[EMAIL] Sending through Resend`);

    const htmlContent = buildRegistrationPassEmailHtml({
      studentName: member.name,
      admissionNumber: member.admissionNumber,
      yearOfStudy: member.yearOfStudy,
      eventType: eventName,
      teamName: teamName,
      teamId: teamId,
      checkInUrl: checkInUrl,
      qrImageUrl: hostedQrUrl
    });

    try {
      const response = await resend.emails.send({
        from: fromAddress,
        to: [member.email],
        subject: `🎟️ Your ZEN CODE 2026 Check-in Pass (${eventName})`,
        html: htmlContent,
        attachments: [
          {
            filename: 'team-checkin-qr.png',
            content: base64Content
          }
        ]
      });

      // Resend SDK returns { data, error }
      if (response.error) {
        const errorMsg = response.error.message || JSON.stringify(response.error);
        console.error(`[EMAIL ERROR] Failed to send to ${member.email}`);
        console.error(`[EMAIL ERROR] ${errorMsg}`);
        emailResults.push({
          memberEmail: member.email,
          status: 'failed',
          id: null,
          error: errorMsg
        });
      } else if (response.data && response.data.id) {
        console.log(`[EMAIL] Resend response: ${JSON.stringify(response.data)}`);
        console.log(`[EMAIL] Email sent successfully to ${member.email}`);
        emailResults.push({
          memberEmail: member.email,
          status: 'sent',
          id: response.data.id,
          error: null
        });
      } else {
        const errorMsg = 'Empty response data from Resend';
        console.error(`[EMAIL ERROR] Failed to send to ${member.email}`);
        console.error(`[EMAIL ERROR] ${errorMsg}`);
        emailResults.push({
          memberEmail: member.email,
          status: 'failed',
          id: null,
          error: errorMsg
        });
      }
    } catch (err) {
      const errorMsg = err.message || 'Network exception during Resend request';
      console.error(`[EMAIL ERROR] Failed to send to ${member.email}`);
      console.error(`[EMAIL ERROR] ${errorMsg}`);
      emailResults.push({
        memberEmail: member.email,
        status: 'failed',
        id: null,
        error: errorMsg
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
