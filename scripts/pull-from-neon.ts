/**
 * Copy the live Neon database (public schema) down into the local PGlite store
 * (data/pg). Read-only against Neon — only ever writes to the local target.
 *
 *   DATABASE_URL=… npm run pull-from-neon
 *
 * Re-runnable (ON CONFLICT DO NOTHING). Stop the dev server first so PGlite
 * isn't locked by another process.
 */
import path from 'node:path';
import { neon } from '@neondatabase/serverless';
import { PGlite } from '@electric-sql/pglite';
import { createSchema } from '../src/lib/server/db-ops/schema';

if (!process.env.DATABASE_URL) {
	console.error('Set DATABASE_URL to the Neon source. Aborting.');
	process.exit(1);
}

async function main() {
	const sql = neon(process.env.DATABASE_URL!);
	const src = { query: async (text: string, params: unknown[] = []) => (await sql.query(text, params)) as Record<string, unknown>[] };

	const dest = new PGlite(path.join(process.cwd(), 'data', 'pg'));
	await dest.waitReady;
	const destExec = {
		query: async (text: string, params: unknown[] = []) => (await dest.query(text, params)).rows as Record<string, unknown>[]
	};
	await createSchema(destExec);

	const photos = await src.query('SELECT * FROM photos');
	const tags = await src.query('SELECT id, name, slug FROM tags');
	const albums = await src.query('SELECT id, name, slug, sort_order, cover_photo_id FROM albums');
	const photoTags = await src.query('SELECT photo_id, tag_id FROM photo_tags');
	const photoAlbums = await src.query('SELECT photo_id, album_id, position FROM photo_albums');
	const settings = await src.query('SELECT key, value FROM settings');

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
		await destExec.query(
			`INSERT INTO photos (${cols.join(', ')}) VALUES (${placeholders}) ON CONFLICT (id) DO NOTHING`,
			cols.map((c) => (c === 'palette' ? JSON.stringify(p[c] ?? []) : (p[c] ?? null)))
		);
	}
	for (const t of tags) {
		await destExec.query(`INSERT INTO tags (id, name, slug) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING`, [
			t.id,
			t.name,
			t.slug
		]);
	}
	for (const a of albums) {
		await destExec.query(
			`INSERT INTO albums (id, name, slug, sort_order) VALUES ($1, $2, $3, $4) ON CONFLICT DO NOTHING`,
			[a.id, a.name, a.slug, a.sort_order ?? 0]
		);
	}
	for (const pt of photoTags) {
		await destExec.query(`INSERT INTO photo_tags (photo_id, tag_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`, [
			pt.photo_id,
			pt.tag_id
		]);
	}
	for (const pa of photoAlbums) {
		await destExec.query(
			`INSERT INTO photo_albums (photo_id, album_id, position) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING`,
			[pa.photo_id, pa.album_id, pa.position ?? 0]
		);
	}
	for (const a of albums) {
		if (a.cover_photo_id) {
			await destExec.query(`UPDATE albums SET cover_photo_id = $1 WHERE id = $2`, [a.cover_photo_id, a.id]);
		}
	}
	for (const s of settings) {
		await destExec.query(
			`INSERT INTO settings (key, value) VALUES ($1, $2::jsonb) ON CONFLICT (key) DO UPDATE SET value = excluded.value`,
			[s.key, JSON.stringify(s.value)]
		);
	}
	if (tags.length) await destExec.query(`SELECT setval(pg_get_serial_sequence('tags','id'), (SELECT max(id) FROM tags))`);
	if (albums.length) await destExec.query(`SELECT setval(pg_get_serial_sequence('albums','id'), (SELECT max(id) FROM albums))`);

	await dest.close();
	console.log(
		`Pulled ${photos.length} photos, ${tags.length} tags, ${albums.length} albums, ` +
			`${photoTags.length} photo-tags, ${photoAlbums.length} photo-albums, ${settings.length} settings from Neon.`
	);
	process.exit(0);
}

main().catch((err) => {
	console.error('pull-from-neon failed:', err);
	process.exit(1);
});
