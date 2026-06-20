import type { PageServerLoad } from './$types';
import { getFilterOptions, listPhotos } from '$lib/server/db';

export const load: PageServerLoad = () => ({
	photos: listPhotos(),
	options: getFilterOptions()
});
