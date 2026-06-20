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

function boldBrand(text: string): EdgeSeg[] {
	return text.split(/(\s+)/).map((tok) => {
		const t = tok.trim();
		return { t: tok, bold: BRAND_WORDS.has(t) || LENS_TOKEN.test(t) };
	});
}

/**
 * Determines and formats text to be printed along the edge of a specific frame,
 * mixing legitimate photo metadata with generated KeyKodes.
 */
export function topEdge(brand: SheetBrand, idx: number, p: Photo): TopEdge | null {
	const r = frnd(brand.seed, idx * 3 + 1);
	if (r < 0.22) return null;

	const meta: string[] = [];
	if (p.analog && p.filmStock) meta.push(`${p.filmStock}${p.filmIso ? ` ${p.filmIso}` : ''}`.toUpperCase());
	if (p.cameraModel) meta.push(p.cameraModel.toUpperCase());
	if (p.lens) meta.push(p.lens.toUpperCase());

	const useKeyKode = meta.length === 0 || frnd(brand.seed, idx * 3 + 4) < 0.14;
	const text = useKeyKode
		? `${brand.keyKode} ${22 + ((idx * 7) % 60)} ${1000 + ((brand.seed >>> (idx % 8)) % 8999)}`
		: meta[Math.floor(frnd(brand.seed, idx * 3 + 2) * meta.length)];

	// Anchor the text just right of the centred frame number (~40%). The upper
	// bound is kept conservative so that even a long lens string clears the frame's
	// right edge rather than getting its final glyph clipped by the rebate.
	const pos = 0.46 + frnd(brand.seed, idx * 3 + 3) * 0.06;
	return { segments: boldBrand(text), pos };
}

export function edgeTokens(photos: Photo[]): string[] {
	const seen = new Set<string>();
	const out: string[] = [];
	const push = (v: string | null | undefined) => {
		if (!v) return;
		const t = v.trim().toUpperCase();
		if (t && !seen.has(t)) {
			seen.add(t);
			out.push(t);
		}
	};
	for (const p of photos) if (p.analog) push(p.filmStock);
	for (const p of photos) push(p.cameraModel);
	return out;
}
