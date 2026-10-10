import { error, json } from '@sveltejs/kit';
import { liveHub } from '$lib/server/live';
import { requireAdmin } from '$lib/server/live/admin-auth';
import { hubCall } from '$lib/server/live/http';
import { sanitizeSettings, sanitizeTitle } from '$lib/live/session';
import { sanitizeSlide } from '$lib/live/slides';
import { LIMITS, type Slide } from '$lib/live/types';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async (event) => {
	await requireAdmin(event);
	const session = await hubCall(() => liveHub().getSession(event.params.id));
	if (!session) error(404, 'Session not found.');
	return json(session);
};

/** Builder autosave: title, settings and the full ordered slide list. */
export const PUT: RequestHandler = async (event) => {
	await requireAdmin(event);
	const body = await event.request.json().catch(() => null);
	if (!body || typeof body !== 'object' || !Array.isArray(body.slides)) error(400, 'Invalid session.');
	if (body.slides.length > LIMITS.maxSlides) error(400, `A session can have at most ${LIMITS.maxSlides} slides.`);

	const slides: Slide[] = [];
	const ids = new Set<string>();
	for (const raw of body.slides) {
		const slide = sanitizeSlide(raw);
		if (!slide) error(400, 'Invalid slide.');
		if (ids.has(slide.id)) error(400, 'Duplicate slide id.');
		ids.add(slide.id);
		slides.push(slide);
	}
	const current = await hubCall(() => liveHub().getSession(event.params.id));
	if (!current) error(404, 'Session not found.');

	const session = await hubCall(() =>
		liveHub().updateContent(event.params.id, {
			title: sanitizeTitle(body.title) || current.title,
			settings: sanitizeSettings(body.settings, current.settings),
			slides
		})
	);
	return json({ updatedAt: session.updatedAt });
};

export const DELETE: RequestHandler = async (event) => {
	await requireAdmin(event);
	await hubCall(() => liveHub().deleteSession(event.params.id));
	return new Response(null, { status: 204 });
};
