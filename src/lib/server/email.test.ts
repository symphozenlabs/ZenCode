import { beforeEach, describe, expect, it, vi } from 'vitest';

const send = vi.fn();

vi.mock('resend', () => ({
	Resend: class {
		emails = { send };
	}
}));
vi.mock('$app/server', () => ({
	read: () => new Response(new Uint8Array([1, 2, 3]))
}));

process.env.RESEND_API_KEY = 're_test_0123456789abcdefghij';

const { sendTeamConfirmationEmails } = await import('./email.js');

const team = {
	teamId: 'abcdefghijklmnopqrst',
	teamLeader: { name: 'Lead', admissionNumber: '25CAPMCA001', email: 'lead@example.com' },
	members: [
		{ name: 'Lead', admissionNumber: '25CAPMCA001', email: 'lead@example.com' },
		{ name: 'Two', admissionNumber: '25CAPMCA002', email: 'two@example.com' }
	]
};

describe('sendTeamConfirmationEmails', () => {
	beforeEach(() => send.mockReset());

	it('attaches the template for hackathon teams only', async () => {
		send.mockResolvedValue({ data: { id: 'email-1' }, error: null });

		await sendTeamConfirmationEmails({ ...team, event: 'Hackathon' });
		const names = send.mock.calls.map(([p]) => p.attachments.map((a: { filename: string }) => a.filename));
		expect(names).toHaveLength(2);
		for (const n of names) expect(n).toContain("ZEN code '26 Hackathon Template.pptx");

		send.mockClear();
		await sendTeamConfirmationEmails({ ...team, event: 'Pitch Fest' });
		for (const [p] of send.mock.calls) {
			expect(p.attachments.map((a: { filename: string }) => a.filename)).not.toContain("ZEN code '26 Hackathon Template.pptx");
		}
	});

	it('retries a rate-limited send and reports it as sent', async () => {
		send
			.mockResolvedValueOnce({ data: null, error: { name: 'rate_limit_exceeded', statusCode: 429, message: 'Too many requests' } })
			.mockResolvedValue({ data: { id: 'email-2' }, error: null });

		const out = await sendTeamConfirmationEmails({ ...team, event: 'Pitch Fest', onlyEmails: ['two@example.com'] });
		expect(out.results).toEqual([expect.objectContaining({ memberEmail: 'two@example.com', status: 'sent', attempts: 2 })]);
		expect(send).toHaveBeenCalledTimes(2);
	});

	it('does not retry an exhausted daily quota', async () => {
		send.mockResolvedValue({ data: null, error: { name: 'daily_quota_exceeded', statusCode: 429, message: 'Daily quota reached' } });

		const out = await sendTeamConfirmationEmails({ ...team, event: 'Pitch Fest', onlyEmails: ['lead@example.com'] });
		expect(out.results).toEqual([expect.objectContaining({ status: 'failed', attempts: 1 })]);
		expect(send).toHaveBeenCalledTimes(1);
	});
});
