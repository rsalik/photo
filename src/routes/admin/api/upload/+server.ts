import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { error, json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { extractExif } from '$lib/server/exif';
import { detectTitleColor, processImage } from '$lib/server/images';
import { getPhoto, idExists, insertPhoto, titleExists } from '$lib/server/db';
import { slugify, titleFromFilename } from '$lib/slug';

const splitList = (value: FormDataEntryValue | null): string[] =>
	String(value ?? '')
		.split(',')
		.map((s) => s.trim())
		.filter(Boolean);

export const POST: RequestHandler = async ({ request }) => {
	const form = await request.formData();
	const file = form.get('file');
	if (!(file instanceof File)) error(400, 'Missing file');
	const buffer = Buffer.from(await file.arrayBuffer());
	if (buffer.length === 0) error(400, 'Empty file');

	// titles are forced unique; collisions get a numeric suffix
	const requested = String(form.get('title') ?? '').trim() || titleFromFilename(file.name);
	let title = requested;
	for (let n = 2; await titleExists(title); n++) title = `${requested} ${n}`;
	const base = slugify(title);
	let id = base;
	for (let n = 2; await idExists(id); n++) id = `${base}-${n}`;

	// exiftool reads from disk, so stage the upload in a temp file
	const tmp = path.join(
		os.tmpdir(),
		`pa-${crypto.randomUUID()}${path.extname(file.name) || '.jpg'}`
	);
	fs.writeFileSync(tmp, buffer);
	try {
		const [exif, processed, colors] = await Promise.all([
			extractExif(tmp),
			processImage(buffer, id, file.name),
			detectTitleColor(buffer)
		]);

		const lastModified = Number(form.get('lastModified'));
		await insertPhoto({
			id,
			title,
			description: String(form.get('description') ?? '').trim() || null,
			location: String(form.get('location') ?? '').trim() || null,
			width: processed.width,
			height: processed.height,
			titleColor: colors.titleColor,
			palette: colors.palette,
			blurData: processed.blurData,
			originalExt: processed.originalExt,
			...exif,
			takenAt:
				exif.takenAt ??
				(Number.isFinite(lastModified) ? new Date(lastModified).toISOString() : null),
			analog: String(form.get('analog') ?? '') === '1',
			filmStock: String(form.get('filmStock') ?? '').trim() || null,
			filmIso: String(form.get('filmIso') ?? '').trim() || null,
			filmFormat: String(form.get('filmFormat') ?? '').trim() || null,
			tags: splitList(form.get('tags')),
			albums: splitList(form.get('albums'))
		});
	} catch (err) {
		console.error('[upload] failed:', err);
		error(422, err instanceof Error ? err.message : 'Could not process image');
	} finally {
		fs.rmSync(tmp, { force: true });
	}

	return json(await getPhoto(id), { status: 201 });
};
