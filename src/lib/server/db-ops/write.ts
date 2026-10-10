import { bulk, query } from './connection';
import { deletePhotoAssets } from '../storage';
import { slugify } from '../../slug';

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
	tags?: string[];
	albums?: string[];
}

async function uniqueSlug(table: 'photos' | 'tags' | 'albums', base: string): Promise<string> {
	const root = slugify(base);
	let slug = root;
	const collisionSql =
		table === 'photos'
			? `SELECT 1 FROM photos WHERE slug = $1 OR id = $1`
			: `SELECT 1 FROM ${table} WHERE slug = $1`;
	for (let n = 2; (await query(collisionSql, [slug])).length; n++) {
		slug = `${root}-${n}`;
	}
	return slug;
}

export async function insertPhoto(p: NewPhoto): Promise<void> {
	await bulk(async () => {
		const slug = await uniqueSlug('photos', p.title);
		await query(
			`INSERT INTO photos (
				id, slug, title, description, location, width, height, title_color,
				palette, blur_data, original_ext, camera_make, camera_model, lens, aperture,
				shutter_speed, focal_length, iso, taken_at, is_analog, film_stock
			) VALUES (
				$1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb, $10, $11, $12, $13, $14, $15,
				$16, $17, $18, $19, $20, $21
			)`,
			[
				p.id,
				slug,
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
				p.analog ?? false,
				p.filmStock ?? null
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
	filmStock: 'film_stock'
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
		if (key in fields)
			sets.push(`${col} = ${ph(fields[key as keyof typeof UPDATABLE] ?? null)}`);
	}
	// Renaming a photo re-points its public URL: regenerate the slug from the new
	// title (unique, excluding this photo). The stable id keeps old links working.
	if (fields.title != null && String(fields.title).trim() !== '') {
		// Collapse legacy slug-keyed view counters into the stable photo id before
		// changing the slug. One data-modifying CTE keeps the merge atomic.
		await query(
			`WITH legacy AS (
				DELETE FROM analytics_daily
				 WHERE metric = 'photo'
				   AND key = (SELECT slug FROM photos WHERE id = $1)
				 RETURNING day, count
			 )
			 INSERT INTO analytics_daily (day, metric, key, count)
			 SELECT day, 'photo', $1, count FROM legacy
			 ON CONFLICT (day, metric, key)
			 DO UPDATE SET count = analytics_daily.count + excluded.count`,
			[id]
		);
		const base = slugify(String(fields.title));
		let slug = base;
		for (
			let n = 2;
			(
				await query(`SELECT 1 FROM photos WHERE (slug = $1 OR id = $1) AND id <> $2`, [
					slug,
					id
				])
			).length;
			n++
		) {
			slug = `${base}-${n}`;
		}
		sets.push(`slug = ${ph(slug)}`);
	}
	if (fields.analog !== undefined) sets.push(`is_analog = ${ph(fields.analog)}`);
	if (fields.iso !== undefined) sets.push(`iso = ${ph(fields.iso ?? null)}`);
	if (!sets.length) return;
	sets.push(`updated_at = now()`);
	await query(`UPDATE photos SET ${sets.join(', ')} WHERE id = ${ph(id)}`, params);
}

export async function addTag(photoId: string, tag: string): Promise<void> {
	const name = tag.trim();
	if (!name) return;
	const slug = await uniqueSlug('tags', name);
	await query(
		`INSERT INTO tags (name, slug) VALUES ($1, $2) ON CONFLICT (lower(name)) DO NOTHING`,
		[name, slug]
	);
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
	const slug = await uniqueSlug('albums', name);
	await query(
		`INSERT INTO albums (name, slug) VALUES ($1, $2) ON CONFLICT (lower(name)) DO NOTHING`,
		[name, slug]
	);
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
	if (!photoIds.length) return;
	// One atomic statement also works with Neon's stateless HTTP driver, avoiding
	// a round trip per photograph and partially saved orders on connection loss.
	await query(
		`UPDATE photo_albums pa SET position = (ordered.position - 1)::int
		 FROM albums a, unnest($2::text[]) WITH ORDINALITY AS ordered(photo_id, position)
		 WHERE pa.album_id = a.id AND lower(a.name) = lower($1)
		   AND pa.photo_id = ordered.photo_id`,
		[album, photoIds]
	);
}

export async function removeFromAlbum(photoId: string, album: string): Promise<void> {
	await query(
		`DELETE FROM photo_albums WHERE photo_id = $1 AND album_id IN
		 (SELECT id FROM albums WHERE lower(name) = lower($2))`,
		[photoId, album.trim()]
	);
}

export async function deletePhoto(id: string): Promise<void> {
	const deleted = await query<{ id: string }>(`DELETE FROM photos WHERE id = $1 RETURNING id`, [
		id
	]);
	if (deleted[0]) await deletePhotoAssets(deleted[0].id);
}
