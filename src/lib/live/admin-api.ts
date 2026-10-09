import { auth } from '$lib/firebase/client';

export class ApiError extends Error {
	constructor(
		public status: number,
		message: string
	) {
		super(message);
	}
}

export async function idToken(): Promise<string> {
	const user = auth().currentUser;
	if (!user) throw new ApiError(401, 'Your session expired. Sign in again.');
	return user.getIdToken();
}

/** JSON fetch to the admin live API with the organiser's Firebase ID token. */
export async function adminApi<T = unknown>(path: string, init: { method?: string; body?: unknown } = {}): Promise<T> {
	let res: Response;
	try {
		res = await fetch(`/api/live${path}`, {
			method: init.method ?? 'GET',
			headers: {
				authorization: `Bearer ${await idToken()}`,
				...(init.body !== undefined ? { 'content-type': 'application/json' } : {})
			},
			body: init.body !== undefined ? JSON.stringify(init.body) : undefined
		});
	} catch (err) {
		if (err instanceof ApiError) throw err;
		throw new ApiError(0, 'Network problem — check your connection.');
	}
	if (res.status === 204) return undefined as T;
	const data = await res.json().catch(() => null);
	if (!res.ok) throw new ApiError(res.status, data?.message ?? 'Something went wrong. Please try again.');
	return data as T;
}
