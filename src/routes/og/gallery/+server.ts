import type { RequestHandler } from './$types';
import { env } from '$env/dynamic/private';
import { listPhotos } from '$lib/server/db';
import { galleryCardHtml, ogResponse } from '$lib/server/og';
import { FAVORITE_TAG, FILTER_KEYS, type GalleryFilters, type Photo } from '$lib/types';

// up to 6 photos spread evenly across the set, for the contact-sheet grid
function sample(photos: Photo[], n = 6): Photo[] {
	if (photos.length <= n) return photos;
	return Array.from({ length: n }, (_, i) => photos[Math.round((i * (photos.length - 1)) / (n - 1))]);
}

export const GET: RequestHandler = async ({ url }) => {
	const filters: GalleryFilters = {};
	for (const key of FILTER_KEYS) {
		const value = url.searchParams.get(key);
		if (value) filters[key] = value;
	}
	const photos = await listPhotos(filters);

	const r2 = env.R2_PUBLIC_URL?.replace(/\/+$/, '');
	const src = (id: string) => (r2 ? `${r2}/derived/${id}/md.jpg` : `${url.origin}/img/${id}/md`);
	const urls = sample(photos).map((p) => src(p.id));

	const title =
		filters.album ||
		(filters.tag && filters.tag.toLowerCase() !== FAVORITE_TAG ? filters.tag : '') ||
		filters.location ||
		'';
	return ogResponse(galleryCardHtml(urls, title || undefined));
};
