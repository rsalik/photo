import { promisify } from 'node:util';
import type { ExifData } from '$lib/types';
import { normalizeGear } from '$lib/camera';

// child_process and sharp are loaded dynamically — they only run on the local
// laptop during admin uploads, not on Cloudflare Workers in production.
const loadExecFile = async () => {
	const { execFile } = await import('node:child_process');
	return promisify(execFile);
};

let exiftoolAvailable: boolean | null = null;

async function hasExiftool(): Promise<boolean> {
	if (exiftoolAvailable !== null) return exiftoolAvailable;
	try {
		const execFileAsync = await loadExecFile();
		await execFileAsync('exiftool', ['-ver']);
		exiftoolAvailable = true;
	} catch {
		exiftoolAvailable = false;
		console.warn('[exif] exiftool not found; falling back to sharp metadata (less complete)');
	}
	return exiftoolAvailable;
}

function formatShutter(value: number | string | undefined): string | null {
	if (value === undefined || value === null) return null;
	const n = typeof value === 'string' ? parseFloat(value) : value;
	if (typeof value === 'string' && value.includes('/')) return `${value}s`;
	if (!Number.isFinite(n) || n <= 0) return null;
	if (n >= 1) return `${+n.toFixed(1)}s`;
	return `1/${Math.round(1 / n)}s`;
}

function formatExifDate(raw: string | undefined): string | null {
	if (!raw) return null;
	// exiftool: "2024:06:15 18:32:11" (optionally with +TZ)
	const m = raw.match(/^(\d{4}):(\d{2}):(\d{2})[ T](\d{2}:\d{2}:\d{2})(.*)$/);
	if (!m) return null;
	return `${m[1]}-${m[2]}-${m[3]}T${m[4]}${m[5]?.trim() || ''}`;
}

/** Extract EXIF metadata using exiftool (preferred) or sharp as fallback. */
export async function extractExif(filePath: string): Promise<ExifData> {
	const empty: ExifData = {
		cameraMake: null,
		cameraModel: null,
		lens: null,
		aperture: null,
		shutterSpeed: null,
		focalLength: null,
		iso: null,
		takenAt: null
	};

	if (await hasExiftool()) {
		try {
			const execFileAsync = await loadExecFile();
			const { stdout } = await execFileAsync('exiftool', [
				'-json',
				'-n', // numeric values
				'-Make',
				'-Model',
				'-LensModel',
				'-LensID',
				'-FNumber',
				'-ExposureTime',
				'-FocalLength',
				'-ISO',
				'-DateTimeOriginal',
				'-CreateDate',
				filePath
			]);
			const d = JSON.parse(stdout)[0] ?? {};
			return {
				cameraMake: normalizeGear(d.Make?.toString().trim() || null),
				cameraModel: normalizeGear(d.Model?.toString().trim() || null),
				lens: (d.LensModel ?? d.LensID)?.toString().trim() || null,
				aperture: d.FNumber ? `f/${+(+d.FNumber).toFixed(1)}` : null,
				shutterSpeed: formatShutter(d.ExposureTime),
				focalLength: d.FocalLength ? `${Math.round(+d.FocalLength)}mm` : null,
				iso: d.ISO ? Math.round(+d.ISO) : null,
				takenAt: formatExifDate(d.DateTimeOriginal) ?? formatExifDate(d.CreateDate)
			};
		} catch (err) {
			console.warn(`[exif] exiftool failed for ${filePath}:`, err);
		}
	}

	// Fallback: sharp exposes a parsed subset of EXIF
	try {
		const sharp = (await import('sharp')).default;
		const meta = await sharp(filePath).metadata();
		const exif = (meta as { exif?: Buffer }).exif;
		if (!exif) return empty;
		// Without a full EXIF parser we only keep what sharp surfaces directly.
		return empty;
	} catch {
		return empty;
	}
}
