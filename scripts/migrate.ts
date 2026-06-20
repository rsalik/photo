/**
 * One-time migration: copy the legacy SQLite database (data/photos.db) into the
 * Postgres target (PGlite locally, or Neon when DATABASE_URL is set).
 *
 *   npm run migrate              # → local PGlite (data/pg)
 *   DATABASE_URL=… npm run migrate   # → Neon
 *
 * Re-runnable: rows already present are left alone (ON CONFLICT DO NOTHING).
 * Image files are handled separately (they already live on disk for local dev;
 * use `npm run migrate:images` to push them to R2 — see scripts/migrate-images.ts).
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import Database from 'better-sqlite3';
import { query } from '../src/lib/server/db-ops/connection';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SQLITE = process.env.SQLITE_PATH ?? path.join(root, 'data', 'photos.db');

async function main() {
	const src = new Database(SQLITE, { readonly: true, fileMustExist: true });

	// Touch the target so the schema is created before we insert.
	await query('SELECT 1');

	const photos = src.prepare('SELECT * FROM photos').all() as Record<string, unknown>[];
	const tags = src.prepare('SELECT id, name FROM tags').all() as { id: number; name: string }[];
	const albums = src.prepare('SELECT id, name FROM albums').all() as { id: number; name: string }[];
	const photoTags = src
		.prepare('SELECT photo_id, tag_id FROM photo_tags')
		.all() as { photo_id: string; tag_id: number }[];
	const photoAlbums = src
		.prepare('SELECT photo_id, album_id, position FROM photo_albums')
		.all() as { photo_id: string; album_id: number; position: number | null }[];
	const settings = src.prepare('SELECT key, value FROM settings').all() as {
		key: string;
		value: string;
	}[];

	const cols = [
		'id', 'title', 'description', 'location', 'width', 'height', 'title_color', 'palette',
		'blur_data', 'original_ext', 'camera_make', 'camera_model', 'lens', 'aperture',
		'shutter_speed', 'focal_length', 'iso', 'taken_at', 'analog', 'film_stock', 'film_iso',
		'film_format', 'uploaded_at'
	];
	for (const p of photos) {
		const placeholders = cols.map((_, i) => `$${i + 1}`).join(', ');
		await query(
			`INSERT INTO photos (${cols.join(', ')}) VALUES (${placeholders}) ON CONFLICT (id) DO NOTHING`,
			cols.map((c) => p[c] ?? null)
		);
	}

	// Preserve tag/album ids so the join tables' foreign keys line up unchanged.
	for (const t of tags) {
		await query(`INSERT INTO tags (id, name) VALUES ($1, $2) ON CONFLICT DO NOTHING`, [t.id, t.name]);
	}
	for (const a of albums) {
		await query(`INSERT INTO albums (id, name) VALUES ($1, $2) ON CONFLICT DO NOTHING`, [a.id, a.name]);
	}
	for (const pt of photoTags) {
		await query(`INSERT INTO photo_tags (photo_id, tag_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`, [
			pt.photo_id,
			pt.tag_id
		]);
	}
	for (const pa of photoAlbums) {
		await query(
			`INSERT INTO photo_albums (photo_id, album_id, position) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING`,
			[pa.photo_id, pa.album_id, pa.position]
		);
	}
	for (const s of settings) {
		await query(
			`INSERT INTO settings (key, value) VALUES ($1, $2) ON CONFLICT (key) DO UPDATE SET value = excluded.value`,
			[s.key, s.value]
		);
	}

	// Re-sync the SERIAL sequences past the highest id we inserted.
	if (tags.length) await query(`SELECT setval(pg_get_serial_sequence('tags','id'), (SELECT max(id) FROM tags))`);
	if (albums.length) await query(`SELECT setval(pg_get_serial_sequence('albums','id'), (SELECT max(id) FROM albums))`);

	src.close();
	console.log(
		`Migrated ${photos.length} photos, ${tags.length} tags, ${albums.length} albums, ` +
			`${photoTags.length} photo-tags, ${photoAlbums.length} photo-albums, ${settings.length} settings.`
	);
	process.exit(0);
}

main().catch((err) => {
	console.error('Migration failed:', err);
	process.exit(1);
});
