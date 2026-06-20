import fs from 'node:fs';
import path from 'node:path';
import { db, DERIVED_DIR, ORIGINALS_DIR } from './connection';

export interface NewPhoto {
	id: string;
	title: string;
	description?: string | null;
	location?: string | null;
	width: number;
	height: number;
	titleColor: string;
	palette: string[];
	blurData: string;
	originalExt: string;
	cameraMake?: string | null;
	cameraModel?: string | null;
	lens?: string | null;
	aperture?: string | null;
	shutterSpeed?: string | null;
	focalLength?: string | null;
	iso?: number | null;
	takenAt?: string | null;
	analog?: boolean;
	filmStock?: string | null;
	filmIso?: string | null;
	filmFormat?: string | null;
	tags?: string[];
	albums?: string[];
}

export function insertPhoto(p: NewPhoto): void {
	const insert = db.transaction(() => {
		db.prepare(`
			INSERT INTO photos (
				id, title, description, location, width, height, title_color,
				palette, blur_data, original_ext, camera_make, camera_model, lens, aperture,
				shutter_speed, focal_length, iso, taken_at, analog, film_stock, film_iso, film_format
			) VALUES (
				@id, @title, @description, @location, @width, @height, @titleColor,
				@palette, @blurData, @originalExt, @cameraMake, @cameraModel, @lens, @aperture,
				@shutterSpeed, @focalLength, @iso, @takenAt, @analog, @filmStock, @filmIso, @filmFormat
			)
		`).run({
			...p,
			description: p.description ?? null,
			location: p.location ?? null,
			cameraMake: p.cameraMake ?? null,
			cameraModel: p.cameraModel ?? null,
			lens: p.lens ?? null,
			aperture: p.aperture ?? null,
			shutterSpeed: p.shutterSpeed ?? null,
			focalLength: p.focalLength ?? null,
			iso: p.iso ?? null,
			takenAt: p.takenAt ?? null,
			analog: p.analog ? 1 : 0,
			filmStock: p.filmStock ?? null,
			filmIso: p.filmIso ?? null,
			filmFormat: p.filmFormat ?? null,
			palette: JSON.stringify(p.palette)
		});
		for (const tag of p.tags ?? []) addTag(p.id, tag);
		for (const album of p.albums ?? []) addToAlbum(p.id, album);
	});
	insert();
}

export function titleExists(title: string): boolean {
	return !!db.prepare(`SELECT 1 FROM photos WHERE title = ? COLLATE NOCASE`).get(title);
}

export function idExists(id: string): boolean {
	return !!db.prepare(`SELECT 1 FROM photos WHERE id = ?`).get(id);
}

const UPDATABLE = {
	title: 'title',
	description: 'description',
	location: 'location',
	titleColor: 'title_color',
	takenAt: 'taken_at',
	cameraMake: 'camera_make',
	cameraModel: 'camera_model',
	lens: 'lens',
	aperture: 'aperture',
	shutterSpeed: 'shutter_speed',
	focalLength: 'focal_length',
	filmStock: 'film_stock',
	filmIso: 'film_iso',
	filmFormat: 'film_format'
} as const;

export interface PhotoUpdate extends Partial<Record<keyof typeof UPDATABLE, string | null>> {
	analog?: boolean;
	iso?: number | null;
}

export function updatePhoto(id: string, fields: PhotoUpdate): void {
	const sets: string[] = [];
	const params: Record<string, string | number | null> = { id };
	for (const [key, col] of Object.entries(UPDATABLE)) {
		if (key in fields) {
			sets.push(`${col} = @${key}`);
			params[key] = fields[key as keyof typeof UPDATABLE] ?? null;
		}
	}
	if (fields.analog !== undefined) {
		sets.push(`analog = @analog`);
		params.analog = fields.analog ? 1 : 0;
	}
	if (sets.length) {
		db.prepare(`UPDATE photos SET ${sets.join(', ')} WHERE id = @id`).run(params);
	}
}

export function addTag(photoId: string, tag: string): void {
	const name = tag.trim();
	if (!name) return;
	db.prepare(`INSERT OR IGNORE INTO tags (name) VALUES (?)`).run(name);
	db.prepare(`
		INSERT OR IGNORE INTO photo_tags (photo_id, tag_id)
		SELECT ?, id FROM tags WHERE name = ? COLLATE NOCASE
	`).run(photoId, name);
}

export function removeTag(photoId: string, tag: string): void {
	db.prepare(`
		DELETE FROM photo_tags WHERE photo_id = ? AND tag_id IN
		(SELECT id FROM tags WHERE name = ? COLLATE NOCASE)
	`).run(photoId, tag.trim());
}

export function addToAlbum(photoId: string, album: string): void {
	const name = album.trim();
	if (!name) return;
	db.prepare(`INSERT OR IGNORE INTO albums (name) VALUES (?)`).run(name);
	db.prepare(`
		INSERT OR IGNORE INTO photo_albums (photo_id, album_id, position)
		SELECT ?, a.id,
			(SELECT coalesce(max(pa.position), -1) + 1 FROM photo_albums pa WHERE pa.album_id = a.id)
		FROM albums a WHERE a.name = ? COLLATE NOCASE
	`).run(photoId, name);
}

export function setAlbumOrder(album: string, photoIds: string[]): void {
	const albumId = (db.prepare(`SELECT id FROM albums WHERE name = ? COLLATE NOCASE`).get(album) as { id: number } | undefined)?.id;
	if (!albumId) return;
	const stmt = db.prepare(`UPDATE photo_albums SET position = @pos WHERE album_id = @albumId AND photo_id = @photoId`);
	const tx = db.transaction(() => {
		photoIds.forEach((photoId, pos) => stmt.run({ pos, albumId, photoId }));
	});
	tx();
}

export function removeFromAlbum(photoId: string, album: string): void {
	db.prepare(`
		DELETE FROM photo_albums WHERE photo_id = ? AND album_id IN
		(SELECT id FROM albums WHERE name = ? COLLATE NOCASE)
	`).run(photoId, album.trim());
}

export function deletePhoto(id: string): void {
	db.prepare(`DELETE FROM photos WHERE id = ?`).run(id);
	fs.rmSync(path.join(DERIVED_DIR, id), { recursive: true, force: true });
	for (const f of fs.readdirSync(ORIGINALS_DIR)) {
		if (f.startsWith(`${id}.`)) {
			fs.rmSync(path.join(ORIGINALS_DIR, f), { force: true });
		}
	}
}
