import type { PageServerLoad } from './$types';
import { getFilterOptions, listPhotos } from '$lib/server/db';
import { galleryFilterParams, galleryFiltersFromSearchParams } from '$lib/filters';

export const load: PageServerLoad = async ({ url }) => {
	const filters = galleryFiltersFromSearchParams(url.searchParams);
	const [photos, options] = await Promise.all([listPhotos(filters), getFilterOptions()]);
	const query = galleryFilterParams(filters).toString();
	return {
		photos,
		options,
		filters,
		canonicalUrl: `${url.origin}/${query ? `?${query}` : ''}`,
		ogImage: `${url.origin}/og/gallery${query ? `?${query}` : ''}`
	};
};
