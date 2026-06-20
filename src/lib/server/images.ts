import path from 'node:path';
// sharp is loaded dynamically — it's a native binary that only runs on the local
// laptop (admin uploads), not on Cloudflare Workers in production.
type Sharp = typeof import('sharp');
const loadSharp = (): Promise<Sharp> => import('sharp').then(m => m.default ?? m) as Promise<Sharp>;
import { putDerived, putOriginal } from './storage';
import { IMAGE_SIZES } from '$lib/types';

export interface ProcessedImage {
	width: number;
	height: number;
	blurData: string;
	originalExt: string;
}

/**
 * Persist the original and generate the four derived sizes plus a tiny
 * blurred placeholder (inlined as a data URI). All local compute via sharp.
 */
export async function processImage(buffer: Buffer, id: string, originalName: string): Promise<ProcessedImage> {
	const sharp = await loadSharp();
	const img = sharp(buffer, { failOn: 'none' }).rotate(); // bake in EXIF orientation
	const meta = await img.metadata();
	if (!meta.width || !meta.height) throw new Error('Could not read image dimensions');
	// after rotate(), width/height swap for 90°/270° orientations
	const swapped = (meta.orientation ?? 1) >= 5;
	const width = swapped ? meta.height : meta.width;
	const height = swapped ? meta.width : meta.height;

	const ext = (path.extname(originalName).slice(1) || meta.format || 'jpg').toLowerCase();
	await putOriginal(id, ext, buffer);

	await Promise.all(
		Object.entries(IMAGE_SIZES).map(async ([name, edge]) => {
			const out = await img
				.clone()
				.resize(edge, edge, { fit: 'inside', withoutEnlargement: true })
				.jpeg({ quality: name === 'sm' ? 78 : 84, mozjpeg: true })
				.toBuffer();
			await putDerived(id, name, out);
		})
	);

	// full-resolution JPEG for display (originals may be HEIC/TIFF/RAW-ish)
	await putDerived(id, 'full', await img.clone().jpeg({ quality: 90, mozjpeg: true }).toBuffer());

	const blur = await img
		.clone()
		.resize(28, 28, { fit: 'inside' })
		.blur(1)
		.jpeg({ quality: 50 })
		.toBuffer();
	const blurData = `data:image/jpeg;base64,${blur.toString('base64')}`;

	return { width, height, blurData, originalExt: ext };
}

/**
 * Detects an optimal title color for the image.
 * Analyzes the center band where the title renders, evaluating candidate colors
 * based on contrast ratios and visual complexity to ensure readability.
 */
import { TITLE_COLOR_PRESETS } from '$lib/types';

const CANDIDATES = TITLE_COLOR_PRESETS;

function hexToRgb(hex: string): [number, number, number] {
	const n = parseInt(hex.slice(1), 16);
	return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function luminance([r, g, b]: [number, number, number]): number {
	const f = (c: number) => {
		const s = c / 255;
		return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
	};
	return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
}

function contrast(l1: number, l2: number): number {
	const [hi, lo] = l1 > l2 ? [l1, l2] : [l2, l1];
	return (hi + 0.05) / (lo + 0.05);
}

export interface TitleColorResult {
	titleColor: string;
	palette: string[];
}

export async function detectTitleColor(buffer: Buffer): Promise<TitleColorResult> {
	const SIZE = 48;
	const sharp = await loadSharp();
	const { data, info } = await sharp(buffer, { failOn: 'none' })
		.rotate()
		.resize(SIZE, SIZE, { fit: 'fill' })
		.removeAlpha()
		.raw()
		.toBuffer({ resolveWithObject: true });

	// center band: middle 40% of rows, middle 76% of columns — where the title sits
	const pixels: [number, number, number][] = [];
	const rowStart = Math.floor(info.height * 0.3);
	const rowEnd = Math.ceil(info.height * 0.7);
	const colStart = Math.floor(info.width * 0.12);
	const colEnd = Math.ceil(info.width * 0.88);
	for (let y = rowStart; y < rowEnd; y++) {
		for (let x = colStart; x < colEnd; x++) {
			const i = (y * info.width + x) * info.channels;
			pixels.push([data[i], data[i + 1], data[i + 2]]);
		}
	}

	const lums = pixels.map(luminance);
	const meanLum = lums.reduce((a, b) => a + b, 0) / lums.length;
	const variance = lums.reduce((a, b) => a + (b - meanLum) ** 2, 0) / lums.length;
	const busy = Math.sqrt(variance); // 0 (flat) .. ~0.5 (chaotic)

	// score: worst-case contrast across band percentiles, plus taste order
	const sorted = [...lums].sort((a, b) => a - b);
	const pct = (p: number) => sorted[Math.min(sorted.length - 1, Math.floor(p * sorted.length))];
	const samples = [pct(0.1), pct(0.5), pct(0.9)];

	const scored = CANDIDATES.map((c, idx) => {
		const cl = luminance(hexToRgb(c.hex));
		const worst = Math.min(...samples.map((s) => contrast(cl, s)));
		const mean = contrast(cl, meanLum);
		// taste: earlier candidates preferred; busy scenes favor brighter text
		const taste = (CANDIDATES.length - idx) * 0.35;
		const busyPenalty = busy > 0.18 && cl < 0.5 ? 1.5 : 0;
		// mixed bright/dark centers: the worst-case contrast dominates the pick
		return { hex: c.hex, worst, score: worst * 1.6 + mean * 0.3 + taste - busyPenalty };
	});

	const accessible = scored.filter((s) => s.worst >= 2.6);
	const pool = accessible.length ? accessible : scored;
	pool.sort((a, b) => b.score - a.score);

	return {
		titleColor: pool[0].hex,
		palette: pool.map((s) => s.hex)
	};
}
