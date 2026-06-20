import { hashStr, mulberry32 } from './math';

export const EDGE_COLORS = [
	'#d8822e',
	'#e0a92e',
	'#db664f',
	'#59b7cf',
	//'#5a8f4e',
	'#f0fef9'
];

/** Number of available frame-marker arrow shapes. */
export const ARROW_KINDS = 7;

const KEYKODE_PREFIXES = ['KX', 'GB', 'EK', 'FX', 'PJ', 'TX'];

export interface SheetBrand {
	seed: number;
	color: string;
	startFrame: number;
	arrowKind: number;
	dxKind: 'lines' | 'squares';
	keyKode: string;
}

/**
 * Generates a consistent styling configuration (brand) for the contact sheet
 * based on the view key. Ensures identical visual styling across refreshes.
 */
export function brandFor(viewKey: string): SheetBrand {
	const seed = hashStr(viewKey || 'gallery');
	const rnd = mulberry32(seed);
	return {
		seed,
		color: EDGE_COLORS[Math.floor(rnd() * EDGE_COLORS.length)],
		startFrame: 1 + Math.floor(rnd() * 24),
		arrowKind: Math.floor(rnd() * ARROW_KINDS),
		dxKind: rnd() > 0.5 ? 'squares' : 'lines',
		keyKode: KEYKODE_PREFIXES[Math.floor(rnd() * KEYKODE_PREFIXES.length)]
	};
}
