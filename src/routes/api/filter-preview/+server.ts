import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { filterPreview } from '$lib/server/db';
import { galleryFiltersFromSearchParams } from '$lib/filters';

/** Tiny payload for filter hover previews: count + a handful of thumbs. */
export const GET: RequestHandler = async ({ url, setHeaders }) => {
	const filters = galleryFiltersFromSearchParams(url.searchParams);
	setHeaders({ 'Cache-Control': 'private, max-age=30' });
	return json(await filterPreview(filters));
};
