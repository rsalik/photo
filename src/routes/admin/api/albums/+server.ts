import { error, json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { setAlbumOrder } from '$lib/server/db';

interface OrderBody {
	album: string;
	photoIds: string[];
}

/** Persist a new photo order for an album. */
export const POST: RequestHandler = async ({ request }) => {
	const body = (await request.json()) as OrderBody;
	if (!body.album || !Array.isArray(body.photoIds)) error(400, 'album and photoIds required');
	setAlbumOrder(body.album, body.photoIds);
	return json({ ok: true, count: body.photoIds.length });
};
