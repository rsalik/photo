import { query } from './connection';
import { rowToPhoto, SELECT_PHOTO, type PhotoRow } from './row';
import { cameraLabel } from '../../camera';
import { FAVORITE_TAG, type FilterOptions, type GalleryFilters, type Photo } from '../../types';

export type { FilterOptions };

/** A distinct camera/lens/focal combination seen in the library, for the admin
 *  EXIF autocomplete: which lenses go with which camera, and each lens's focal. */
export interface GearProfile {
	camera: string;
	lens: string | null;
	focal: string | null;
}

export async function getGearProfiles(): Promise<GearProfile[]> {
	const rows = await query<{
		camera_make: string | null;
		camera_model: string | null;
		lens: string | null;
		focal_length: string | null;
	}>(
		`SELECT DISTINCT camera_make, camera_model, lens, focal_length FROM photos
		 WHERE camera_model IS NOT NULL OR lens IS NOT NULL`
	);
	return rows.map((r) => ({
		camera: cameraLabel(r.camera_make, r.camera_model),
		lens: r.lens,
		focal: r.focal_length
	}));
}

/** Resolve a photo by its public slug (the admin-given name) or, for back-compat
 *  with older/hash ids, by its stable internal id. Public lookups exclude QA
 *  fixtures by default; admin code must opt in explicitly. */
export async function getPhoto(idOrSlug: string, opts: ListOptions = {}): Promise<Photo | null> {
	const rows = await query<PhotoRow>(
		`${SELECT_PHOTO} WHERE (p.slug = $1 OR p.id = $1)
		 ${opts.includeTest ? '' : 'AND p.is_test = false'}
		 ORDER BY (p.slug = $1) DESC LIMIT 1`,
		[idOrSlug]
	);
	return rows[0] ? rowToPhoto(rows[0]) : null;
}

/** Strict stable-identity lookup for admin/API/storage paths. */
export async function getPhotoById(id: string, opts: ListOptions = {}): Promise<Photo | null> {
	const rows = await query<PhotoRow>(
		`${SELECT_PHOTO} WHERE p.id = $1 ${opts.includeTest ? '' : 'AND p.is_test = false'} LIMIT 1`,
		[id]
	);
	return rows[0] ? rowToPhoto(rows[0]) : null;
}

/** Strict canonical public-URL lookup. */
export async function getPhotoBySlug(slug: string, opts: ListOptions = {}): Promise<Photo | null> {
	const rows = await query<PhotoRow>(
		`${SELECT_PHOTO} WHERE p.slug = $1 ${opts.includeTest ? '' : 'AND p.is_test = false'} LIMIT 1`,
		[slug]
	);
	return rows[0] ? rowToPhoto(rows[0]) : null;
}

export interface ListOptions {
	/** Admin views need to see (and manage) seed/QA fixtures too. */
	includeTest?: boolean;
	/** Optional server-side cap for lightweight search/preview consumers. */
	limit?: number;
}

/** The numeric prefix of the focal_length text ("35mm" → 35), as SQL. Defensive
 *  about hand-entered variants; NULL (excluded by comparisons) when no digits. */
const FOCAL_NUMERIC = `nullif(substring(p.focal_length from '^\\d+\\.?\\d*'), '')::numeric`;

/** Shared filters and ordering keep previews and gallery results in sync. */
function photoQuery(
	filters: GalleryFilters = {},
	opts: ListOptions = {},
	select = SELECT_PHOTO
): { sql: string; params: unknown[] } {
	const params: unknown[] = [];
	const ph = (v: unknown) => {
		params.push(v);
		return `$${params.length}`;
	};
	const where: string[] = [];
	if (!opts.includeTest) where.push(`p.is_test = false`);

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
	// Range bounds compare the numeric prefix of the stored text ("35mm" → 35);
	// photos without a focal length fall outside any range, as expected.
	if (filters.focalMin) where.push(`${FOCAL_NUMERIC} >= ${ph(filters.focalMin)}::numeric`);
	if (filters.focalMax) where.push(`${FOCAL_NUMERIC} <= ${ph(filters.focalMax)}::numeric`);
	if (filters.iso) where.push(`p.iso = ${ph(filters.iso)}::integer`);
	if (filters.analog) where.push(`p.is_analog = true`);
	if (filters.film) where.push(`lower(p.film_stock) = lower(${ph(filters.film)})`);
	if (filters.q) {
		// Search is literal text; SQL's wildcard characters are not search syntax.
		const q = ph(`%${filters.q.replace(/[\\%_]/g, '\\$&')}%`);
		where.push(`(p.title ILIKE ${q} OR p.description ILIKE ${q} OR p.location ILIKE ${q})`);
	}

	const albumPos = albumPh
		? `(SELECT pa.position FROM photo_albums pa JOIN albums a ON a.id = pa.album_id
			WHERE pa.photo_id = p.id AND lower(a.name) = lower(${albumPh}))`
		: null;
	// Chronology uses the full capture timestamp (to the second); `p.id` makes
	// ties deterministic so pagination and prev/next never see the set reshuffle.
	const order = albumPos
		? `ORDER BY ${albumPos} IS NULL, ${albumPos}, coalesce(p.taken_at, p.created_at) DESC, p.id`
		: `ORDER BY coalesce(p.taken_at, p.created_at) DESC, p.created_at DESC, p.id`;

	const limit = opts.limit
		? `LIMIT ${ph(Math.min(500, Math.max(1, Math.trunc(opts.limit))))}`
		: '';
	const sql = `${select} ${where.length ? `WHERE ${where.join(' AND ')}` : ''} ${order} ${limit}`;
	return { sql, params };
}

export async function listPhotos(
	filters: GalleryFilters = {},
	opts: ListOptions = {}
): Promise<Photo[]> {
	const { sql, params } = photoQuery(filters, opts);
	const rows = await query<PhotoRow>(sql, params);
	return rows.map(rowToPhoto);
}

/** Count the full matching set, returning only the six preview thumbnails. */
export async function filterPreview(filters: GalleryFilters = {}): Promise<{
	count: number;
	photos: Pick<Photo, 'id' | 'width' | 'height' | 'blurData'>[];
}> {
	const { sql, params } = photoQuery(
		filters,
		{ limit: 6 },
		`SELECT p.id, p.width, p.height, p.blur_data, count(*) OVER ()::int AS total FROM photos p`
	);
	const rows = await query<{
		id: string;
		width: number;
		height: number;
		blur_data: string;
		total: number;
	}>(sql, params);
	return {
		count: rows[0]?.total ?? 0,
		photos: rows.map((row) => ({
			id: row.id,
			width: row.width,
			height: row.height,
			blurData: row.blur_data
		}))
	};
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
		WHERE p.id != $1 AND p.is_test = false
		ORDER BY
			(SELECT count(*) FROM photo_albums pa WHERE pa.photo_id = p.id AND pa.album_id IN
				(SELECT album_id FROM photo_albums WHERE photo_id = $1)) DESC,
			(SELECT count(*) FROM photo_tags pt WHERE pt.photo_id = p.id AND pt.tag_id IN
				(SELECT tag_id FROM photo_tags WHERE photo_id = $1)) DESC,
			abs(extract(epoch FROM (coalesce(p.taken_at, p.created_at)::timestamptz - $2::timestamptz))) ASC
		LIMIT $3
	`;
	const rows = await query<PhotoRow>(sql, [photo.id, photo.takenAt ?? photo.uploadedAt, limit]);
	return rows.map(rowToPhoto);
}

export async function getFilterOptions(opts: ListOptions = {}): Promise<FilterOptions> {
	const names = async (sql: string, params: unknown[] = []) =>
		(await query<{ n: string }>(sql, params)).map((r) => r.n);
	const testClause = opts.includeTest ? '' : 'AND is_test = false';
	const [albums, tags, cameras, lenses, locations, filmStocks, analog, focal] = await Promise.all(
		[
			names(
				`SELECT a.name n FROM albums a WHERE EXISTS (SELECT 1 FROM photo_albums pa JOIN photos p ON p.id = pa.photo_id WHERE pa.album_id = a.id ${opts.includeTest ? '' : 'AND p.is_test = false'}) ORDER BY a.name`
			),
			names(
				`SELECT t.name n FROM tags t WHERE EXISTS (SELECT 1 FROM photo_tags pt JOIN photos p ON p.id = pt.photo_id WHERE pt.tag_id = t.id ${opts.includeTest ? '' : 'AND p.is_test = false'}) AND lower(t.name) <> lower($1) ORDER BY t.name`,
				[FAVORITE_TAG]
			),
			names(
				`SELECT DISTINCT camera_model n FROM photos WHERE camera_model IS NOT NULL ${testClause} ORDER BY 1`
			),
			names(
				`SELECT DISTINCT lens n FROM photos WHERE lens IS NOT NULL ${testClause} ORDER BY 1`
			),
			names(
				`SELECT DISTINCT location n FROM photos WHERE location IS NOT NULL ${testClause} ORDER BY 1`
			),
			names(
				`SELECT DISTINCT film_stock n FROM photos WHERE is_analog = true AND film_stock IS NOT NULL AND film_stock <> '' ${testClause} ORDER BY 1`
			),
			query(`SELECT 1 FROM photos WHERE is_analog = true ${testClause} LIMIT 1`),
			query<{ min: number | null; max: number | null }>(
				`SELECT min(${FOCAL_NUMERIC})::float AS min, max(${FOCAL_NUMERIC})::float AS max
			 FROM photos p WHERE p.focal_length IS NOT NULL ${testClause.replace('is_test', 'p.is_test')}`
			)
		]
	);
	const f = focal[0];
	return {
		albums,
		tags,
		cameras,
		lenses,
		locations,
		filmStocks,
		hasAnalog: analog.length > 0,
		focalRange: f?.min != null && f?.max != null ? { min: f.min, max: f.max } : null
	};
}

export async function getAlbumPhotos(album: string, opts: ListOptions = {}): Promise<Photo[]> {
	const sql = `
		${SELECT_PHOTO}
		JOIN photo_albums pa ON pa.photo_id = p.id
		JOIN albums a ON a.id = pa.album_id
		WHERE lower(a.name) = lower($1) ${opts.includeTest ? '' : 'AND p.is_test = false'}
		ORDER BY pa.position IS NULL, pa.position, coalesce(p.taken_at, p.created_at) DESC, p.id
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
): Promise<{
	prev: Photo | null;
	next: Photo | null;
	index: number;
	total: number;
	strip: Photo[];
} | null> {
	const photos = await listPhotos(filters);
	const i = photos.findIndex((p) => p.id === photoId);
	if (i < 0) return null;

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
