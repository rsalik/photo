import fs from 'node:fs';
import path from 'node:path';
import { bulk, DERIVED_DIR, ORIGINALS_DIR, query } from './connection';

export interface NewPhoto {
	id: string;
	title: string;
	description?: string | null;
	location?: string | null;
	width: number;
	height: number;
	titleColor: string;
	palette: string[];
	blurData: string;
	originalExt: string;
	cameraMake?: string | null;
	cameraModel?: string | null;
	lens?: string | null;
	aperture?: string | null;
	shutterSpeed?: string | null;
	focalLength?: string | null;
	iso?: number | null;
	takenAt?: string | null;
	analog?: boolean;
	filmStock?: string | null;
	filmIso?: string | null;
	filmFormat?: string | null;
	tags?: string[];
	albums?: string[];
}

export async function insertPhoto(p: NewPhoto): Promise<void> {
	await bulk(async () => {
		await query(
			`INSERT INTO photos (
				id, title, description, location, width, height, title_color,
				palette, blur_data, original_ext, camera_make, camera_model, lens, aperture,
				shutter_speed, focal_length, iso, taken_at, analog, film_stock, film_iso, film_format
			) VALUES (
				$1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14,
				$15, $16, $17, $18, $19, $20, $21, $22
			)`,
			[
				p.id,
				p.title,
				p.description ?? null,
				p.location ?? null,
				p.width,
				p.height,
				p.titleColor,
				JSON.stringify(p.palette),
				p.blurData,
				p.originalExt,
				p.cameraMake ?? null,
				p.cameraModel ?? null,
				p.lens ?? null,
				p.aperture ?? null,
				p.shutterSpeed ?? null,
				p.focalLength ?? null,
				p.iso ?? null,
				p.takenAt ?? null,
				p.analog ? 1 : 0,
				p.filmStock ?? null,
				p.filmIso ?? null,
				p.filmFormat ?? null
			]
		);
		for (const tag of p.tags ?? []) await addTag(p.id, tag);
		for (const album of p.albums ?? []) await addToAlbum(p.id, album);
	});
}

export async function titleExists(title: string): Promise<boolean> {
	const rows = await query(`SELECT 1 FROM photos WHERE lower(title) = lower($1)`, [title]);
	return rows.length > 0;
}

export async function idExists(id: string): Promise<boolean> {
	const rows = await query(`SELECT 1 FROM photos WHERE id = $1`, [id]);
	return rows.length > 0;
}

const UPDATABLE = {
	title: 'title',
	description: 'description',
	location: 'location',
	titleColor: 'title_color',
	takenAt: 'taken_at',
	cameraMake: 'camera_make',
	cameraModel: 'camera_model',
	lens: 'lens',
	aperture: 'aperture',
	shutterSpeed: 'shutter_speed',
	focalLength: 'focal_length',
	filmStock: 'film_stock',
	filmIso: 'film_iso',
	filmFormat: 'film_format'
} as const;

export interface PhotoUpdate extends Partial<Record<keyof typeof UPDATABLE, string | null>> {
	analog?: boolean;
	iso?: number | null;
}

export async function updatePhoto(id: string, fields: PhotoUpdate): Promise<void> {
	const sets: string[] = [];
	const params: unknown[] = [];
	const ph = (v: unknown) => {
		params.push(v);
		return `$${params.length}`;
	};
	for (const [key, col] of Object.entries(UPDATABLE)) {
		if (key in fields) sets.push(`${col} = ${ph(fields[key as keyof typeof UPDATABLE] ?? null)}`);
	}
	if (fields.analog !== undefined) sets.push(`analog = ${ph(fields.analog ? 1 : 0)}`);
	if (fields.iso !== undefined) sets.push(`iso = ${ph(fields.iso ?? null)}`);
	if (!sets.length) return;
	await query(`UPDATE photos SET ${sets.join(', ')} WHERE id = ${ph(id)}`, params);
}

export async function addTag(photoId: string, tag: string): Promise<void> {
	const name = tag.trim();
	if (!name) return;
	await query(`INSERT INTO tags (name) VALUES ($1) ON CONFLICT (lower(name)) DO NOTHING`, [name]);
	await query(
		`INSERT INTO photo_tags (photo_id, tag_id)
		 SELECT $1, id FROM tags WHERE lower(name) = lower($2)
		 ON CONFLICT DO NOTHING`,
		[photoId, name]
	);
}

export async function removeTag(photoId: string, tag: string): Promise<void> {
	await query(
		`DELETE FROM photo_tags WHERE photo_id = $1 AND tag_id IN
		 (SELECT id FROM tags WHERE lower(name) = lower($2))`,
		[photoId, tag.trim()]
	);
}

export async function addToAlbum(photoId: string, album: string): Promise<void> {
	const name = album.trim();
	if (!name) return;
	await query(`INSERT INTO albums (name) VALUES ($1) ON CONFLICT (lower(name)) DO NOTHING`, [name]);
	await query(
		`INSERT INTO photo_albums (photo_id, album_id, position)
		 SELECT $1, a.id,
			(SELECT coalesce(max(pa.position), -1) + 1 FROM photo_albums pa WHERE pa.album_id = a.id)
		 FROM albums a WHERE lower(a.name) = lower($2)
		 ON CONFLICT DO NOTHING`,
		[photoId, name]
	);
}

export async function setAlbumOrder(album: string, photoIds: string[]): Promise<void> {
	const row = await query<{ id: number }>(`SELECT id FROM albums WHERE lower(name) = lower($1)`, [
		album
	]);
	const albumId = row[0]?.id;
	if (!albumId) return;
	await bulk(async () => {
		for (let pos = 0; pos < photoIds.length; pos++) {
			await query(
				`UPDATE photo_albums SET position = $1 WHERE album_id = $2 AND photo_id = $3`,
				[pos, albumId, photoIds[pos]]
			);
		}
	});
}

export async function removeFromAlbum(photoId: string, album: string): Promise<void> {
	await query(
		`DELETE FROM photo_albums WHERE photo_id = $1 AND album_id IN
		 (SELECT id FROM albums WHERE lower(name) = lower($2))`,
		[photoId, album.trim()]
	);
}

export async function deletePhoto(id: string): Promise<void> {
	await query(`DELETE FROM photos WHERE id = $1`, [id]);
	// Local-disk image cleanup. With R2 configured, the route handles object
	// removal (see images.ts); on a read-only serverless FS this is a no-op.
	if (process.env.R2_BUCKET) return;
	try {
		fs.rmSync(path.join(DERIVED_DIR, id), { recursive: true, force: true });
		if (fs.existsSync(ORIGINALS_DIR)) {
			for (const f of fs.readdirSync(ORIGINALS_DIR)) {
				if (f.startsWith(`${id}.`)) fs.rmSync(path.join(ORIGINALS_DIR, f), { force: true });
			}
		}
	} catch {
		// best-effort; the DB row is already gone
	}
}
