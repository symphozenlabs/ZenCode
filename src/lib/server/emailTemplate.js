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
 * @param {string} params.checkInUrl - URL link for check-in
 * @param {string} params.qrImageUrl - Accessible image URL for the QR code
 * @returns {string} Clean, responsive HTML email string
 */
export function buildRegistrationPassEmailHtml({
  studentName,
  admissionNumber,
  yearOfStudy,
  eventType,
  teamName,
  teamId,
  checkInUrl,
  qrImageUrl
}) {
  const isHackathon = (eventType || '').toLowerCase().includes('hackathon');
  const eventLabel = isHackathon ? 'Hackathon' : 'Pitch Fest';
  const badgeColor = isHackathon ? '#3f7334' : '#1f593b';
  const badgeBg = isHackathon ? '#e9f2e3' : '#f0f6ec';

  const safeStudentName = escapeHtml(studentName || 'Participant');
  const safeAdmission = escapeHtml(admissionNumber || 'N/A');
  const safeYear = escapeHtml(yearOfStudy || 'N/A');
  const safeEvent = escapeHtml(eventLabel);
  const safeTeamName = escapeHtml(teamName || 'Registered Team');
  const safeTeamId = escapeHtml(teamId || '');
  const safeQrSrc = escapeHtml(qrImageUrl || '');

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>ZEN CODE 2026 - Registration Pass</title>
</head>
<body style="margin: 0; padding: 0; background-color: #f6f8f4; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color: #18231a;">
  <table role="presentation" width="100%" border="0" cellspacing="0" cellpadding="0" style="background-color: #f6f8f4; padding: 32px 12px;">
    <tr>
      <td align="center">
        <!-- Main Pass Container Card -->
        <table role="presentation" width="100%" border="0" cellspacing="0" cellpadding="0" style="max-width: 580px; background-color: #ffffff; border-radius: 12px; overflow: hidden; box-shadow: 0 10px 25px -5px rgba(19, 58, 41, 0.1); border: 1px solid #dce5d9;">
          
          <!-- Header Banner (Forest Green Theme) -->
          <tr>
            <td style="background: linear-gradient(135deg, #133a29 0%, #17462e 100%); padding: 32px 24px; text-align: center; border-bottom: 3px solid #f0c45c;">
              <div style="display: inline-block; background: rgba(255,255,255,0.15); padding: 6px 14px; border-radius: 20px; font-size: 11px; font-weight: 700; letter-spacing: 1.5px; color: #f0c45c; text-transform: uppercase; margin-bottom: 8px;">
                CONFIRMED REGISTRATION
              </div>
              <h1 style="margin: 6px 0 0 0; font-size: 26px; font-weight: 800; color: #ffffff; letter-spacing: 1px;">
                ZEN CODE <span style="color: #f0c45c;">2026</span>
              </h1>
              <p style="margin: 4px 0 0 0; font-size: 13px; color: #e9f2e3;">Official Event Check-in Pass</p>
            </td>
          </tr>

          <!-- Welcome Banner -->
          <tr>
            <td style="padding: 24px 28px 12px 28px; text-align: left;">
              <p style="margin: 0; font-size: 16px; font-weight: 600; color: #17462e;">Hi <span style="color: #3f7334;">${safeStudentName}</span>,</p>
              <p style="margin: 8px 0 0 0; font-size: 14px; color: #475569; line-height: 1.55;">
                Your registration for <strong>ZEN CODE 2026</strong> has been successfully confirmed. Below is your official Event Check-in Pass.
              </p>
            </td>
          </tr>

          <!-- Pass Details Box -->
          <tr>
            <td style="padding: 12px 28px 24px 28px;">
              <table role="presentation" width="100%" border="0" cellspacing="0" cellpadding="0" style="background: #f0f6ec; border: 1.5px solid #dce5d9; border-radius: 10px; padding: 20px;">
                
                <!-- Event & Team Badge -->
                <tr>
                  <td colspan="2" style="padding-bottom: 14px; border-bottom: 1px dashed #cedacb;">
                    <table role="presentation" width="100%" border="0" cellspacing="0" cellpadding="0">
                      <tr>
                        <td align="left">
                          <span style="display: inline-block; background-color: ${badgeBg}; color: ${badgeColor}; font-size: 12px; font-weight: 700; padding: 4px 12px; border-radius: 12px; text-transform: uppercase;">
                            ${safeEvent}
                          </span>
                        </td>
                        <td align="right">
                          <span style="font-size: 12px; font-weight: 600; color: #647064;">
                            Team ID: <code style="background: #ffffff; padding: 3px 8px; border-radius: 4px; color: #17462e; border: 1px solid #cedacb; font-weight: 700;">${safeTeamId}</code>
                          </span>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>

                <!-- Details Grid -->
                <tr>
                  <td width="50%" valign="top" style="padding-top: 14px; padding-right: 10px;">
                    <div style="font-size: 11px; font-weight: 700; color: #647064; text-transform: uppercase; letter-spacing: 0.5px;">Student Name</div>
                    <div style="font-size: 15px; font-weight: 700; color: #18231a; margin-top: 3px;">${safeStudentName}</div>
                  </td>
                  <td width="50%" valign="top" style="padding-top: 14px; padding-left: 10px;">
                    <div style="font-size: 11px; font-weight: 700; color: #647064; text-transform: uppercase; letter-spacing: 0.5px;">Admission No</div>
                    <div style="font-size: 15px; font-weight: 700; color: #18231a; margin-top: 3px;">${safeAdmission}</div>
                  </td>
                </tr>

                <tr>
                  <td width="50%" valign="top" style="padding-top: 12px; padding-right: 10px;">
                    <div style="font-size: 11px; font-weight: 700; color: #647064; text-transform: uppercase; letter-spacing: 0.5px;">Year of Study</div>
                    <div style="font-size: 14px; font-weight: 600; color: #17462e; margin-top: 3px;">${safeYear}</div>
                  </td>
                  <td width="50%" valign="top" style="padding-top: 12px; padding-left: 10px;">
                    <div style="font-size: 11px; font-weight: 700; color: #647064; text-transform: uppercase; letter-spacing: 0.5px;">Team Name</div>
                    <div style="font-size: 14px; font-weight: 600; color: #17462e; margin-top: 3px;">${safeTeamName}</div>
                  </td>
                </tr>

                <!-- Team QR Code Section -->
                <tr>
                  <td colspan="2" align="center" style="padding-top: 24px;">
                    <div style="background: #ffffff; display: inline-block; padding: 14px; border-radius: 10px; border: 1.5px solid #cedacb; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.05); text-align: center;">
                      <img
                        src="${safeQrSrc}"
                        alt="Team Check-in QR Code"
                        width="220"
                        height="220"
                        style="display: block; width: 220px; height: 220px; max-width: 100%; margin: 0 auto; border: 0;"
                      />
                    </div>
                    <div style="margin-top: 12px; font-size: 13px; font-weight: 700; color: #17462e; letter-spacing: 0.5px;">
                      TEAM CHECK-IN QR CODE
                    </div>
                    <p style="margin: 6px 0 0 0; font-size: 12px; color: #647064; line-height: 1.4; max-width: 380px;">
                      Please present this QR code at the event check-in desk.<br>
                      The QR identifies your registered team (all members share the same team QR).
                    </p>
                    <p style="margin: 10px 0 0 0; font-size: 12px; color: #647064; line-height: 1.4; max-width: 380px;">
                      A downloadable PDF copy of this pass is attached to this email.
                    </p>
                  </td>
                </tr>

              </table>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="background-color: #f6f8f4; padding: 18px 24px; text-align: center; border-top: 1px solid #dce5d9;">
              <p style="margin: 0; font-size: 12px; color: #647064; line-height: 1.4;">
                This pass is issued exclusively for <strong>ZEN CODE 2026</strong>. Keep this email or save the QR code image for event entry.
              </p>
              <p style="margin: 6px 0 0 0; font-size: 11px; color: #899689;">
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
