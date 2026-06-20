import { error, redirect } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { derivedPublicUrl, getDerived } from '$lib/server/storage';

export const GET: RequestHandler = async ({ params, setHeaders }) => {
	const id = params.id;
	const size = params.size.replace(/\.jpg$/, '');
	if (!/^[a-z0-9-]+$/.test(id) || !/^(sm|md|lg|xl|full)$/.test(size)) error(404, 'Image not found');

	// Prefer the CDN custom domain: hand the browser straight to R2's edge.
	const url = derivedPublicUrl(id, size);
	if (url) redirect(307, url);

	// Otherwise proxy the bytes (R2 without a public domain, or local disk).
	const body = await getDerived(id, size);
	if (!body) error(404, 'Image not found');
	setHeaders({ 'Content-Type': 'image/jpeg', 'Cache-Control': 'public, max-age=31536000, immutable' });
	return new Response(body);
};
