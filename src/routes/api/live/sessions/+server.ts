import { json } from '@sveltejs/kit';
import { randomBytes } from 'node:crypto';
import { liveHub } from '$lib/server/live';
import { requireAdmin } from '$lib/server/live/admin-auth';
import { hubCall } from '$lib/server/live/http';
import { sanitizeTitle } from '$lib/live/session';
import { createSlide } from '$lib/live/slides';
import { DEMO_TITLE, demoSlides } from '$lib/live/demo';
import { DEFAULT_SETTINGS, type LiveSession } from '$lib/live/types';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async (event) => {
	await requireAdmin(event);
	return json(await hubCall(() => liveHub().repo.listSessions()));
};

export const POST: RequestHandler = async (event) => {
	const admin = await requireAdmin(event);
	const body = await event.request.json().catch(() => ({}));
	const demo = body?.demo === true;
	const now = Date.now();
	const session: LiveSession = {
		id: randomBytes(10).toString('base64url'),
		title: sanitizeTitle(body?.title) || (demo ? DEMO_TITLE : 'Untitled session'),
		status: 'draft',
		joinCode: null,
		settings: { ...DEFAULT_SETTINGS },
		slides: demo ? demoSlides() : [createSlide('select_answer')],
		createdBy: admin.uid,
		createdAt: now,
		updatedAt: now,
		startedAt: null,
		endedAt: null
	};
	await hubCall(() => liveHub().repo.putSession(session));
	return json(session, { status: 201 });
};
