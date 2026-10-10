import { error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { env } from '$env/dynamic/private';
import { getPhotoById } from '$lib/server/db';
import { ogResponse, photoCardHtml } from '$lib/server/og';

export const GET: RequestHandler = async ({ params, url }) => {
	const photo = await getPhotoById(params.id);
	if (!photo) error(404, 'Photo not found');

	const r2 = env.R2_PUBLIC_URL?.replace(/\/+$/, '');
	const src = r2 ? `${r2}/derived/${photo.id}/lg.jpg` : `${url.origin}/img/${photo.id}/lg`;
	return ogResponse(photoCardHtml(src));
};
