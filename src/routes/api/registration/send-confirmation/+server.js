import { EventEmitter } from 'node:events';
import { handleSendConfirmationApi } from '$lib/server/apiHandler.js';

/**
 * main's confirmation-email endpoint (was api/registration/send-confirmation.js
 * on Vercel). Its handler speaks Node req/res, so adapt the Request to that.
 */
async function bridge({ request }) {
	const body = request.method === 'POST' ? await request.text() : '';
	const req = Object.assign(new EventEmitter(), { method: request.method });

	return new Promise((resolve) => {
		const headers = new Headers();
		const res = {
			statusCode: 200,
			setHeader: (name, value) => headers.set(name, value),
			end: (data) => resolve(new Response(data ?? null, { status: res.statusCode, headers }))
		};
		handleSendConfirmationApi(req, res);
		req.emit('data', body);
		req.emit('end');
	});
}

export const POST = bridge;
export const GET = bridge;
