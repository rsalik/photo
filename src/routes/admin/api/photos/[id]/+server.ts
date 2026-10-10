import { error, json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import {
	addTag,
	addToAlbum,
	bulk,
	getPhotoById,
	removeFromAlbum,
	removeTag,
	titleExists,
	updatePhoto
} from '$lib/server/db';

interface PatchBody {
	title?: string;
	description?: string | null;
	location?: string | null;
	titleColor?: string;
	takenAt?: string | null;
	cameraMake?: string | null;
	cameraModel?: string | null;
	lens?: string | null;
	aperture?: string | null;
	shutterSpeed?: string | null;
	focalLength?: string | null;
	iso?: number | null;
	analog?: boolean;
	filmStock?: string | null;
	tags?: string[];
	albums?: string[];
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
	typeof value === 'object' && value !== null && !Array.isArray(value);
const isNullableText = (value: unknown, max: number): value is string | null =>
	value === null || (typeof value === 'string' && value.length <= max);
const isTextList = (value: unknown): value is string[] =>
	Array.isArray(value) &&
	value.length <= 100 &&
	value.every((item) => typeof item === 'string' && item.length <= 120);

export const PATCH: RequestHandler = async ({ params, request }) => {
	const photo = await getPhotoById(params.id, { includeTest: true });
	if (!photo) error(404, 'Photo not found');
	const raw: unknown = await request.json().catch(() => null);
	if (!isRecord(raw)) error(400, 'Expected a JSON object');
	if (raw.title !== undefined && (typeof raw.title !== 'string' || raw.title.length > 200)) {
		error(400, 'Invalid title');
	}
	for (const [key, max] of Object.entries({
		description: 5_000,
		location: 500,
		cameraMake: 300,
		cameraModel: 300,
		lens: 300,
		aperture: 100,
		shutterSpeed: 100,
		focalLength: 100,
		filmStock: 200
	})) {
		if (raw[key] !== undefined && !isNullableText(raw[key], max)) error(400, `Invalid ${key}`);
	}
	if (raw.titleColor !== undefined && typeof raw.titleColor !== 'string') {
		error(400, 'Invalid title color');
	}
	if (raw.takenAt !== undefined) {
		if (!isNullableText(raw.takenAt, 100)) error(400, 'Invalid date');
		if (raw.takenAt && !Number.isFinite(Date.parse(raw.takenAt))) error(400, 'Invalid date');
	}
	if (
		raw.iso !== undefined &&
		raw.iso !== null &&
		(typeof raw.iso !== 'number' ||
			!Number.isInteger(raw.iso) ||
			raw.iso < 0 ||
			raw.iso > 10_000_000)
	) {
		error(400, 'Invalid ISO');
	}
	if (raw.analog !== undefined && typeof raw.analog !== 'boolean')
		error(400, 'Invalid analog value');
	if (raw.tags !== undefined && !isTextList(raw.tags)) error(400, 'Invalid tags');
	if (raw.albums !== undefined && !isTextList(raw.albums)) error(400, 'Invalid albums');
	const body = raw as unknown as PatchBody;

	if (body.title !== undefined) {
		const title = body.title.trim();
		if (!title) error(400, 'Title cannot be empty');
		if (title.toLowerCase() !== photo.title.toLowerCase() && (await titleExists(title))) {
			error(409, `A photo titled “${title}” already exists`);
		}
	}
	if (body.titleColor !== undefined && !/^#[0-9a-fA-F]{6}$/.test(body.titleColor)) {
		error(400, 'Title color must be a hex value like #ffffff');
	}

	await bulk(async () => {
		await updatePhoto(params.id, {
			...(body.title !== undefined && { title: body.title.trim() }),
			...(body.description !== undefined && {
				description: body.description?.trim() || null
			}),
			...(body.location !== undefined && { location: body.location?.trim() || null }),
			...(body.titleColor !== undefined && { titleColor: body.titleColor }),
			...(body.takenAt !== undefined && { takenAt: body.takenAt || null }),
			...(body.cameraMake !== undefined && { cameraMake: body.cameraMake?.trim() || null }),
			...(body.cameraModel !== undefined && {
				cameraModel: body.cameraModel?.trim() || null
			}),
			...(body.lens !== undefined && { lens: body.lens?.trim() || null }),
			...(body.aperture !== undefined && { aperture: body.aperture?.trim() || null }),
			...(body.shutterSpeed !== undefined && {
				shutterSpeed: body.shutterSpeed?.trim() || null
			}),
			...(body.focalLength !== undefined && {
				focalLength: body.focalLength?.trim() || null
			}),
			...(body.iso !== undefined && { iso: body.iso ?? null }),
			...(body.analog !== undefined && { analog: body.analog }),
			...(body.filmStock !== undefined && { filmStock: body.filmStock?.trim() || null })
		});
		if (body.tags) {
			const next = new Set(body.tags.map((t) => t.trim().toLowerCase()).filter(Boolean));
			for (const tag of photo.tags)
				if (!next.has(tag.toLowerCase())) await removeTag(params.id, tag);
			for (const tag of body.tags) await addTag(params.id, tag);
		}
		if (body.albums) {
			const next = new Set(body.albums.map((a) => a.trim().toLowerCase()).filter(Boolean));
			for (const album of photo.albums)
				if (!next.has(album.toLowerCase())) await removeFromAlbum(params.id, album);
			for (const album of body.albums) await addToAlbum(params.id, album);
		}
	});

	return json(await getPhotoById(params.id, { includeTest: true }));
};
