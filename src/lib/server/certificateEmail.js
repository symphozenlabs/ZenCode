import { Resend } from 'resend';
import { doc, getDoc, serverTimestamp, updateDoc } from 'firebase/firestore';
import { adminDb } from '$lib/server/admin-session';
import { COLLECTION_BY_EVENT } from '$lib/registrations/model';
import {
	getResendApiKeyConfigError,
	getResendErrorMessage,
	getSanitizedSender,
	getServerEnv,
	sanitizeAttachmentName,
	sendWithRetry
} from './email.js';

/**
 * Emails one issued certificate to the participant it was issued to.
 *
 * The address is read here from the team's registration, never taken from
 * the browser, so a certificate can only go to the person it names. The
 * result is recorded on the certificate (emailedTo / emailedAt / emailError).
 */

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const escapeHtml = (value) =>
	String(value ?? '')
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;')
		.replace(/"/g, '&quot;')
		.replace(/'/g, '&#39;');

/** The member's address from the registration; the leader's for member 1 if theirs is missing. */
function memberEmail(registration, memberNumber) {
	const members = Array.isArray(registration.members) ? registration.members : [];
	const member = members.find((m, i) => (typeof m?.memberNumber === 'number' ? m.memberNumber : i + 1) === memberNumber);
	const email = String(member?.email || (memberNumber === 1 ? registration.teamLeader?.email : '') || '')
		.trim()
		.toLowerCase();
	return EMAIL.test(email) ? email : '';
}

function certificateEmailHtml({ name, eventTitle, award, teamName, code, verifyUrl }) {
	const reason = award
		? `for winning <strong>${escapeHtml(award)}</strong> at <strong>${escapeHtml(eventTitle)}</strong>`
		: `for taking part in <strong>${escapeHtml(eventTitle)}</strong>`;
	return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="utf-8" /><meta name="viewport" content="width=device-width, initial-scale=1" /><title>Your certificate</title></head>
<body style="margin:0;padding:0;background:#f6f8f4;font-family:Inter,Segoe UI,Arial,sans-serif;color:#18231a;">
	<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f6f8f4;padding:32px 12px;">
		<tr><td align="center">
			<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border:1px solid #dce5d9;border-radius:12px;overflow:hidden;">
				<tr><td style="background:#17462e;padding:22px 28px;color:#ffffff;font-size:18px;font-weight:700;letter-spacing:0.04em;">ZEN CODE</td></tr>
				<tr><td style="padding:28px;">
					<p style="margin:0 0 6px;font-size:13px;color:#647064;text-transform:uppercase;letter-spacing:0.12em;">Your certificate</p>
					<h1 style="margin:0 0 16px;font-size:22px;line-height:1.3;">Congratulations, ${escapeHtml(name)}!</h1>
					<p style="margin:0 0 16px;font-size:15px;line-height:1.6;">
						Your certificate ${reason}${teamName ? ` with team <strong>${escapeHtml(teamName)}</strong>` : ''} is attached to this email as a PDF.
					</p>
					<p style="margin:0 0 22px;font-size:15px;line-height:1.6;">
						Anyone can confirm it is genuine by scanning its QR code or opening the link below.
					</p>
					<a href="${escapeHtml(verifyUrl)}" style="display:inline-block;background:#3f7334;color:#ffffff;text-decoration:none;font-weight:600;font-size:14px;padding:11px 20px;border-radius:8px;">View and verify your certificate</a>
					<p style="margin:22px 0 0;font-size:13px;color:#647064;">Certificate ID: <span style="font-family:Consolas,monospace;color:#18231a;">${escapeHtml(code)}</span></p>
				</td></tr>
			</table>
		</td></tr>
	</table>
</body>
</html>`;
}

/**
 * @param {{ code: string, pdf: Uint8Array, verifyBase: string }} input
 * @returns {Promise<{ to: string }>}
 */
export async function emailCertificate({ code, pdf, verifyBase }) {
	const apiKey = getServerEnv('RESEND_API_KEY');
	const keyError = getResendApiKeyConfigError(apiKey);
	if (keyError) throw Object.assign(new Error(`Email is not set up: ${keyError}.`), { status: 503 });

	const db = await adminDb();
	const issueRef = doc(db, 'certificateIssues', code);
	const issueSnap = await getDoc(issueRef);
	if (!issueSnap.exists()) throw Object.assign(new Error('That certificate does not exist.'), { status: 404 });
	const issue = issueSnap.data();
	if (issue.revoked) throw Object.assign(new Error('That certificate is revoked.'), { status: 409 });

	const collectionName = COLLECTION_BY_EVENT[issue.event === 'pitch-fest' ? 'pitch-fest' : 'hackathon'];
	const regSnap = await getDoc(doc(db, collectionName, String(issue.registrationId)));
	const to = regSnap.exists() ? memberEmail(regSnap.data(), Number(issue.memberNumber) || 1) : '';
	if (!to) {
		await updateDoc(issueRef, { emailError: 'No email address on the registration.', emailedAt: null });
		throw Object.assign(new Error(`No email address for ${issue.name}.`), { status: 422 });
	}

	const values = issue.values ?? {};
	const eventTitle = values.event_title || (issue.event === 'pitch-fest' ? 'Pitch Fest' : 'Hackathon');
	const verifyUrl = `${verifyBase.replace(/\/+$/, '')}/verify/${code}`;
	const { sender } = getSanitizedSender(getServerEnv('RESEND_FROM') || getServerEnv('RESEND_FROM_EMAIL'));

	// Shares the registration mail's queue, so bulk sends stay under Resend's rate limit.
	const { response } = await sendWithRetry(new Resend(apiKey), {
		from: sender,
		to: [to],
		subject: `Your ${eventTitle} certificate — ZEN CODE`,
		html: certificateEmailHtml({
			name: issue.name,
			eventTitle,
			award: issue.award,
			teamName: issue.teamName,
			code,
			verifyUrl
		}),
		attachments: [
			{
				filename: `${sanitizeAttachmentName(`ZenCode-Certificate-${issue.name}-${code}`)}.pdf`,
				content: Buffer.from(pdf).toString('base64')
			}
		]
	});

	if (response.error || !response.data?.id) {
		const message = response.error ? getResendErrorMessage(response.error) : 'Empty response from Resend';
		await updateDoc(issueRef, { emailError: message });
		throw Object.assign(new Error(`Could not email ${issue.name}: ${message}`), { status: 502 });
	}

	await updateDoc(issueRef, { emailedTo: to, emailedAt: serverTimestamp(), emailError: null });
	return { to };
}
