import { db } from './connection';

/**
 * Initializes the database schema and performs necessary migrations.
 */
export function initSchema() {
	db.exec(`
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
			uploaded_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now'))
		);
		CREATE TABLE IF NOT EXISTS tags (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			name TEXT NOT NULL UNIQUE COLLATE NOCASE
		);
		CREATE TABLE IF NOT EXISTS photo_tags (
			photo_id TEXT NOT NULL REFERENCES photos(id) ON DELETE CASCADE,
			tag_id INTEGER NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
			PRIMARY KEY (photo_id, tag_id)
		);
		CREATE TABLE IF NOT EXISTS albums (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			name TEXT NOT NULL UNIQUE COLLATE NOCASE
		);
		CREATE TABLE IF NOT EXISTS photo_albums (
			photo_id TEXT NOT NULL REFERENCES photos(id) ON DELETE CASCADE,
			album_id INTEGER NOT NULL REFERENCES albums(id) ON DELETE CASCADE,
			position INTEGER,
			PRIMARY KEY (photo_id, album_id)
		);
		CREATE TABLE IF NOT EXISTS settings (
			key TEXT PRIMARY KEY,
			value TEXT NOT NULL
		);
		CREATE INDEX IF NOT EXISTS idx_photos_taken ON photos (coalesce(taken_at, uploaded_at) DESC);
	`);

	// Migrate older databases that predate analog/film columns or album positioning.
	const cols = new Set(
		(db.prepare(`PRAGMA table_info(photos)`).all() as { name: string }[]).map((c) => c.name)
	);

	const addCol = (name: string, def: string) => {
		if (!cols.has(name)) db.exec(`ALTER TABLE photos ADD COLUMN ${name} ${def}`);
	};

	addCol('analog', 'INTEGER NOT NULL DEFAULT 0');
	addCol('film_stock', 'TEXT');
	addCol('film_iso', 'TEXT');
	addCol('film_format', 'TEXT');

	const paCols = new Set(
		(db.prepare(`PRAGMA table_info(photo_albums)`).all() as { name: string }[]).map((c) => c.name)
	);
	if (!paCols.has('position')) {
		db.exec(`ALTER TABLE photo_albums ADD COLUMN position INTEGER`);
	}
}
