import { requireAdmin } from '$lib/server/admin-session';
import { handle } from '$lib/server/games/tech-word-rush';
import type { RequestHandler } from './$types';

/** Is the signed-in browser user an organiser? Decided on the server, from .env + /admins. */
export const GET: RequestHandler = ({ request }) => handle(() => requireAdmin(request));
