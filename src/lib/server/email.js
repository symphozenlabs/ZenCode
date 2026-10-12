import fs from 'node:fs';
import path from 'node:path';
import { Resend } from 'resend';
import { read } from '$app/server';
import hackathonTemplateUrl from "../../assets/ZEN code '26 Hackathon Template.pptx?url";
import { generateTeamQRCode } from './qr.js';
import { buildRegistrationPassEmailHtml } from './emailTemplate.js';
import { buildRegistrationPassPdfBase64 } from './pdfPass.js';

let envLoaded = false;

function stripInlineComment(value) {
  let inSingleQuote = false;
  let inDoubleQuote = false;

  for (let i = 0; i < value.length; i += 1) {
    const char = value[i];
    const previous = value[i - 1];

    if (char === "'" && !inDoubleQuote && previous !== '\\') {
      inSingleQuote = !inSingleQuote;
    } else if (char === '"' && !inSingleQuote && previous !== '\\') {
      inDoubleQuote = !inDoubleQuote;
    } else if (char === '#' && !inSingleQuote && !inDoubleQuote && /\s/.test(previous || '')) {
      return value.slice(0, i).trim();
    }
  }

  return value.trim();
}

function parseEnvValue(rawValue = '') {
  let value = stripInlineComment(rawValue);

  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    value = value.slice(1, -1);
  }

  return value.trim();
}

function isPlaceholderEnvValue(value) {
  return /your_resend_api_key_here|your_api_key|placeholder/i.test(value || '');
}

/**
 * Loads server environment variables from Vite-style env files for standalone Node paths.
 */
function ensureEnvLoaded() {
  if (envLoaded) return;
  envLoaded = true;

  try {
    const mode = process.env.NODE_ENV || process.env.MODE || 'development';
    const envFiles = ['.env', '.env.local', `.env.${mode}`, `.env.${mode}.local`];

    for (const envFile of envFiles) {
      const envPath = path.resolve(process.cwd(), envFile);
      if (!fs.existsSync(envPath)) continue;

      const content = fs.readFileSync(envPath, 'utf8');
      content.split('\n').forEach(line => {
        if (!line.trim() || line.trim().startsWith('#')) return;

        const match = line.match(/^\s*([\w.-]+)\s*=\s*(.*)?\s*$/);
        if (match) {
          const key = match[1];
          const val = parseEnvValue(match[2] || '');
          const existingVal = parseEnvValue(process.env[key] || '');
          if (val && (!existingVal || isPlaceholderEnvValue(existingVal))) {
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
export function getServerEnv(key) {
  ensureEnvLoaded();
  const proc = typeof process !== 'undefined' && process.env ? process.env[key] : '';
  const meta = typeof import.meta !== 'undefined' && import.meta.env ? import.meta.env[key] : '';
  return parseEnvValue(proc || meta || '');
}

export function getResendApiKeyConfigError(apiKey) {
  if (!apiKey) return 'RESEND_API_KEY missing from environment';

  if (isPlaceholderEnvValue(apiKey)) {
    return 'RESEND_API_KEY is still set to the example placeholder';
  }

  if (!apiKey.startsWith('re_')) {
    return 'RESEND_API_KEY must start with "re_"';
  }

  if (apiKey.length < 20 || !/^[A-Za-z0-9_.-]+$/.test(apiKey)) {
    return 'RESEND_API_KEY is malformed';
  }

  return '';
}

export function getResendErrorMessage(error) {
  const originalMessage = error?.message || JSON.stringify(error);
  const statusCode = error?.statusCode || error?.status;

  if (statusCode === 401 && /api key is invalid/i.test(originalMessage)) {
    return [
      'Resend rejected RESEND_API_KEY as invalid.',
      'Create a new Resend API key with Sending Access or Full Access, update .env.local, and restart the dev server.'
    ].join(' ');
  }

  return originalMessage;
}

const HACKATHON_TEMPLATE_NAME = "ZEN code '26 Hackathon Template.pptx";

/** Base64 of the hackathon template, read once per server instance. */
let hackathonTemplate = null;
async function getHackathonTemplateBase64() {
  hackathonTemplate ??= read(hackathonTemplateUrl)
    .arrayBuffer()
    .then(buf => Buffer.from(buf).toString('base64'))
    .catch(err => {
      hackathonTemplate = null;
      throw err;
    });
  return hackathonTemplate;
}

/**
 * Resend allows a couple of requests per second per account. Space sends out
 * across every registration this instance handles, so a burst of teams
 * registering at once doesn't get members rate-limited.
 */
const MIN_SEND_GAP_MS = 600;
const MAX_SEND_ATTEMPTS = 4;
let sendQueue = Promise.resolve();
let lastSendAt = 0;

const wait = ms => new Promise(resolve => setTimeout(resolve, ms));

function throttled(fn) {
  const run = sendQueue.then(async () => {
    const gap = lastSendAt + MIN_SEND_GAP_MS - Date.now();
    if (gap > 0) await wait(gap);
    try {
      return await fn();
    } finally {
      lastSendAt = Date.now();
    }
  });
  sendQueue = run.catch(() => {});
  return run;
}

function isRetryable(error) {
  const status = error?.statusCode || error?.status;
  const name = error?.name || '';
  // A daily/monthly quota won't clear by retrying in a few seconds.
  if (/quota/i.test(name) || /quota/i.test(error?.message || '')) return false;
  return status === 429 || status >= 500 || name === 'rate_limit_exceeded' || name === 'application_error';
}

/** Send one email, retrying rate limits and transient failures with backoff. */
export async function sendWithRetry(resend, payload) {
  let last = null;
  let attempt = 0;
  while (attempt < MAX_SEND_ATTEMPTS) {
    attempt += 1;
    try {
      const response = await throttled(() => resend.emails.send(payload));
      if (!response.error) return { response, attempts: attempt };
      last = response.error;
      if (!isRetryable(response.error)) break;
    } catch (err) {
      // Network exceptions are worth another try.
      last = err;
    }
    if (attempt < MAX_SEND_ATTEMPTS) await wait(1000 * 2 ** (attempt - 1));
  }
  return { response: { data: null, error: last }, attempts: attempt };
}

export function sanitizeAttachmentName(value) {
  return String(value || '')
    .trim()
    .replace(/[^A-Za-z0-9_-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60) || 'registration-pass';
}

/**
 * Validates and sanitizes the sender address for Resend.
 * Resend free tier prohibits unverified @gmail.com sender addresses.
 *
 * @param {string} rawSender
 * @returns {{ sender: string, warning?: string }}
 */
export function getSanitizedSender(rawSender) {
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
 * @param {string} [params.teamName] - Team name chosen at registration
 * @param {Object} params.teamLeader - Leader details { name, admissionNumber, yearOfStudy, email }
 * @param {Array<Object>} params.members - List of all team members
 * @param {string} [params.baseUrl] - Domain/host origin URL for check-in route
 * @param {Array<string> | null} [params.onlyEmails] - Limit sending to these addresses (admin resends)
 * @returns {Promise<{ success: boolean, allSuccess: boolean, qrUrl?: string, skipped?: boolean, message?: string, results: Array<{ memberEmail: string, memberName?: string, status: string, id: string | null, error: string | null, attempts?: number }> }>}
 */
export async function sendTeamConfirmationEmails({
  teamId,
  event,
  teamName: providedTeamName = '',
  teamLeader,
  members = [],
  baseUrl = 'https://zencode.symphozen.com',
  onlyEmails = null
}) {
  if (!teamId) {
    throw new Error('teamId is required for generating registration passes');
  }

  const apiKey = getServerEnv('RESEND_API_KEY');
  const configuredFromEmail = getServerEnv('RESEND_FROM') || getServerEnv('RESEND_FROM_EMAIL');
  const apiKeyConfigError = getResendApiKeyConfigError(apiKey);

  if (apiKeyConfigError) {
    console.error(`❌ [EMAIL ERROR] ${apiKeyConfigError}.`);
    return {
      success: false,
      allSuccess: false,
      skipped: true,
      message: apiKeyConfigError,
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
  const teamName = providedTeamName.trim() || `${leaderName}'s ${eventName} Team`;

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

  const only = Array.isArray(onlyEmails) ? new Set(onlyEmails.map(e => String(e).trim().toLowerCase())) : null;
  const uniqueMembers = Array.from(allRecipientsMap.values()).filter(m => !only || only.has(m.email));
  const emailResults = [];

  // Hackathon teams also get the submission template.
  let templateAttachment = null;
  if (eventName === 'Hackathon') {
    try {
      templateAttachment = { filename: HACKATHON_TEMPLATE_NAME, content: await getHackathonTemplateBase64() };
    } catch (templateErr) {
      console.error('❌ [EMAIL ERROR] Could not read the hackathon template; sending without it:', templateErr);
    }
  }

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

    const passPdfContent = buildRegistrationPassPdfBase64({
      member,
      eventName,
      teamName,
      teamId,
      checkInUrl
    });
    const passPdfFileName = `${sanitizeAttachmentName(`${eventName}-${member.admissionNumber || member.name || teamId}`)}.pdf`;

    try {
      const { response, attempts } = await sendWithRetry(resend, {
        from: fromAddress,
        to: [member.email],
        subject: `🎟️ Your ZEN CODE 2026 Check-in Pass (${eventName})`,
        html: htmlContent,
        attachments: [
          {
            filename: passPdfFileName,
            content: passPdfContent
          },
          {
            filename: 'team-checkin-qr.png',
            content: base64Content
          },
          ...(templateAttachment ? [templateAttachment] : [])
        ]
      });

      // Resend SDK returns { data, error }
      if (response.error) {
        const errorMsg = getResendErrorMessage(response.error);
        console.error(`[EMAIL ERROR] Failed to send to ${member.email}`);
        console.error(`[EMAIL ERROR] ${errorMsg}`);
        emailResults.push({
          memberEmail: member.email,
          memberName: member.name,
          status: 'failed',
          id: null,
          error: errorMsg,
          attempts
        });
      } else if (response.data && response.data.id) {
        console.log(`[EMAIL] Resend response: ${JSON.stringify(response.data)}`);
        console.log(`[EMAIL] Email sent successfully to ${member.email}`);
        emailResults.push({
          memberEmail: member.email,
          memberName: member.name,
          status: 'sent',
          id: response.data.id,
          error: null,
          attempts
        });
      } else {
        const errorMsg = 'Empty response data from Resend';
        console.error(`[EMAIL ERROR] Failed to send to ${member.email}`);
        console.error(`[EMAIL ERROR] ${errorMsg}`);
        emailResults.push({
          memberEmail: member.email,
          memberName: member.name,
          status: 'failed',
          id: null,
          error: errorMsg,
          attempts
        });
      }
    } catch (err) {
      const errorMsg = err.message || 'Network exception during Resend request';
      console.error(`[EMAIL ERROR] Failed to send to ${member.email}`);
      console.error(`[EMAIL ERROR] ${errorMsg}`);
      emailResults.push({
        memberEmail: member.email,
        memberName: member.name,
        status: 'failed',
        id: null,
        error: errorMsg,
        attempts: 1
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

const PASS_SUBJECT = /Check-in Pass \((Hackathon|Pitch Fest)\)/;
const MAX_LIST_PAGES = 50;

/**
 * Latest check-in pass email Resend holds for each recipient, per event, with
 * its delivery state (delivered, bounced, …). Listing needs a Full Access key.
 *
 * @returns {Promise<{ available: boolean, message?: string, emails: Array<{ email: string, event: string, id: string, lastEvent: string, createdAt: string }> }>}
 */
export async function listPassEmails() {
  const apiKey = getServerEnv('RESEND_API_KEY');
  const apiKeyConfigError = getResendApiKeyConfigError(apiKey);
  if (apiKeyConfigError) return { available: false, message: apiKeyConfigError, emails: [] };

  const resend = new Resend(apiKey);
  const latest = new Map();
  let after;

  for (let page = 0; page < MAX_LIST_PAGES; page += 1) {
    const response = await throttled(() => resend.emails.list({ limit: 100, ...(after ? { after } : {}) }));
    if (response.error) {
      const status = response.error.statusCode || response.error.status;
      return {
        available: false,
        message: status === 401 || status === 403
          ? 'Delivery status needs a Resend API key with Full Access (this one can only send).'
          : getResendErrorMessage(response.error),
        emails: [...latest.values()]
      };
    }

    const items = response.data?.data ?? [];
    for (const item of items) {
      const event = PASS_SUBJECT.exec(item.subject || '')?.[1];
      if (!event) continue;
      for (const to of item.to || []) {
        const email = String(to).trim().toLowerCase();
        const key = `${event}|${email}`;
        const existing = latest.get(key);
        if (!existing || existing.createdAt < item.created_at) {
          latest.set(key, { email, event, id: item.id, lastEvent: item.last_event, createdAt: item.created_at });
        }
      }
    }

    if (!response.data?.has_more || !items.length) break;
    after = items[items.length - 1].id;
  }

  return { available: true, emails: [...latest.values()] };
}
