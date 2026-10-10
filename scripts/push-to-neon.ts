/**
 * Copy the current local PGlite database (data/pg) into the target set by
 * DATABASE_URL (Neon). PGlite is the source of truth for local admin work, so
 * this pushes the latest state — including edits made locally — up to prod.
 *
 *   DATABASE_URL=… npm run push-to-neon
 *
 * Re-runnable (ON CONFLICT DO NOTHING). Stop the dev server first so PGlite
 * isn't locked by another process.
 */
import path from 'node:path';
import { PGlite } from '@electric-sql/pglite';
import { query } from '../src/lib/server/db-ops/connection';

if (!process.env.DATABASE_URL) {
	console.error('Set DATABASE_URL to the Neon target. Aborting.');
	process.exit(1);
}

async function main() {
	const src = new PGlite(path.join(process.cwd(), 'data', 'pg'));
	await src.waitReady;

	// touch the target (Neon) so its schema is created before we insert
	await query('SELECT 1');

	const get = async (sql: string) => (await src.query(sql)).rows as Record<string, unknown>[];
	const photos = await get('SELECT * FROM photos');
	const tags = await get('SELECT id, name, slug FROM tags');
	const albums = await get('SELECT id, name, slug, sort_order, cover_photo_id FROM albums');
	const photoTags = await get('SELECT photo_id, tag_id FROM photo_tags');
	const photoAlbums = await get('SELECT photo_id, album_id, position FROM photo_albums');
	const settings = await get('SELECT key, value FROM settings');

	const cols = [
		'id', 'slug', 'title', 'description', 'location', 'width', 'height', 'title_color',
		'palette', 'blur_data', 'original_ext', 'camera_make', 'camera_model', 'lens', 'aperture',
		'shutter_speed', 'focal_length', 'iso', 'taken_at', 'is_analog', 'film_stock', 'is_test',
		'created_at', 'updated_at'
	];
	for (const p of photos) {
		const placeholders = cols
			.map((c, i) => (c === 'palette' ? `$${i + 1}::jsonb` : `$${i + 1}`))
			.join(', ');
		await query(
			`INSERT INTO photos (${cols.join(', ')}) VALUES (${placeholders}) ON CONFLICT (id) DO NOTHING`,
			cols.map((c) => (c === 'palette' ? JSON.stringify(p[c] ?? []) : (p[c] ?? null)))
		);
	}
	// albums must exist before photos.cover_photo_id can be backfilled, so insert
	// with cover_photo_id null first, then patch it once photos are in place.
	for (const t of tags) {
		await query(`INSERT INTO tags (id, name, slug) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING`, [
			t.id,
			t.name,
			t.slug
		]);
	}
	for (const a of albums) {
		await query(
			`INSERT INTO albums (id, name, slug, sort_order) VALUES ($1, $2, $3, $4) ON CONFLICT DO NOTHING`,
			[a.id, a.name, a.slug, a.sort_order ?? 0]
		);
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
			[pa.photo_id, pa.album_id, pa.position ?? 0]
		);
	}
	for (const a of albums) {
		if (a.cover_photo_id) {
			await query(`UPDATE albums SET cover_photo_id = $1 WHERE id = $2`, [a.cover_photo_id, a.id]);
		}
	}
	for (const s of settings) {
		await query(
			`INSERT INTO settings (key, value) VALUES ($1, $2::jsonb) ON CONFLICT (key) DO UPDATE SET value = excluded.value`,
			[s.key, JSON.stringify(s.value)]
		);
	}
	if (tags.length) await query(`SELECT setval(pg_get_serial_sequence('tags','id'), (SELECT max(id) FROM tags))`);
	if (albums.length) await query(`SELECT setval(pg_get_serial_sequence('albums','id'), (SELECT max(id) FROM albums))`);

	await src.close();
	console.log(
		`Pushed ${photos.length} photos, ${tags.length} tags, ${albums.length} albums, ` +
			`${photoTags.length} photo-tags, ${photoAlbums.length} photo-albums, ${settings.length} settings to Neon.`
	);
	process.exit(0);
}

main().catch((err) => {
	console.error('push-to-neon failed:', err);
	process.exit(1);
});
