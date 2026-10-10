import type { Photo } from '../types';
import { type SheetBrand } from './brand';
import { frnd } from './math';

/**
 * The number printed in a frame's rebate. Frames count up from 1 (the gallery's
 * first photo is frame 1); the prepended leader is frame 0. The trailing "A"
 * variant (e.g. "12A") is rendered separately by the marker — see the contact
 * sheet's advance-arrow snippet.
 */
export function frameLabel(idx: number): string {
	return idx < 0 ? '0' : `${idx + 1}`;
}

export interface EdgeSeg {
	t: string;
	bold: boolean;
}

export interface TopEdge {
	segments: EdgeSeg[];
	pos: number;
}

const BRAND_WORDS = new Set([
	'KODAK', 'CANON', 'SONY', 'NIKON', 'FUJI', 'FUJIFILM', 'ILFORD', 'LEICA',
	'ZEISS', 'SIGMA', 'TAMRON', 'PANASONIC', 'LUMIX', 'OLYMPUS', 'PENTAX',
	'RICOH', 'CONTAX', 'HASSELBLAD', 'MAMIYA', 'CINESTILL', 'LOMOGRAPHY',
	'AGFA', 'ROLLEI'
]);

const LENS_TOKEN = /\d+(-\d+)?MM/;

/** Split a metadata string into segments, bolding brand names and lens specs
 *  the way real edge print emphasises them. Matching is case-insensitive so
 *  text keeps its natural casing. */
function boldBrand(text: string): EdgeSeg[] {
	return text.split(/(\s+)/).map((tok) => {
		const t = tok.trim().toUpperCase();
		return { t: tok, bold: BRAND_WORDS.has(t) || LENS_TOKEN.test(t) };
	});
}

/**
 * Determines and formats text to be printed along the edge of a specific frame,
 * mixing legitimate photo metadata with generated KeyKodes. Metadata keeps its
 * natural casing; only the generated KeyKode reads as stamped code.
 */
export function topEdge(brand: SheetBrand, idx: number, p: Photo): TopEdge | null {
	const r = frnd(brand.seed, idx * 3 + 1);
	if (r < 0.22) return null;

	const meta: string[] = [];
	if (p.analog && p.filmStock) meta.push(p.filmStock);
	if (p.cameraModel) meta.push(p.cameraModel);
	if (p.lens) meta.push(p.lens);

	const useKeyKode = meta.length === 0 || frnd(brand.seed, idx * 3 + 4) < 0.14;
	const text = useKeyKode
		? `${brand.keyKode} ${22 + ((idx * 7) % 60)} ${1000 + ((brand.seed >>> (idx % 8)) % 8999)}`
		: meta[Math.floor(frnd(brand.seed, idx * 3 + 2) * meta.length)];

	// Anchor the text just right of the centred frame number (~40%). Long runs
	// print straight across frame boundaries (strip-coordinate layout — see
	// strip.ts), so the anchor can range freely within the frame.
	const pos = 0.44 + frnd(brand.seed, idx * 3 + 3) * 0.18;
	return { segments: boldBrand(text), pos };
}
