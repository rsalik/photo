import type { Executor } from './connection';

/**
 * Creates the Postgres schema if it doesn't exist. Runs once on first connection
 * (idempotent). Case-insensitive uniqueness for tag/album names is enforced with
 * a functional unique index on `lower(name)` rather than a collation/extension,
 * so it behaves identically on PGlite and Neon.
 */
export async function createSchema(exec: Executor): Promise<void> {
	await exec.query(`
		CREATE TABLE IF NOT EXISTS photos (
			id TEXT PRIMARY KEY,
			title TEXT NOT NULL UNIQUE,
			description TEXT,
			location TEXT,
			width INTEGER NOT NULL,
			height INTEGER NOT NULL,
			title_color TEXT NOT NULL DEFAULT '#ffffff',
			palette TEXT NOT NULL DEFAULT '[]',
			blur_data TEXT NOT NULL DEFAULT '',
			original_ext TEXT NOT NULL DEFAULT 'jpg',
			camera_make TEXT, camera_model TEXT, lens TEXT,
			aperture TEXT, shutter_speed TEXT, focal_length TEXT, iso INTEGER,
			taken_at TEXT,
			analog INTEGER NOT NULL DEFAULT 0,
			film_stock TEXT, film_iso TEXT, film_format TEXT,
			uploaded_at TEXT NOT NULL DEFAULT to_char(now() AT TIME ZONE 'utc', 'YYYY-MM-DD"T"HH24:MI:SS"Z"')
		)
	`);

	await exec.query(`
		CREATE TABLE IF NOT EXISTS tags (
			id SERIAL PRIMARY KEY,
			name TEXT NOT NULL
		)
	`);
	await exec.query(`CREATE UNIQUE INDEX IF NOT EXISTS idx_tags_name ON tags (lower(name))`);

	await exec.query(`
		CREATE TABLE IF NOT EXISTS photo_tags (
			photo_id TEXT NOT NULL REFERENCES photos(id) ON DELETE CASCADE,
			tag_id INTEGER NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
			PRIMARY KEY (photo_id, tag_id)
		)
	`);

	await exec.query(`
		CREATE TABLE IF NOT EXISTS albums (
			id SERIAL PRIMARY KEY,
			name TEXT NOT NULL
		)
	`);
	await exec.query(`CREATE UNIQUE INDEX IF NOT EXISTS idx_albums_name ON albums (lower(name))`);

	await exec.query(`
		CREATE TABLE IF NOT EXISTS photo_albums (
			photo_id TEXT NOT NULL REFERENCES photos(id) ON DELETE CASCADE,
			album_id INTEGER NOT NULL REFERENCES albums(id) ON DELETE CASCADE,
			position INTEGER,
			PRIMARY KEY (photo_id, album_id)
		)
	`);

	await exec.query(`
		CREATE TABLE IF NOT EXISTS settings (
			key TEXT PRIMARY KEY,
			value TEXT NOT NULL
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

	await exec.query(
		`CREATE INDEX IF NOT EXISTS idx_photos_taken ON photos (coalesce(taken_at, uploaded_at) DESC)`
	);
}
