/** Gallery-filter parsing, serialization, and display helpers. */

import { FILTER_KEYS, type GalleryFilters } from './types';

const TEXT_LIMIT = 160;

/**
 * Parse the public query string once, at the edge of the app. Numeric values
 * are normalized before they ever reach Postgres casts, boolean toggles only
 * accept an explicit truthy value, and unbounded text is capped to keep URLs
 * and analytics keys sensible.
 */
export function galleryFiltersFromSearchParams(params: URLSearchParams): GalleryFilters {
	const filters: GalleryFilters = {};
	for (const key of FILTER_KEYS) {
		const raw = params.get(key);
		if (!raw) continue;
		const value = raw
			.trim()
			.replace(/[\u0000-\u001f\u007f]/g, '')
			.slice(0, key === 'q' ? 120 : TEXT_LIMIT);
		if (!value) continue;

		if (key === 'favorite' || key === 'analog') {
			if (/^(1|true|yes)$/i.test(value)) filters[key] = '1';
			continue;
		}

		if (key === 'iso') {
			if (!/^\d{1,7}$/.test(value)) continue;
			const iso = Number(value);
			if (iso >= 1 && iso <= 10_000_000) filters.iso = String(iso);
			continue;
		}

		if (key === 'focalMin' || key === 'focalMax') {
			if (!/^\d{1,4}(?:\.\d{1,2})?$/.test(value)) continue;
			const focal = Number(value);
			if (focal >= 0 && focal <= 10_000) filters[key] = String(focal);
			continue;
		}

		filters[key] = value;
	}
	return filters;
}

/** Stable FILTER_KEYS-ordered serialization used by every gallery view. */
export function galleryFilterParams(filters: GalleryFilters): URLSearchParams {
	const params = new URLSearchParams();
	for (const key of FILTER_KEYS) {
		const value = filters[key];
		if (value) params.set(key, value);
	}
	return params;
}

/** Query suffix for a photo opened from the gallery, retaining every filter. */
export function galleryPhotoQuery(filters: GalleryFilters): string {
	const params = galleryFilterParams(filters);
	params.set('g', '1');
	return `?${params}`;
}

/** Link back to the exact gallery result set; `/` when there is no filter. */
export function galleryHref(filters: GalleryFilters): string {
	const query = galleryFilterParams(filters).toString();
	return query ? `/?${query}` : '/';
}

/** Human form of a focal-length range: "24–105mm", "≤ 35mm", "≥ 85mm". */
export function focalRangeText(min: string | undefined, max: string | undefined): string {
	if (min && max) return `${min}–${max}mm`;
	if (min) return `≥ ${min}mm`;
	return `≤ ${max}mm`;
}
