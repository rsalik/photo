/** Process local admin uploads into image assets and catalog metadata. */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { error, json } from '@sveltejs/kit';
import { dev } from '$app/environment';
import type { RequestHandler } from './$types';
import { extractExif } from '$lib/server/exif';
import { detectTitleColor, processImage } from '$lib/server/images';
import { getPhotoById, insertPhoto, titleExists } from '$lib/server/db';
import { deletePhotoAssets } from '$lib/server/storage';
import { titleFromFilename } from '$lib/slug';

const MAX_UPLOAD_BYTES = 75 * 1024 * 1024;
const ALLOWED_EXTENSIONS = new Set(['jpg', 'jpeg', 'png', 'webp', 'heic', 'heif', 'tif', 'tiff']);
const UPLOAD_ID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const splitList = (value: FormDataEntryValue | null): string[] =>
	String(value ?? '')
		.split(',')
		.map((s) => s.trim())
		.filter(Boolean);

/** Accept native image processing in local development and reject hosted uploads. */
export const POST: RequestHandler = async ({ request, platform }) => {
	// The Cloudflare adapter supplies an emulated platform in Vite development,
	// where Node can still run Sharp and ExifTool.
	if (!dev && platform) error(501, 'Uploads are available from the local admin portal');
	const contentLength = Number(request.headers.get('content-length'));
	if (Number.isFinite(contentLength) && contentLength > MAX_UPLOAD_BYTES + 2 * 1024 * 1024) {
		error(413, 'Photograph is larger than the 75 MB upload limit');
	}
	const form = await request.formData();
	const file = form.get('file');
	if (!(file instanceof File)) error(400, 'Missing file');
	if (file.size > MAX_UPLOAD_BYTES)
		error(413, 'Photograph is larger than the 75 MB upload limit');
	const ext = path.extname(file.name).slice(1).toLowerCase();
	if (!ALLOWED_EXTENSIONS.has(ext)) {
		error(415, 'Use a JPEG, PNG, WebP, HEIC, or TIFF photograph');
	}
	const buffer = Buffer.from(await file.arrayBuffer());
	if (buffer.length === 0) error(400, 'Empty file');
	const uploadId = String(form.get('uploadId') ?? '');
	if (uploadId && !UPLOAD_ID_RE.test(uploadId)) error(400, 'Invalid upload id');
	const id = uploadId || crypto.randomUUID();
	const existing = await getPhotoById(id, { includeTest: true });
	if (existing) return json(existing);

	// titles are forced unique; collisions get a numeric suffix
	const requested = String(form.get('title') ?? '').trim() || titleFromFilename(file.name);
	let title = requested;
	for (let n = 2; await titleExists(title); n++) title = `${requested} ${n}`;
	// Immutable storage identity is independent of the editable title/slug.
	// Parallel same-title uploads can never write the same object keys.

	// exiftool reads from disk, so stage the upload in a temp file
	const tmp = path.join(
		os.tmpdir(),
		`pa-${crypto.randomUUID()}${path.extname(file.name) || '.jpg'}`
	);
	fs.writeFileSync(tmp, buffer);
	let assetsStarted = false;
	try {
		assetsStarted = true;
		const exifWork = extractExif(tmp);
		const imageWork = processImage(buffer, id, file.name);
		const colorWork = detectTitleColor(buffer);
		const work = await Promise.allSettled([exifWork, imageWork, colorWork]);
		const failed = work.find(
			(result): result is PromiseRejectedResult => result.status === 'rejected'
		);
		if (failed) throw failed.reason;
		const exif = await exifWork;
		const processed = await imageWork;
		const colors = await colorWork;

		const lastModifiedRaw = form.get('lastModified');
		const lastModified = lastModifiedRaw == null ? NaN : Number(lastModifiedRaw);
		const photo = {
			id,
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
			tags: splitList(form.get('tags')),
			albums: splitList(form.get('albums'))
		};

		// If concurrent requests picked the same slug before either committed,
		// retry with the next human title suffix. UUID-backed assets stay isolated.
		for (let attempt = 0; ; attempt++) {
			try {
				await insertPhoto({ ...photo, title });
				break;
			} catch (err) {
				const code = (err as { code?: string }).code;
				if (
					code !== '23505' ||
					attempt >= 20 ||
					(await getPhotoById(id, { includeTest: true }))
				) {
					throw err;
				}
				let n = 2;
				do title = `${requested} ${n++}`;
				while (await titleExists(title));
			}
		}
	} catch (err) {
		console.error('[upload] failed:', err);
		// A Neon HTTP write can commit before its response is lost. Only remove
		// assets after a successful lookup proves no row exists; an unknown state
		// deliberately retains files instead of risking permanent photo loss.
		let persisted;
		try {
			persisted = await getPhotoById(id, { includeTest: true });
		} catch {
			error(503, 'Upload state could not be verified; retry this same queue item');
		}
		if (persisted) return json(persisted, { status: 201 });
		if (assetsStarted) await deletePhotoAssets(id).catch(() => undefined);
		error(422, err instanceof Error ? err.message : 'Could not process image');
	} finally {
		fs.rmSync(tmp, { force: true });
	}

	const saved = await getPhotoById(id);
	if (!saved) error(503, 'Upload completed but could not be verified');
	return json(saved, { status: 201 });
};
