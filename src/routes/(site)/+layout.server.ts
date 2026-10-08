import { getSiteConfig } from '$lib/server/site-config';
import type { LayoutServerLoad } from './$types';

export const load: LayoutServerLoad = async () => {
	return { config: await getSiteConfig() };
};
