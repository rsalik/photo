import { db } from './connection';
import { rowToPhoto, SELECT_PHOTO, type PhotoRow } from './row';
import { FAVORITE_TAG, type GalleryFilters, type Photo } from '../../types';

export function getPhoto(id: string): Photo | null {
	const row = db.prepare(`${SELECT_PHOTO} WHERE p.id = ?`).get(id) as PhotoRow | undefined;
	return row ? rowToPhoto(row) : null;
}

export function listPhotos(filters: GalleryFilters = {}): Photo[] {
	const where: string[] = [];
	const params: Record<string, string> = {};

	// Map filter keys to their SQL conditions.
	// This helps condense the previously repetitive 'if' blocks into a cleaner structure.
	const conditions: Record<keyof GalleryFilters, string | null> = {
		album: `EXISTS (SELECT 1 FROM photo_albums pa JOIN albums a ON a.id = pa.album_id WHERE pa.photo_id = p.id AND a.name = :album COLLATE NOCASE)`,
		tag: `EXISTS (SELECT 1 FROM photo_tags pt JOIN tags t ON t.id = pt.tag_id WHERE pt.photo_id = p.id AND t.name = :tag COLLATE NOCASE)`,
		favorite: `EXISTS (SELECT 1 FROM photo_tags pt JOIN tags t ON t.id = pt.tag_id WHERE pt.photo_id = p.id AND t.name = :favorite COLLATE NOCASE)`,
		camera: `(p.camera_model = :camera OR trim(coalesce(p.camera_make,'') || ' ' || coalesce(p.camera_model,'')) = :camera)`,
		lens: `p.lens = :lens`,
		location: `p.location = :location COLLATE NOCASE`,
		aperture: `p.aperture = :aperture`,
		shutter: `p.shutter_speed = :shutter`,
		focal: `p.focal_length = :focal`,
		iso: `p.iso = CAST(:iso AS INTEGER)`,
		analog: `p.analog = 1`,
		film: `p.film_stock = :film COLLATE NOCASE`,
		q: `(p.title LIKE :q OR p.description LIKE :q OR p.location LIKE :q)`
	};

	for (const [key, value] of Object.entries(filters)) {
		if (value && key in conditions) {
			where.push(conditions[key as keyof GalleryFilters]!);
			if (key === 'favorite') {
				params.favorite = FAVORITE_TAG;
			} else if (key === 'q') {
				params.q = `%${value}%`;
			} else if (key !== 'analog') {
				params[key] = value;
			}
		}
	}

	const albumPos = `(SELECT pa.position FROM photo_albums pa JOIN albums a ON a.id = pa.album_id WHERE pa.photo_id = p.id AND a.name = :album COLLATE NOCASE)`;
	const order = filters.album
		? `ORDER BY ${albumPos} IS NULL, ${albumPos}, coalesce(p.taken_at, p.uploaded_at) DESC`
		: `ORDER BY coalesce(p.taken_at, p.uploaded_at) DESC, p.uploaded_at DESC`;
	const sql = `${SELECT_PHOTO} ${where.length ? `WHERE ${where.join(' AND ')}` : ''} ${order}`;

	return (db.prepare(sql).all(params) as PhotoRow[]).map(rowToPhoto);
}

export function getAlbumsWithCounts(): { name: string; count: number }[] {
	return db.prepare(`
		SELECT a.name, count(pa.photo_id) AS count
		FROM albums a JOIN photo_albums pa ON pa.album_id = a.id
		GROUP BY a.id ORDER BY a.name
	`).all() as { name: string; count: number }[];
}

export function similarPhotos(photo: Photo, limit = 6): Photo[] {
	const sql = `
		${SELECT_PHOTO}
		WHERE p.id != :id
		ORDER BY
			(SELECT count(*) FROM photo_albums pa WHERE pa.photo_id = p.id AND pa.album_id IN
				(SELECT album_id FROM photo_albums WHERE photo_id = :id)) DESC,
			(SELECT count(*) FROM photo_tags pt WHERE pt.photo_id = p.id AND pt.tag_id IN
				(SELECT tag_id FROM photo_tags WHERE photo_id = :id)) DESC,
			abs(julianday(coalesce(p.taken_at, p.uploaded_at)) - julianday(:date)) ASC
		LIMIT :limit
	`;
	const rows = db.prepare(sql).all({
		id: photo.id,
		date: photo.takenAt ?? photo.uploadedAt,
		limit
	}) as PhotoRow[];
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

export function getFilterOptions(): FilterOptions {
	const names = (sql: string) => (db.prepare(sql).all() as { n: string }[]).map((r) => r.n);
	return {
		albums: names(`SELECT a.name n FROM albums a WHERE EXISTS (SELECT 1 FROM photo_albums pa WHERE pa.album_id = a.id) ORDER BY a.name`),
		tags: names(`SELECT t.name n FROM tags t WHERE EXISTS (SELECT 1 FROM photo_tags pt WHERE pt.tag_id = t.id) AND t.name <> '${FAVORITE_TAG}' COLLATE NOCASE ORDER BY t.name`),
		cameras: names(`SELECT DISTINCT camera_model n FROM photos WHERE camera_model IS NOT NULL ORDER BY 1`),
		lenses: names(`SELECT DISTINCT lens n FROM photos WHERE lens IS NOT NULL ORDER BY 1`),
		locations: names(`SELECT DISTINCT location n FROM photos WHERE location IS NOT NULL ORDER BY 1`),
		filmStocks: names(`SELECT DISTINCT film_stock n FROM photos WHERE analog = 1 AND film_stock IS NOT NULL AND film_stock <> '' ORDER BY 1`),
		hasAnalog: !!db.prepare(`SELECT 1 FROM photos WHERE analog = 1 LIMIT 1`).get()
	};
}

export function getAlbumPhotos(album: string): Photo[] {
	const sql = `
		${SELECT_PHOTO}
		JOIN photo_albums pa ON pa.photo_id = p.id
		JOIN albums a ON a.id = pa.album_id
		WHERE a.name = :album COLLATE NOCASE
		ORDER BY pa.position IS NULL, pa.position, coalesce(p.taken_at, p.uploaded_at) DESC
	`;
	const rows = db.prepare(sql).all({ album }) as PhotoRow[];
	return rows.map(rowToPhoto);
}

/**
 * Prev/next navigation for a photo within an arbitrary *filtered* gallery view
 * (the same set and order the visitor was browsing). Returns `null` when the
 * photo isn't part of the set or the set is trivial. `strip` is a stable
 * four-frame window — ideally the previous frame, the current one, and the next
 * two — clamped at the ends so it never collapses regardless of position.
 */
export function filteredNeighbors(
	filters: GalleryFilters,
	photoId: string
): { prev: Photo | null; next: Photo | null; index: number; total: number; strip: Photo[] } | null {
	const photos = listPhotos(filters);
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

export function albumNeighbors(album: string, photoId: string): { prev: Photo | null; next: Photo | null; index: number; total: number } {
	const photos = getAlbumPhotos(album);
	const i = photos.findIndex((p) => p.id === photoId);
	if (i < 0) return { prev: null, next: null, index: -1, total: photos.length };
	return {
		prev: i > 0 ? photos[i - 1] : null,
		next: i < photos.length - 1 ? photos[i + 1] : null,
		index: i,
		total: photos.length
	};
}
