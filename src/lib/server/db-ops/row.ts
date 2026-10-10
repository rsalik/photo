import type { Photo } from '../../types';

export interface PhotoRow {
	id: string;
	slug: string;
	title: string;
	description: string | null;
	location: string | null;
	width: number;
	height: number;
	title_color: string;
	palette: string[];
	blur_data: string;
	original_ext: string;
	camera_make: string | null;
	camera_model: string | null;
	lens: string | null;
	aperture: string | null;
	shutter_speed: string | null;
	focal_length: string | null;
	iso: number | null;
	taken_at: string | Date | null;
	is_analog: boolean;
	film_stock: string | null;
	created_at: string | Date;
	tags: string | null;
	albums: string | null;
}

const toIso = (v: string | Date) => (v instanceof Date ? v : new Date(v)).toISOString();

export function rowToPhoto(row: PhotoRow): Photo {
	return {
		id: row.id,
		slug: row.slug,
		title: row.title,
		description: row.description,
		location: row.location,
		width: row.width,
		height: row.height,
		titleColor: row.title_color,
		palette: row.palette,
		blurData: row.blur_data,
		cameraMake: row.camera_make,
		cameraModel: row.camera_model,
		lens: row.lens,
		aperture: row.aperture,
		shutterSpeed: row.shutter_speed,
		focalLength: row.focal_length,
		iso: row.iso,
		takenAt: row.taken_at ? toIso(row.taken_at) : null,
		analog: row.is_analog,
		filmStock: row.film_stock,
		uploadedAt: toIso(row.created_at),
		tags: row.tags ? row.tags.split('\u0001') : [],
		albums: row.albums ? row.albums.split('\u0001') : []
	};
}

export const SELECT_PHOTO = `
	SELECT p.*,
		(SELECT string_agg(t.name, chr(1) ORDER BY t.name) FROM photo_tags pt JOIN tags t ON t.id = pt.tag_id
			WHERE pt.photo_id = p.id) AS tags,
		(SELECT string_agg(a.name, chr(1) ORDER BY a.name) FROM photo_albums pa JOIN albums a ON a.id = pa.album_id
			WHERE pa.photo_id = p.id) AS albums
	FROM photos p
`;
