import { error } from '@sveltejs/kit';
import { HubError } from './hub';

/** Map hub failures to HTTP errors; anything unexpected becomes a 500. */
export async function hubCall<T>(fn: () => Promise<T>): Promise<T> {
	try {
		return await fn();
	} catch (err) {
		if (err instanceof HubError) error(err.status, err.message);
		if ((err as { status?: number }).status) throw err; // already a SvelteKit error
		console.error('[live]', err);
		error(500, 'Something went wrong. Please try again.');
	}
}
