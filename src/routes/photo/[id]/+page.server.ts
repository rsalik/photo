import { error, redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { filteredNeighbors, getPhoto, similarPhotos } from '$lib/server/db';
import { galleryFiltersFromSearchParams } from '$lib/filters';

export const load: PageServerLoad = async ({ params, url }) => {
	// Canonical slugs and legacy stable-id links are separate namespaces. Slugs
	// win for the public route, while admin APIs always use strict IDs.
	const photo = await getPhoto(params.id);
	if (!photo) error(404, 'Photo not found');

	// The canonical URL is the slug (the admin-given name). Legacy stable-id
	// links resolve above and redirect here to the current slug.
	if (params.id !== photo.slug) {
		redirect(301, `/photo/${photo.slug}${url.search}`);
	}

	// Gallery navigation: when arriving from the gallery (marked by `g`), reconstruct
	// the exact filtered set/order the visitor was browsing so Prev/Next walk it and
	// the thumbnail strip mirrors it. The `album` param doubles as a filter, so an
	// album view keeps its hand-sorted order. Direct visits (no `g`) fall back to a
	// "more like this" strip instead.
	const fromGallery = url.searchParams.has('g') || url.searchParams.has('album');
	const filters = galleryFiltersFromSearchParams(url.searchParams);

	const nav = fromGallery ? await filteredNeighbors(filters, photo.id) : null;
	const similar = nav ? [] : await similarPhotos(photo, 6);

	return {
		photo,
		filters,
		nav,
		similar,
		canonicalUrl: `${url.origin}/photo/${photo.slug}`,
		ogImage: `${url.origin}/og/photo/${photo.id}`
	};
};
