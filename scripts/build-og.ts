/**
 * Generate Open-Graph share cards and upload them to R2:
 *   og/photo/<id>.jpg          one per photo
 *   og/gallery/_all.jpg        the whole gallery
 *   og/gallery/tag-<slug>.jpg  one per tag
 *   og/gallery/album-<slug>.jpg  one per album
 *
 * Reads photo bytes from the local data/derived tree, so run it on the laptop
 * after uploading new photos:
 *
 *   DATABASE_URL=… R2_* … npm run build-og
 */
import fs from 'node:fs';
import { getFilterOptions, listPhotos } from '../src/lib/server/db';
import { composeGalleryOg, composePhotoOg } from '../src/lib/server/og';
import { putOg } from '../src/lib/server/storage';
import { slugify } from '../src/lib/slug';
import type { Photo } from '../src/lib/types';

const localBytes = (id: string, sizes = ['xl', 'lg', 'full', 'md']): Buffer | null => {
	for (const s of sizes) {
		const p = `data/derived/${id}/${s}.jpg`;
		if (fs.existsSync(p)) return fs.readFileSync(p);
	}
	return null;
};

// up to 6 photos spread evenly across the set, for the contact-sheet grid
function sample(photos: Photo[], n = 6): Photo[] {
	if (photos.length <= n) return photos;
	return Array.from({ length: n }, (_, i) =>
		photos[Math.round((i * (photos.length - 1)) / (n - 1))]
	);
}

async function galleryCard(photos: Photo[], key: string, title?: string) {
	const bufs = sample(photos)
		.map((p) => localBytes(p.id, ['md', 'lg']))
		.filter((b): b is Buffer => !!b);
	if (!bufs.length) return;
	await putOg(`gallery/${key}`, await composeGalleryOg(bufs, title));
}

async function main() {
	const all = await listPhotos();

	let n = 0;
	for (const p of all) {
		const buf = localBytes(p.id);
		if (!buf) {
			console.warn('  no local image, skipping photo card:', p.id);
			continue;
		}
		await putOg(`photo/${p.id}`, await composePhotoOg(buf));
		if (++n % 10 === 0) console.log(`  photo cards ${n}/${all.length}`);
	}

	await galleryCard(all, '_all');
	const opts = await getFilterOptions();
	for (const tag of opts.tags) await galleryCard(await listPhotos({ tag }), `tag-${slugify(tag)}`, tag);
	for (const album of opts.albums)
		await galleryCard(await listPhotos({ album }), `album-${slugify(album)}`, album);

	console.log(
		`Done. ${n} photo cards, plus gallery cards for ${opts.tags.length} tags and ${opts.albums.length} albums.`
	);
	process.exit(0);
}

main().catch((err) => {
	console.error('build-og failed:', err);
	process.exit(1);
});
