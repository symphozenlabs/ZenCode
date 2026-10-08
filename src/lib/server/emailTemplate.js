/**
 * Generates an email-compatible HTML template for the ZenCode 2026 Check-in Pass.
 *
 * @param {Object} params
 * @param {string} params.studentName
 * @param {string} params.admissionNumber
 * @param {string} params.yearOfStudy
 * @param {string} params.eventType - "Hackathon" or "Pitch Fest"
 * @param {string} params.teamName
 * @param {string} params.teamId
 * @param {string} params.qrDataUrl - Data URL or image src for QR code
 * @returns {string} Clean, responsive HTML email string
 */
export function buildRegistrationPassEmailHtml({
  studentName,
  admissionNumber,
  yearOfStudy,
  eventType,
  teamName,
  teamId,
  qrDataUrl
}) {
  const isHackathon = (eventType || '').toLowerCase().includes('hackathon');
  const badgeColor = isHackathon ? '#06b6d4' : '#10b981';
  const badgeBg = isHackathon ? '#ecfeff' : '#ecfdf5';

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>ZenCode 2026 - Registration Pass</title>
</head>
<body style="margin: 0; padding: 0; background-color: #0f172a; font-family: 'Segoe UI', Arial, sans-serif; color: #334155;">
  <table role="presentation" width="100%" border="0" cellspacing="0" cellpadding="0" style="background-color: #0f172a; padding: 30px 10px;">
    <tr>
      <td align="center">
        <!-- Main Pass Container Card -->
        <table role="presentation" width="100%" border="0" cellspacing="0" cellpadding="0" style="max-width: 580px; background-color: #ffffff; border-radius: 16px; overflow: hidden; box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.3);">
          
          <!-- Header Banner -->
          <tr>
            <td style="background: linear-gradient(135deg, #0f172a 0%, #1e293b 100%); padding: 32px 30px; text-align: center; border-bottom: 3px solid ${badgeColor};">
              <div style="display: inline-block; background: rgba(255,255,255,0.1); padding: 8px 16px; border-radius: 20px; font-size: 12px; font-weight: 700; letter-spacing: 2px; color: #06b6d4; text-transform: uppercase; margin-bottom: 8px;">
                CONFIRMED REGISTRATION
              </div>
              <h1 style="margin: 6px 0 0 0; font-size: 28px; font-weight: 800; color: #ffffff; letter-spacing: 1px;">
                ZEN CODE <span style="color: #06b6d4;">2026</span>
              </h1>
              <p style="margin: 4px 0 0 0; font-size: 13px; color: #94a3b8;">Official Event Check-in Pass</p>
            </td>
          </tr>

          <!-- Welcome Banner -->
          <tr>
            <td style="padding: 24px 30px 10px 30px; text-align: left;">
              <p style="margin: 0; font-size: 16px; font-weight: 600; color: #0f172a;">Hi <span style="color: #0284c7;">${escapeHtml(studentName)}</span>,</p>
              <p style="margin: 8px 0 0 0; font-size: 14px; color: #475569; line-height: 1.5;">
                Your team registration for <strong>ZEN CODE 2026</strong> is officially confirmed! Below is your personalized Event Check-in Pass. Please present the QR code at the desk during check-in.
              </p>
            </td>
          </tr>

          <!-- Pass Details Box -->
          <tr>
            <td style="padding: 15px 30px 25px 30px;">
              <table role="presentation" width="100%" border="0" cellspacing="0" cellpadding="0" style="background: #f8fafc; border: 1.5px solid #e2e8f0; border-radius: 12px; padding: 20px;">
                
                <!-- Event & Team Badge -->
                <tr>
                  <td colspan="2" style="padding-bottom: 16px; border-bottom: 1px dashed #cbd5e1;">
                    <table role="presentation" width="100%" border="0" cellspacing="0" cellpadding="0">
                      <tr>
                        <td align="left">
                          <span style="display: inline-block; background-color: ${badgeBg}; color: ${badgeColor}; font-size: 12px; font-weight: 700; padding: 4px 12px; border-radius: 12px; text-transform: uppercase;">
                            ${escapeHtml(eventType)}
                          </span>
                        </td>
                        <td align="right">
                          <span style="font-size: 11px; font-weight: 600; color: #64748b;">
                            ID: <code style="background: #e2e8f0; padding: 2px 6px; border-radius: 4px; color: #0f172a;">${escapeHtml(teamId)}</code>
                          </span>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>

                <!-- Details Grid -->
                <tr>
                  <td width="50%" valign="top" style="padding-top: 16px; padding-right: 10px;">
                    <div style="font-size: 11px; font-weight: 700; color: #94a3b8; text-transform: uppercase; letter-spacing: 0.5px;">Student Name</div>
                    <div style="font-size: 15px; font-weight: 700; color: #0f172a; margin-top: 3px;">${escapeHtml(studentName)}</div>
                  </td>
                  <td width="50%" valign="top" style="padding-top: 16px; padding-left: 10px;">
                    <div style="font-size: 11px; font-weight: 700; color: #94a3b8; text-transform: uppercase; letter-spacing: 0.5px;">Admission No</div>
                    <div style="font-size: 15px; font-weight: 700; color: #0f172a; margin-top: 3px;">${escapeHtml(admissionNumber)}</div>
                  </td>
                </tr>

                <tr>
                  <td width="50%" valign="top" style="padding-top: 14px; padding-right: 10px;">
                    <div style="font-size: 11px; font-weight: 700; color: #94a3b8; text-transform: uppercase; letter-spacing: 0.5px;">Year of Study</div>
                    <div style="font-size: 14px; font-weight: 600; color: #334155; margin-top: 3px;">${escapeHtml(yearOfStudy || 'N/A')}</div>
                  </td>
                  <td width="50%" valign="top" style="padding-top: 14px; padding-left: 10px;">
                    <div style="font-size: 11px; font-weight: 700; color: #94a3b8; text-transform: uppercase; letter-spacing: 0.5px;">Team Name</div>
                    <div style="font-size: 14px; font-weight: 600; color: #334155; margin-top: 3px;">${escapeHtml(teamName)}</div>
                  </td>
                </tr>

                <!-- Team QR Code Section -->
                <tr>
                  <td colspan="2" align="center" style="padding-top: 24px;">
                    <div style="background: #ffffff; display: inline-block; padding: 14px; border-radius: 12px; border: 1px solid #cbd5e1; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.05);">
                      <img
                        src="cid:team-qr-code"
                        alt="Team Check-in QR Code"
                        width="220"
                        style="display: block; width: 220px; max-width: 100%; height: auto; margin: 0 auto; border: 0;"
                      />
                    </div>
                    <div style="margin-top: 10px; font-size: 11px; font-weight: 600; color: #64748b; letter-spacing: 0.5px;">
                      OFFICIAL TEAM QR CODE (ONE PER TEAM)
                    </div>
                  </td>
                </tr>


              </table>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="background-color: #f1f5f9; padding: 20px 30px; text-align: center; border-top: 1px solid #e2e8f0;">
              <p style="margin: 0; font-size: 12px; color: #64748b; line-height: 1.4;">
                This pass is issued exclusively for <strong>ZEN CODE 2026</strong>. Keep this email or save the QR code image for event entry.
              </p>
              <p style="margin: 8px 0 0 0; font-size: 11px; color: #94a3b8;">
                © 2026 Sympho Zen Labs. All rights reserved.
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}
