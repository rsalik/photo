import { frnd, hashStr, mulberry32 } from './math';

export const MARKER_COLOR = '#ffb512';

const SELECT_RINGS = [
	'M50 4 C82 3 97 19 96 50 C95 81 76 97 50 96 C19 95 3 77 4 49 C5 20 26 5 53 4',
	'M51 3 C78 5 97 21 96 51 C95 80 75 96 48 95 C18 94 3 75 4 46 C5 20 30 3 54 4',
	'M54 5 C84 6 95 24 94 51 C93 80 72 95 47 95 C20 95 4 74 5 47 C6 22 32 5 56 5'
];

const SELECT_RECTS = [
	'M6 9 L50 7 L95 9 L93 50 L95 92 L50 94 L7 92 L6 50 Z',
	'M8 7 L50 9 L93 8 L92 49 L94 93 L49 91 L7 93 L8 51 Z'
];

export interface RingMark {
	path: string;
	color: string;
	rotate: number;
}

const RING_VARIANTS = SELECT_RINGS.length + SELECT_RECTS.length;

function ringFromVariant(v: number, h: number): RingMark {
	const path = v < SELECT_RINGS.length ? SELECT_RINGS[v] : SELECT_RECTS[v - SELECT_RINGS.length];
	return { path, color: MARKER_COLOR, rotate: ((h >>> 8) % 9) - 4 };
}

/**
 * Assigns a keeper mark (circle or rectangle) to each favourite in sheet order,
 * ensuring no two consecutive favourites get the identical mark variation.
 */
export function assignRings(favIds: string[], seed: number): Map<string, RingMark> {
	const rnd = mulberry32(seed ^ 0x6b1f9e2d);
	const map = new Map<string, RingMark>();
	let prev = -1;
	for (const id of favIds) {
		let v = Math.floor(rnd() * RING_VARIANTS);
		if (v === prev) v = (v + 1 + Math.floor(rnd() * (RING_VARIANTS - 1))) % RING_VARIANTS;
		prev = v;
		map.set(id, ringFromVariant(v, hashStr(id)));
	}
	return map;
}

/**
 * Per-line transform that makes the leader scrawl read as hand-lettered rather
 * than typeset: each line gets its own slight rotation, offset, and size so the
 * baseline wanders and the marker pressure looks uneven. Deterministic per
 * (seed, line) so a given sheet always reproduces the same handwriting.
 */
export function handJitter(
	seed: number,
	line: number
): { rot: number; dx: number; dy: number; scale: number } {
	const r = (n: number) => frnd(seed, line * 7 + n);
	return {
		rot: (r(1) - 0.5) * 7, // ±3.5° tilt
		dx: (r(2) - 0.5) * 18, // horizontal drift
		dy: (r(3) - 0.5) * 7, // vertical wander
		scale: 0.9 + r(4) * 0.22 // 0.90–1.12× — uneven letter sizing
	};
}

/**
 * A procedural light leak for the leader frame, seeded off the roll so it's
 * stable but differs per view. About half of all rolls carry one; when present
 * it bleeds in from a randomly-chosen short edge and covers an organic fraction
 * of the frame, mimicking the over-exposed head of a real film roll. The
 * component renders this as a screen-blended gradient overlay.
 */
export function leaderBurn(seed: number): { show: boolean; fromLeft: boolean; coverage: number } {
	return {
		show: frnd(seed, 101) < 0.5,
		fromLeft: frnd(seed, 102) < 0.5,
		coverage: 0.32 + frnd(seed, 103) * 0.22 // 32–54% of the frame width
	};
}
