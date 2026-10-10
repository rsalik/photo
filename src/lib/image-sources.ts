import { IMAGE_SIZES, type Photo } from './types';

export interface PhotoSource {
	url: string;
	width: number;
}

type ImagePhoto = Pick<Photo, 'id' | 'width' | 'height'>;

export interface PhotoLoadPlan {
	preview: PhotoSource;
	intermediate?: PhotoSource;
	final: PhotoSource;
}

/**
 * Build responsive candidates with unique widths. Images smaller than a named
 * derivative can make several files share the same intrinsic width; browsers
 * reject duplicate width descriptors, so those candidates are de-duplicated.
 * On detail views the full-quality derivative owns the natural-size
 * candidate.
 */
export function photoSources(photo: ImagePhoto, includeFull = false): PhotoSource[] {
	const longest = Math.max(photo.width, photo.height);
	const candidates = new Map<number, string>();

	for (const [name, edge] of Object.entries(IMAGE_SIZES)) {
		const scale = Math.min(1, edge / longest);
		const width = Math.max(1, Math.round(photo.width * scale));
		const existing = candidates.get(width);
		// Prefer a quality-84 derivative when `sm` and `md` collapse to the
		// same natural width; later equally-sized derivatives add no value.
		if (!existing || (existing.endsWith('/sm') && name !== 'sm')) {
			candidates.set(width, `/img/${photo.id}/${name}`);
		}
	}

	if (includeFull) candidates.set(photo.width, `/img/${photo.id}/full`);

	return [...candidates.entries()]
		.sort(([a], [b]) => a - b)
		.map(([width, url]) => ({ width, url }));
}

export function photoSrcset(photo: ImagePhoto, includeFull = false): string {
	return photoSources(photo, includeFull)
		.map(({ width, url }) => `${url} ${width}w`)
		.join(', ');
}

/**
 * Select for the visible width, including CSS transforms. The layout box is
 * smaller during the postcard intro and lightbox zoom, so callers must pass
 * the displayed width. Returning an existing candidate also keeps a
 * running decode stable until the image needs a different derivative.
 */
export function photoSourceForWidth(
	sources: readonly PhotoSource[],
	displayWidth: number,
	pixelRatio = 1
): PhotoSource {
	if (!sources.length) throw new Error('A photo must have at least one image source');
	const requiredWidth = Math.max(1, displayWidth) * Math.max(1, pixelRatio);
	return sources.find((source) => source.width >= requiredWidth) ?? sources[sources.length - 1];
}

/** Full-resolution quality wins when two files have the same dimensions. */
export function isSharperSource(next: PhotoSource, current: PhotoSource): boolean {
	return (
		next.width > current.width ||
		(next.width === current.width &&
			next.url.endsWith('/full') &&
			!current.url.endsWith('/full'))
	);
}

/**
 * Jump directly to a useful display derivative before a large original. For
 * example, a Retina postcard can show `xl` while `full` downloads; it need not
 * wait at `md` or download every size along the way.
 */
export function photoLoadPlan(
	photo: ImagePhoto,
	displayWidth: number,
	pixelRatio = 1,
	preferFull = false
): PhotoLoadPlan {
	const sources = photoSources(photo, true).filter((source) => !source.url.endsWith('/sm'));
	const final = preferFull
		? sources[sources.length - 1]
		: photoSourceForWidth(sources, displayWidth, pixelRatio);
	const preview = {
		url: `/img/${photo.id}/md`,
		width: Math.round(
			photo.width * Math.min(1, IMAGE_SIZES.md / Math.max(photo.width, photo.height))
		)
	};
	const resized = photoSourceForWidth(photoSources(photo), displayWidth, pixelRatio);
	return {
		preview,
		final,
		intermediate:
			final.url.endsWith('/full') && isSharperSource(resized, preview) ? resized : undefined
	};
}
