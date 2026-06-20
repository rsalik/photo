import type { SheetBrand } from './brand';
import { mulberry32 } from './math';

export interface DxRect {
	offsetAlong: number;
	widthAlong: number;
	offsetAcross: number;
	heightAcross: number;
}

export function dxFreeZones(length: number, numFrac = 0.4, advFrac = 0.86, m = 14): [number, number][] {
	const numHalf = 10;
	const advLen = 30;
	const numC = numFrac * length;
	const advStart = advFrac * length - advLen;
	const out: [number, number][] = [];
	const z1: [number, number] = [0, numC - numHalf - m];
	const z2: [number, number] = [numC + numHalf + m, advStart - m];
	const z3: [number, number] = [advStart + advLen + m, length];
	if (z1[1] - z1[0] > 1) out.push(z1);
	if (z2[1] - z2[0] > 1) out.push(z2);
	if (z3[1] - z3[0] > 1) out.push(z3);
	return out;
}

const BARCODE_PATTERNS = [
	[1, 1, 3, 1, 1, 3, 1, 1, 1], // 0
	[3, 1, 1, 1, 1, 3, 1, 1, 1], // 1
	[1, 3, 1, 1, 1, 1, 3, 1, 1], // 2
	[1, 1, 1, 3, 1, 3, 1, 1, 1], // 3
	[1, 1, 1, 1, 3, 1, 1, 3, 1], // 4
	[3, 1, 1, 1, 3, 1, 1, 1, 1], // 5
	[1, 3, 1, 1, 3, 1, 1, 1, 1], // 6
	[1, 1, 3, 1, 3, 1, 1, 1, 1], // 7
	[1, 1, 1, 3, 3, 1, 1, 1, 1], // 8
	[1, 1, 1, 1, 1, 3, 3, 1, 1]  // 9
];

/**
 * Generates a fixed-length barcode block starting at coordinate 0.
 */
export function dxBarsBlock(brand: SheetBrand, seedIdx: number, blockLen: number): DxRect[] {
	const rnd = mulberry32(brand.seed ^ Math.imul(seedIdx + 13, 0x85ebca6b));
	const out: DxRect[] = [];
	const maxChars = Math.floor((blockLen - 8) / 15);

	if (maxChars < 1) return out;

	const barcodeWidth = 8 + 15 * maxChars;
	const marginLeft = Math.floor((blockLen - barcodeWidth) / 2);
	let x = marginLeft;

	const drawBar = (barX: number, barW: number) => {
		out.push({ offsetAlong: barX, widthAlong: barW, offsetAcross: 0, heightAcross: 9 });
	};

	drawBar(x, 1);
	x += 2;
	drawBar(x, 1);
	x += 3;

	for (let c = 0; c < maxChars; c++) {
		const patternIdx = Math.floor(rnd() * 10);
		const pattern = BARCODE_PATTERNS[patternIdx];

		for (let elIdx = 0; elIdx < 9; elIdx++) {
			const elementWidth = pattern[elIdx];
			if (elIdx % 2 === 0) drawBar(x, elementWidth);
			x += elementWidth;
		}
		x += 2;
	}

	x -= 2;
	x += 2;

	drawBar(x, 1);
	x += 2;
	drawBar(x, 1);

	return out;
}

/**
 * Generates a fixed-length DX/CAS checkerboard block starting at coordinate 0.
 */
export function dxSquaresBlock(brand: SheetBrand, seedIdx: number, blockLen: number, lanes = 2): DxRect[] {
	const rnd = mulberry32(brand.seed ^ Math.imul(seedIdx + 29, 0xc2b2ae35));
	const cl = 3;
	const ld = 9 / lanes;
	const cols = Math.floor(blockLen / cl);
	const out: DxRect[] = [];
	
	const runStart = new Array(lanes).fill(-1);
	const runLength = new Array(lanes).fill(0);
	
	for (let c = 0; c < cols; c++) {
		for (let lane = 0; lane < lanes; lane++) {
			if (rnd() > 0.42) {
				if (runStart[lane] === -1) {
					runStart[lane] = c * cl;
					runLength[lane] = cl;
				} else {
					runLength[lane] += cl;
				}
			} else {
				if (runStart[lane] !== -1) {
					// Add 0.2 to width and height to completely hide sub-pixel SVG antialiasing gaps
					out.push({
						offsetAlong: runStart[lane],
						widthAlong: runLength[lane] + 0.2,
						offsetAcross: lane * ld,
						heightAcross: ld + 0.2
					});
					runStart[lane] = -1;
					runLength[lane] = 0;
				}
			}
		}
	}
	
	for (let lane = 0; lane < lanes; lane++) {
		if (runStart[lane] !== -1) {
			out.push({
				offsetAlong: runStart[lane],
				widthAlong: runLength[lane] + 0.2,
				offsetAcross: lane * ld,
				heightAcross: ld + 0.2
			});
		}
	}
	return out;
}

export function generateRollBarcodes(
	brand: SheetBrand,
	frames: { idx: number; length: number; gap?: number }[],
	Y = 100,
	X = 110,
	Z = 14
): Map<number, DxRect[]> {
	let globalLength = 0;
	const globalFreeZones: { start: number; end: number }[] = [];
	
	for (const f of frames) {
		const fZones = dxFreeZones(f.length, 0.4, 0.86, Z);
		for (const z of fZones) {
			globalFreeZones.push({ start: globalLength + z[0], end: globalLength + z[1] });
		}
		// The inter-frame gap is plain film margin — always free for the code to run
		// across. Adding it as its own zone lets this frame's trailing free zone merge
		// with the next frame's leading one, so a block can straddle the seam (and the
		// svg bleed already paints it over the margin, so the seam doesn't slice it).
		if (f.gap) {
			globalFreeZones.push({ start: globalLength + f.length, end: globalLength + f.length + f.gap });
		}
		globalLength += f.length + (f.gap || 0);
	}
	
	const mergedFreeZones: { start: number; end: number }[] = [];
	for (const z of globalFreeZones) {
		if (mergedFreeZones.length > 0) {
			const last = mergedFreeZones[mergedFreeZones.length - 1];
			if (Math.abs(z.start - last.end) < 0.1) {
				last.end = z.end;
				continue;
			}
		}
		mergedFreeZones.push({ ...z });
	}

	const blocks: { globalStart: number; seedIdx: number }[] = [];
	let targetPos = Y;
	let blockSeedIdx = 0;
	
	while (targetPos + X <= globalLength) {
		let placed = false;
		let searchPos = targetPos;
		
		while (searchPos + X <= globalLength) {
			const zone = mergedFreeZones.find((z) => z.start <= searchPos && z.end >= searchPos + X);
			if (zone) {
				blocks.push({ globalStart: searchPos, seedIdx: blockSeedIdx++ });
				placed = true;
				targetPos = searchPos + Y;
				break;
			} else {
				const nextZone = mergedFreeZones.find((z) => z.end >= searchPos + X);
				if (nextZone) {
					searchPos = Math.max(searchPos + 1, nextZone.start);
				} else {
					break;
				}
			}
		}
		
		if (!placed) break;
	}

	// Slice the global blocks back into per-frame rectangle lists. Offsets here must
	// advance by `length + gap` to match the gap-inclusive space the blocks were
	// placed in; each frame may render up to its trailing gap so a block straddling
	// the seam is drawn whole on both sides.
	const out = new Map<number, DxRect[]>();

	let currentOffset = 0;
	for (const f of frames) {
		const drawableEnd = currentOffset + f.length + (f.gap || 0);
		const frameRects: DxRect[] = [];

		for (const b of blocks) {
			const blockEnd = b.globalStart + X;
			if (b.globalStart < drawableEnd && blockEnd > currentOffset) {
				const rawRects =
					brand.dxKind === 'squares'
						? dxSquaresBlock(brand, b.seedIdx, X)
						: dxBarsBlock(brand, b.seedIdx, X);

				const localStart = b.globalStart - currentOffset;

				for (const r of rawRects) {
					const rectLocalStart = localStart + r.offsetAlong;
					const rectLocalEnd = rectLocalStart + r.widthAlong;

					const overlapStart = Math.max(0, rectLocalStart);
					// Allow the rectangle to bleed into the gap, so it's not cropped at f.length
					const overlapEnd = Math.min(f.length + (f.gap || 0), rectLocalEnd);

					if (overlapStart < overlapEnd) {
						frameRects.push({
							...r,
							offsetAlong: overlapStart,
							widthAlong: overlapEnd - overlapStart
						});
					}
				}
			}
		}

		out.set(f.idx, frameRects);
		currentOffset = drawableEnd;
	}

	return out;
}
