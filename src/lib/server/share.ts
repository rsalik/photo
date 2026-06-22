import { env } from '$env/dynamic/private';
import { slugify } from '$lib/slug';
import { FAVORITE_TAG, type GalleryFilters } from '$lib/types';

// Base CDN URL where the pre-generated OG cards live (R2 custom domain).
const base = () => env.R2_PUBLIC_URL?.replace(/\/+$/, '') || '';

/** Absolute URL of a share card under og/<path>.jpg, or null without a CDN. */
export function ogUrl(path: string): string | null {
	const b = base();
	return b ? `${b}/og/${path}.jpg` : null;
}

/** The gallery card that represents the current filters (album > tag > all). */
export function galleryOgKey(f: GalleryFilters): string {
	if (f.album) return `gallery/album-${slugify(f.album)}`;
	if (f.tag && f.tag.toLowerCase() !== FAVORITE_TAG) return `gallery/tag-${slugify(f.tag)}`;
	return 'gallery/_all';
}
