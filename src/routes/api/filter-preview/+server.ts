import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { listPhotos } from '$lib/server/db';
import { FILTER_KEYS, type GalleryFilters } from '$lib/types';

/** Tiny payload for filter hover previews: count + a handful of thumbs. */
export const GET: RequestHandler = async ({ url, setHeaders }) => {
	const filters: GalleryFilters = {};
	for (const key of FILTER_KEYS) {
		const value = url.searchParams.get(key);
		if (value) filters[key] = value;
	}
	const photos = await listPhotos(filters);
	setHeaders({ 'Cache-Control': 'private, max-age=30' });
	return json({
		count: photos.length,
		photos: photos.slice(0, 6).map((p) => ({
			id: p.id,
			width: p.width,
			height: p.height,
			blurData: p.blurData
		}))
	});
};
