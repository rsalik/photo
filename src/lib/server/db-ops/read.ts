import { query } from './connection';
import { rowToPhoto, SELECT_PHOTO, type PhotoRow } from './row';
import { FAVORITE_TAG, type GalleryFilters, type Photo } from '../../types';

export async function getPhoto(id: string): Promise<Photo | null> {
	const rows = await query<PhotoRow>(`${SELECT_PHOTO} WHERE p.id = $1`, [id]);
	return rows[0] ? rowToPhoto(rows[0]) : null;
}

export async function listPhotos(filters: GalleryFilters = {}): Promise<Photo[]> {
	const params: unknown[] = [];
	const ph = (v: unknown) => {
		params.push(v);
		return `$${params.length}`;
	};
	const where: string[] = [];

	// album is bound up front so its placeholder can be reused in the ORDER BY
	const albumPh = filters.album ? ph(filters.album) : null;
	if (albumPh) {
		where.push(`EXISTS (SELECT 1 FROM photo_albums pa JOIN albums a ON a.id = pa.album_id
			WHERE pa.photo_id = p.id AND lower(a.name) = lower(${albumPh}))`);
	}
	if (filters.tag) {
		const t = ph(filters.tag);
		where.push(`EXISTS (SELECT 1 FROM photo_tags pt JOIN tags t ON t.id = pt.tag_id
			WHERE pt.photo_id = p.id AND lower(t.name) = lower(${t}))`);
	}
	if (filters.favorite) {
		const f = ph(FAVORITE_TAG);
		where.push(`EXISTS (SELECT 1 FROM photo_tags pt JOIN tags t ON t.id = pt.tag_id
			WHERE pt.photo_id = p.id AND lower(t.name) = lower(${f}))`);
	}
	if (filters.camera) {
		const c = ph(filters.camera);
		where.push(
			`(p.camera_model = ${c} OR trim(coalesce(p.camera_make,'') || ' ' || coalesce(p.camera_model,'')) = ${c})`
		);
	}
	if (filters.lens) where.push(`p.lens = ${ph(filters.lens)}`);
	if (filters.location) where.push(`lower(p.location) = lower(${ph(filters.location)})`);
	if (filters.aperture) where.push(`p.aperture = ${ph(filters.aperture)}`);
	if (filters.shutter) where.push(`p.shutter_speed = ${ph(filters.shutter)}`);
	if (filters.focal) where.push(`p.focal_length = ${ph(filters.focal)}`);
	if (filters.iso) where.push(`p.iso = ${ph(filters.iso)}::integer`);
	if (filters.analog) where.push(`p.analog = 1`);
	if (filters.film) where.push(`lower(p.film_stock) = lower(${ph(filters.film)})`);
	if (filters.q) {
		const q = ph(`%${filters.q}%`);
		where.push(`(p.title ILIKE ${q} OR p.description ILIKE ${q} OR p.location ILIKE ${q})`);
	}

	const albumPos = albumPh
		? `(SELECT pa.position FROM photo_albums pa JOIN albums a ON a.id = pa.album_id
			WHERE pa.photo_id = p.id AND lower(a.name) = lower(${albumPh}))`
		: null;
	const order = albumPos
		? `ORDER BY ${albumPos} IS NULL, ${albumPos}, coalesce(p.taken_at, p.uploaded_at) DESC`
		: `ORDER BY coalesce(p.taken_at, p.uploaded_at) DESC, p.uploaded_at DESC`;

	const sql = `${SELECT_PHOTO} ${where.length ? `WHERE ${where.join(' AND ')}` : ''} ${order}`;
	const rows = await query<PhotoRow>(sql, params);
	return rows.map(rowToPhoto);
}

export async function getAlbumsWithCounts(): Promise<{ name: string; count: number }[]> {
	return query<{ name: string; count: number }>(`
		SELECT a.name, count(pa.photo_id)::int AS count
		FROM albums a JOIN photo_albums pa ON pa.album_id = a.id
		GROUP BY a.id, a.name ORDER BY a.name
	`);
}

export async function similarPhotos(photo: Photo, limit = 6): Promise<Photo[]> {
	const sql = `
		${SELECT_PHOTO}
		WHERE p.id != $1
		ORDER BY
			(SELECT count(*) FROM photo_albums pa WHERE pa.photo_id = p.id AND pa.album_id IN
				(SELECT album_id FROM photo_albums WHERE photo_id = $1)) DESC,
			(SELECT count(*) FROM photo_tags pt WHERE pt.photo_id = p.id AND pt.tag_id IN
				(SELECT tag_id FROM photo_tags WHERE photo_id = $1)) DESC,
			abs(extract(epoch FROM (coalesce(p.taken_at, p.uploaded_at)::timestamptz - $2::timestamptz))) ASC
		LIMIT $3
	`;
	const rows = await query<PhotoRow>(sql, [photo.id, photo.takenAt ?? photo.uploadedAt, limit]);
	return rows.map(rowToPhoto);
}

export interface FilterOptions {
	albums: string[];
	tags: string[];
	cameras: string[];
	lenses: string[];
	locations: string[];
	filmStocks: string[];
	hasAnalog: boolean;
}

export async function getFilterOptions(): Promise<FilterOptions> {
	const names = async (sql: string, params: unknown[] = []) =>
		(await query<{ n: string }>(sql, params)).map((r) => r.n);
	const [albums, tags, cameras, lenses, locations, filmStocks, analog] = await Promise.all([
		names(
			`SELECT a.name n FROM albums a WHERE EXISTS (SELECT 1 FROM photo_albums pa WHERE pa.album_id = a.id) ORDER BY a.name`
		),
		names(
			`SELECT t.name n FROM tags t WHERE EXISTS (SELECT 1 FROM photo_tags pt WHERE pt.tag_id = t.id) AND lower(t.name) <> lower($1) ORDER BY t.name`,
			[FAVORITE_TAG]
		),
		names(`SELECT DISTINCT camera_model n FROM photos WHERE camera_model IS NOT NULL ORDER BY 1`),
		names(`SELECT DISTINCT lens n FROM photos WHERE lens IS NOT NULL ORDER BY 1`),
		names(`SELECT DISTINCT location n FROM photos WHERE location IS NOT NULL ORDER BY 1`),
		names(
			`SELECT DISTINCT film_stock n FROM photos WHERE analog = 1 AND film_stock IS NOT NULL AND film_stock <> '' ORDER BY 1`
		),
		query(`SELECT 1 FROM photos WHERE analog = 1 LIMIT 1`)
	]);
	return { albums, tags, cameras, lenses, locations, filmStocks, hasAnalog: analog.length > 0 };
}

export async function getAlbumPhotos(album: string): Promise<Photo[]> {
	const sql = `
		${SELECT_PHOTO}
		JOIN photo_albums pa ON pa.photo_id = p.id
		JOIN albums a ON a.id = pa.album_id
		WHERE lower(a.name) = lower($1)
		ORDER BY pa.position IS NULL, pa.position, coalesce(p.taken_at, p.uploaded_at) DESC
	`;
	const rows = await query<PhotoRow>(sql, [album]);
	return rows.map(rowToPhoto);
}

/**
 * Prev/next navigation for a photo within an arbitrary *filtered* gallery view
 * (the same set and order the visitor was browsing). Returns `null` when the
 * photo isn't part of the set or the set is trivial. `strip` is a stable
 * four-frame window — ideally the previous frame, the current one, and the next
 * two — clamped at the ends so it never collapses regardless of position.
 */
export async function filteredNeighbors(
	filters: GalleryFilters,
	photoId: string
): Promise<{ prev: Photo | null; next: Photo | null; index: number; total: number; strip: Photo[] } | null> {
	const photos = await listPhotos(filters);
	const i = photos.findIndex((p) => p.id === photoId);
	if (i < 0 || photos.length < 2) return null;

	const WINDOW = 4;
	const start = Math.max(0, Math.min(i - 1, photos.length - WINDOW));
	return {
		prev: i > 0 ? photos[i - 1] : null,
		next: i < photos.length - 1 ? photos[i + 1] : null,
		index: i,
		total: photos.length,
		strip: photos.slice(start, start + WINDOW)
	};
}
