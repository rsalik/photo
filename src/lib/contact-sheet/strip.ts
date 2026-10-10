import type { Photo } from '../types';
import type { SheetBrand } from './brand';
import { topEdge, type TopEdge } from './edge';

/**
 * Strip-coordinate layout for edge markings.
 *
 * A contact sheet is one contiguous strip of film cut into rows, so markings
 * live in *strip* coordinates (px along the film), not frame coordinates.
 * Edge text anchors inside its own frame but is free to run straight across
 * frame boundaries; the only place it may be cut is where the strip itself is
 * cut — the right edge of a row — and there the remainder must resume at the
 * start of the next row, mid-glyph if that's where the scissors fell.
 */

/** One frame's slot along a strip segment, in px from the segment's left edge. */
export interface StripFrame {
	idx: number;
	left: number;
	width: number;
	photo: Photo;
}

/** An edge-text run placed along the strip: `x` is the run's left edge in px. */
export interface PlacedEdge {
	te: TopEdge;
	x: number;
}

/**
 * Overestimate of an edge-text run's rendered width at the band's 11px size.
 * Real glyph metrics aren't available during SSR, so this errs wide on purpose:
 * a row-break continuation rendered for text that actually fit ends left of the
 * cut and is clipped into invisibility, while an underestimate would drop a
 * genuinely-cut run. Only the overlap guard pays for the overshoot, and edge
 * print is sporadic enough that a few dropped runs don't read as missing.
 */
export function estEdgeWidth(te: TopEdge): number {
	const chars = te.segments.reduce((n, s) => n + s.t.length, 0);
	return chars * 7.5 + 16;
}

/** Frames too narrow to own a text run; their metadata simply isn't printed. */
const MIN_FRAME_FOR_TEXT = 48;

/**
 * Print edge text along a strip segment. Each frame that draws a run anchors it
 * at `topEdge().pos` within the frame, and the run then extends as far as it
 * needs to — over neighbouring frames, into the segment's cut edge. Runs that
 * would overprint the previous run are skipped (real edge print is exposed once
 * per position; two runs never share ink).
 */
export function placeEdgeTexts(brand: SheetBrand, frames: StripFrame[]): PlacedEdge[] {
	const out: PlacedEdge[] = [];
	let inkEnd = -Infinity; // strip x where the previous run's print ends
	for (const f of frames) {
		if (f.width < MIN_FRAME_FOR_TEXT) continue;
		const te = topEdge(brand, f.idx, f.photo);
		if (!te) continue;
		const x = f.left + te.pos * f.width;
		if (x < inkEnd + 10) continue;
		inkEnd = x + estEdgeWidth(te);
		out.push({ te, x });
	}
	return out;
}

/**
 * The runs from `prev` (a segment `prevWidth` px wide) that reach past its cut
 * edge, re-based into the next segment's coordinates (negative x → the run's
 * head is hidden behind the cut and only its tail shows). Rendering one of
 * these for a run that actually fit is harmless — see `estEdgeWidth`.
 */
export function carryEdgeTexts(prev: PlacedEdge[], prevWidth: number): PlacedEdge[] {
	return prev
		.filter((p) => p.x + estEdgeWidth(p.te) > prevWidth - 4)
		.map((p) => ({ te: p.te, x: p.x - prevWidth }));
}
