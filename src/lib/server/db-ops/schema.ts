import type { Executor } from './connection';

/**
 * Creates the Postgres schema if it doesn't exist. Runs once on first connection
 * (idempotent). Case-insensitive uniqueness for tag/album names is enforced with
 * a functional unique index on `lower(name)` rather than a collation/extension,
 * so it behaves identically on PGlite and Neon.
 *
 * This mirrors the live Neon `public` schema exactly (as of the June 2026
 * reshape: slugs, jsonb palette/settings, proper timestamp columns, is_test
 * fixtures flag, is_analog rename, film_stock as a single free-text field).
 * Every statement here is a plain `IF NOT EXISTS`, so against an already-shaped
 * database (Neon) they are no-ops — this file only ever *creates*, never alters.
 */
export async function createSchema(exec: Executor): Promise<void> {
	await exec.query(`
		CREATE TABLE IF NOT EXISTS photos (
			id TEXT PRIMARY KEY,
			slug TEXT NOT NULL,
			title TEXT NOT NULL,
			description TEXT,
			location TEXT,
			width INTEGER NOT NULL,
			height INTEGER NOT NULL,
			taken_at TIMESTAMP,
			camera_make TEXT, camera_model TEXT, lens TEXT,
			aperture TEXT, shutter_speed TEXT, focal_length TEXT, iso INTEGER,
			is_analog BOOLEAN NOT NULL DEFAULT false,
			film_stock TEXT,
			title_color TEXT NOT NULL DEFAULT '#ffffff',
			palette JSONB NOT NULL DEFAULT '[]'::jsonb,
			blur_data TEXT NOT NULL DEFAULT '',
			original_ext TEXT NOT NULL DEFAULT 'jpg',
			is_test BOOLEAN NOT NULL DEFAULT false,
			created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
			updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
		)
	`);
	await exec.query(`CREATE UNIQUE INDEX IF NOT EXISTS photos_slug_key ON photos (slug)`);
	await exec.query(`CREATE UNIQUE INDEX IF NOT EXISTS photos_title_lower_key ON photos (lower(title))`);
	await exec.query(
		`CREATE INDEX IF NOT EXISTS photos_taken_at_idx ON photos (taken_at DESC NULLS LAST, id)`
	);

	await exec.query(`
		CREATE TABLE IF NOT EXISTS tags (
			id SERIAL PRIMARY KEY,
			slug TEXT NOT NULL,
			name TEXT NOT NULL
		)
	`);
	await exec.query(`CREATE UNIQUE INDEX IF NOT EXISTS idx_tags_name ON tags (lower(name))`);
	await exec.query(`CREATE UNIQUE INDEX IF NOT EXISTS tags_slug_key ON tags (slug)`);

	await exec.query(`
		CREATE TABLE IF NOT EXISTS photo_tags (
			photo_id TEXT NOT NULL REFERENCES photos(id) ON DELETE CASCADE,
			tag_id INTEGER NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
			PRIMARY KEY (photo_id, tag_id)
		)
	`);
	await exec.query(`CREATE INDEX IF NOT EXISTS photo_tags_tag_idx ON photo_tags (tag_id)`);

	await exec.query(`
		CREATE TABLE IF NOT EXISTS albums (
			id SERIAL PRIMARY KEY,
			slug TEXT NOT NULL,
			name TEXT NOT NULL,
			sort_order INTEGER NOT NULL DEFAULT 0,
			cover_photo_id TEXT REFERENCES photos(id) ON DELETE SET NULL
		)
	`);
	await exec.query(`CREATE UNIQUE INDEX IF NOT EXISTS idx_albums_name ON albums (lower(name))`);
	await exec.query(`CREATE UNIQUE INDEX IF NOT EXISTS albums_slug_key ON albums (slug)`);

	await exec.query(`
		CREATE TABLE IF NOT EXISTS photo_albums (
			photo_id TEXT NOT NULL REFERENCES photos(id) ON DELETE CASCADE,
			album_id INTEGER NOT NULL REFERENCES albums(id) ON DELETE CASCADE,
			position INTEGER NOT NULL DEFAULT 0,
			PRIMARY KEY (photo_id, album_id)
		)
	`);
	await exec.query(
		`CREATE INDEX IF NOT EXISTS photo_albums_album_idx ON photo_albums (album_id, position)`
	);

	await exec.query(`
		CREATE TABLE IF NOT EXISTS settings (
			key TEXT PRIMARY KEY,
			value JSONB NOT NULL
		)
	`);

	// Passkeys (WebAuthn) — public-key credentials enrolled from the admin panel.
	await exec.query(`
		CREATE TABLE IF NOT EXISTS webauthn_credentials (
			id TEXT PRIMARY KEY,
			public_key TEXT NOT NULL,
			counter BIGINT NOT NULL DEFAULT 0,
			transports TEXT,
			label TEXT,
			created_at TEXT NOT NULL DEFAULT to_char(now() AT TIME ZONE 'utc', 'YYYY-MM-DD"T"HH24:MI:SS"Z"')
		)
	`);

	// Daily rollups for lightweight site analytics (page views etc). Not yet
	// written to by the app — created here so the schema matches production.
	await exec.query(`
		CREATE TABLE IF NOT EXISTS analytics_daily (
			day DATE NOT NULL,
			metric TEXT NOT NULL,
			key TEXT NOT NULL DEFAULT '',
			count INTEGER NOT NULL DEFAULT 0,
			PRIMARY KEY (day, metric, key)
		)
	`);
}
