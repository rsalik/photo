import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { filteredNeighbors, getPhoto, similarPhotos } from '$lib/server/db';
import { FILTER_KEYS, type GalleryFilters } from '$lib/types';

export const load: PageServerLoad = ({ params, url }) => {
	const photo = getPhoto(params.id);
	if (!photo) error(404, 'Photo not found');

	// Gallery navigation: when arriving from the gallery (marked by `g`), reconstruct
	// the exact filtered set/order the visitor was browsing so Prev/Next walk it and
	// the thumbnail strip mirrors it. The `album` param doubles as a filter, so an
	// album view keeps its hand-sorted order. Direct visits (no `g`) fall back to a
	// "more like this" strip instead.
	const fromGallery = url.searchParams.has('g') || url.searchParams.has('album');
	const filters: GalleryFilters = {};
	for (const key of FILTER_KEYS) {
		const value = url.searchParams.get(key);
		if (value) filters[key] = value;
	}

	const nav = fromGallery ? filteredNeighbors(filters, photo.id) : null;
	const similar = nav ? [] : similarPhotos(photo, 6);

	return { photo, filters, nav, similar };
};
