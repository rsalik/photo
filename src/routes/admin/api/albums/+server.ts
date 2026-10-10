import { error, json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { setAlbumOrder } from '$lib/server/db';
import { isSafePhotoId } from '$lib/server/storage';

/** Persist a new photo order for an album. */
export const POST: RequestHandler = async ({ request }) => {
	const body: unknown = await request.json().catch(() => null);
	if (typeof body !== 'object' || body === null || Array.isArray(body)) {
		error(400, 'Expected a JSON object');
	}
	const { album, photoIds } = body as Record<string, unknown>;
	if (typeof album !== 'string' || !album.trim() || album.length > 120) {
		error(400, 'Invalid album name');
	}
	if (
		!Array.isArray(photoIds) ||
		photoIds.length > 10_000 ||
		!photoIds.every((id): id is string => typeof id === 'string' && isSafePhotoId(id)) ||
		new Set(photoIds).size !== photoIds.length
	) {
		error(400, 'Expected a list of unique photo ids');
	}
	await setAlbumOrder(album.trim(), photoIds);
	return json({ ok: true, count: photoIds.length });
};
