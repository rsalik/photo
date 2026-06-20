import Database from 'better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';

export const DATA_DIR = path.resolve(process.env.DATA_DIR ?? 'data');
export const ORIGINALS_DIR = path.join(DATA_DIR, 'originals');
export const DERIVED_DIR = path.join(DATA_DIR, 'derived');

for (const dir of [DATA_DIR, ORIGINALS_DIR, DERIVED_DIR]) {
	fs.mkdirSync(dir, { recursive: true });
}

export const db = new Database(path.join(DATA_DIR, 'photos.db'));
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

export const bulk = db.transaction.bind(db);
