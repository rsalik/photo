import type { PageServerLoad } from './$types';
import { getFilterOptions, listPhotos } from '$lib/server/db';
import { FILTER_KEYS, type GalleryFilters } from '$lib/types';

export const load: PageServerLoad = ({ url }) => {
	const filters: GalleryFilters = {};
	for (const key of FILTER_KEYS) {
		const value = url.searchParams.get(key);
		if (value) filters[key] = value;
	}
	return {
		photos: listPhotos(filters),
		options: getFilterOptions(),
		filters
	};
};
