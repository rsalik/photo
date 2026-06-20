import { error, json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import {
	addTag,
	addToAlbum,
	bulk,
	deletePhoto,
	removeFromAlbum,
	removeTag,
	updatePhoto
} from '$lib/server/db';

const OPS = [
	'addTags',
	'removeTags',
	'addAlbums',
	'removeAlbums',
	'setLocation',
	'setAnalog',
	'setFilm',
	'setExif',
	'delete'
] as const;
type Op = (typeof OPS)[number];

interface BulkBody {
	ids: string[];
	op: Op;
	values?: string[]; // tag/album names
	value?: string | null; // location
	/** for setAnalog/setFilm */
	analog?: boolean;
	filmStock?: string | null;
	filmIso?: string | null;
	filmFormat?: string | null;
	/** for setExif — only the keys present are written across the selection */
	exif?: {
		cameraModel?: string | null;
		lens?: string | null;
		focalLength?: string | null;
		aperture?: string | null;
		shutterSpeed?: string | null;
		iso?: number | null;
	};
}

/** Bulk operations over groups of photos. */
export const POST: RequestHandler = async ({ request }) => {
	const body = (await request.json()) as BulkBody;
	if (!Array.isArray(body.ids) || body.ids.length === 0) error(400, 'No photos selected');
	if (!OPS.includes(body.op)) error(400, 'Unknown operation');
	const values = (body.values ?? []).map((v) => String(v).trim()).filter(Boolean);

	await bulk(async () => {
		for (const id of body.ids) {
			switch (body.op) {
				case 'addTags':
					for (const v of values) await addTag(id, v);
					break;
				case 'removeTags':
					for (const v of values) await removeTag(id, v);
					break;
				case 'addAlbums':
					for (const v of values) await addToAlbum(id, v);
					break;
				case 'removeAlbums':
					for (const v of values) await removeFromAlbum(id, v);
					break;
				case 'setLocation':
					await updatePhoto(id, { location: body.value?.trim() || null });
					break;
				case 'setAnalog':
					// turning analog off also clears the film fields
					await updatePhoto(
						id,
						body.analog
							? { analog: true }
							: { analog: false, filmStock: null, filmIso: null, filmFormat: null }
					);
					break;
				case 'setFilm':
					await updatePhoto(id, {
						analog: true,
						filmStock: body.filmStock?.trim() || null,
						filmIso: body.filmIso?.trim() || null,
						filmFormat: body.filmFormat?.trim() || null
					});
					break;
				case 'setExif': {
					const e = body.exif;
					if (e) {
						const norm = (v: string | null | undefined) =>
							v === undefined ? undefined : v?.trim() || null;
						await updatePhoto(id, {
							...(e.cameraModel !== undefined && { cameraModel: norm(e.cameraModel) }),
							...(e.lens !== undefined && { lens: norm(e.lens) }),
							...(e.focalLength !== undefined && { focalLength: norm(e.focalLength) }),
							...(e.aperture !== undefined && { aperture: norm(e.aperture) }),
							...(e.shutterSpeed !== undefined && { shutterSpeed: norm(e.shutterSpeed) }),
							...(e.iso !== undefined && { iso: e.iso ?? null })
						});
					}
					break;
				}
				case 'delete':
					await deletePhoto(id);
					break;
			}
		}
	});

	return json({ ok: true, count: body.ids.length });
};
