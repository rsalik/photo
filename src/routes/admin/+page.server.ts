import type { PageServerLoad } from './$types';
import { getFilterOptions, listPhotos } from '$lib/server/db';

export const load: PageServerLoad = async () => {
	const [photos, options] = await Promise.all([listPhotos(), getFilterOptions()]);
	return { photos, options };
};
