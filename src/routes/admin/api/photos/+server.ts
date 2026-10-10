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
import { isSafePhotoId } from '$lib/server/storage';

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
const isRecord = (value: unknown): value is Record<string, unknown> =>
	typeof value === 'object' && value !== null && !Array.isArray(value);
const isText = (value: unknown, max: number): value is string =>
	typeof value === 'string' && value.length <= max;
const isTextList = (value: unknown, maxItems = 50, maxLength = 120): value is string[] =>
	Array.isArray(value) &&
	value.length <= maxItems &&
	value.every((item) => isText(item, maxLength));

interface BulkBody {
	ids: string[];
	op: Op;
	values?: string[]; // tag/album names
	value?: string | null; // location
	/** for setAnalog/setFilm */
	analog?: boolean;
	filmStock?: string | null;
	/** for setExif — only the keys present are written across the selection */
	exif?: {
		cameraMake?: string | null;
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
	const raw: unknown = await request.json().catch(() => null);
	if (!isRecord(raw)) error(400, 'Expected a JSON object');
	if (!isTextList(raw.ids, 250, 128) || raw.ids.length === 0) {
		error(400, 'Select between 1 and 250 photos');
	}
	if (!raw.ids.every(isSafePhotoId)) error(400, 'Invalid photo id');
	if (typeof raw.op !== 'string' || !(OPS as readonly string[]).includes(raw.op)) {
		error(400, 'Unknown operation');
	}
	if (raw.values !== undefined && !isTextList(raw.values)) error(400, 'Invalid values');
	if (raw.value !== undefined && raw.value !== null && !isText(raw.value, 500)) {
		error(400, 'Invalid location');
	}
	if (raw.analog !== undefined && typeof raw.analog !== 'boolean') error(400, 'Invalid analog value');
	if (raw.filmStock !== undefined && raw.filmStock !== null && !isText(raw.filmStock, 200)) {
		error(400, 'Invalid film stock');
	}
	if (raw.exif !== undefined) {
		if (!isRecord(raw.exif)) error(400, 'Invalid EXIF fields');
		for (const key of ['cameraMake', 'cameraModel', 'lens', 'focalLength', 'aperture', 'shutterSpeed']) {
			const value = raw.exif[key];
			if (value !== undefined && value !== null && !isText(value, 300)) {
				error(400, `Invalid ${key}`);
			}
		}
		const iso = raw.exif.iso;
		if (
			iso !== undefined &&
			iso !== null &&
			(typeof iso !== 'number' || !Number.isInteger(iso) || iso < 0 || iso > 10_000_000)
		) {
			error(400, 'Invalid ISO');
		}
	}
	const body = raw as unknown as BulkBody;
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
					// turning analog off also clears the film field
					await updatePhoto(
						id,
						body.analog ? { analog: true } : { analog: false, filmStock: null }
					);
					break;
				case 'setFilm':
					await updatePhoto(id, {
						analog: true,
						filmStock: body.filmStock?.trim() || null
					});
					break;
				case 'setExif': {
					const e = body.exif;
					if (e) {
						const norm = (v: string | null | undefined) =>
							v === undefined ? undefined : v?.trim() || null;
						await updatePhoto(id, {
							...(e.cameraMake !== undefined && { cameraMake: norm(e.cameraMake) }),
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
