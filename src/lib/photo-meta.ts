import type { IconName } from './components/Icon.svelte';
import type { Photo } from './types';

/** One metadata chip: icon + label linking to the gallery filtered by that value. */
export interface PhotoMetaChip {
	icon: IconName;
	label: string;
	href: string;
	key: string;
}

/** The standard chip row for a photo — film stock, location, then EXIF — in the
 *  order every list surface presents them. */
export function photoMetaChips(p: Photo): PhotoMetaChip[] {
	const out: PhotoMetaChip[] = [];
	const add = (icon: IconName, key: string, value: string | null | undefined, label = value) => {
		if (value) out.push({ icon, key, href: `/?${key}=${encodeURIComponent(value)}`, label: String(label) });
	};
	if (p.analog && p.filmStock) add('film', 'film', p.filmStock);
	add('location', 'location', p.location);
	add('camera', 'camera', p.cameraModel);
	add('lens', 'lens', p.lens);
	add('focal', 'focal', p.focalLength);
	add('aperture', 'aperture', p.aperture);
	add('shutter', 'shutter', p.shutterSpeed);
	if (p.iso) add('iso', 'iso', String(p.iso), `ISO ${p.iso}`);
	return out;
}
