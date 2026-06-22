// sharp is loaded dynamically — a native binary that only runs on the laptop
// (upload + the build-og script), never bundled into the Workers build.
type SharpFn = (typeof import('sharp'))['default'];
const loadSharp = (): Promise<SharpFn> => import('sharp').then((m) => (m.default ?? m) as SharpFn);

/**
 * Open-Graph share cards, composed with sharp (so they run on the laptop at
 * upload time / via the backfill script, not on the Workers runtime). Output is
 * always 1200×630 JPEG, watermarked with the site domain.
 *
 *  - composePhotoOg:   one photo, full, over a blurred fill of itself.
 *  - composeGalleryOg: a contact-sheet grid of photos, optional filter title.
 */

export const OG_W = 1200;
export const OG_H = 630;
const FILM_INK = '#17150f';
const DOMAIN = 'PHOTOS.RYANSALIK.COM';

const esc = (s: string) =>
	s.replace(/[<>&'"]/g, (c) => `&#${c.charCodeAt(0)};`).toUpperCase();

/** transparent 1200×630 overlay: a bottom scrim, the domain, and an optional title */
function overlaySvg(title?: string): Buffer {
	const titleMarkup = title
		? `<text x="40" y="68" font-family="Helvetica, Arial, sans-serif" font-size="34" font-weight="600"
				letter-spacing="2" fill="#ffffff" fill-opacity="0.96">${esc(title)}</text>`
		: '';
	return Buffer.from(
		`<svg width="${OG_W}" height="${OG_H}" xmlns="http://www.w3.org/2000/svg">
			<defs>
				<linearGradient id="bottom" x1="0" y1="1" x2="0" y2="0">
					<stop offset="0" stop-color="#000" stop-opacity="0.5"/>
					<stop offset="0.28" stop-color="#000" stop-opacity="0"/>
				</linearGradient>
				${title ? `<linearGradient id="top" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#000" stop-opacity="0.45"/><stop offset="1" stop-color="#000" stop-opacity="0"/></linearGradient>` : ''}
			</defs>
			${title ? `<rect x="0" y="0" width="${OG_W}" height="150" fill="url(#top)"/>` : ''}
			${titleMarkup}
			<rect x="0" y="${OG_H - 170}" width="${OG_W}" height="170" fill="url(#bottom)"/>
			<text x="${OG_W / 2}" y="${OG_H - 34}" text-anchor="middle"
				font-family="Helvetica, Arial, sans-serif" font-size="25" letter-spacing="5"
				fill="#ffffff" fill-opacity="0.9">${DOMAIN}</text>
		</svg>`
	);
}

/** A single photo, shown whole over a darkened, blurred fill of itself. */
export async function composePhotoOg(source: Buffer): Promise<Buffer> {
	const sharp = await loadSharp();
	const base = sharp(source).rotate();
	const bg = await base
		.clone()
		.resize(OG_W, OG_H, { fit: 'cover' })
		.blur(36)
		.modulate({ brightness: 0.55 })
		.toBuffer();
	const fg = await base
		.clone()
		.resize(OG_W - 96, OG_H - 96, { fit: 'inside', withoutEnlargement: false })
		.toBuffer();
	const m = await sharp(fg).metadata();
	const left = Math.round((OG_W - (m.width ?? OG_W)) / 2);
	const top = Math.round((OG_H - (m.height ?? OG_H)) / 2);

	return sharp(bg)
		.composite([
			{ input: fg, left, top },
			{ input: overlaySvg(), top: 0, left: 0 }
		])
		.jpeg({ quality: 86, mozjpeg: true })
		.toBuffer();
}

/** A contact-sheet grid (up to 6 cells, 3×2) of the supplied photos. */
export async function composeGalleryOg(sources: Buffer[], title?: string): Promise<Buffer> {
	const sharp = await loadSharp();
	const cols = 3;
	const rows = 2;
	const M = 16; // outer margin
	const G = 6; // gap between cells
	const cellW = Math.floor((OG_W - 2 * M - (cols - 1) * G) / cols);
	const cellH = Math.floor((OG_H - 2 * M - (rows - 1) * G) / rows);

	const picks = sources.slice(0, cols * rows);
	const cells = await Promise.all(
		picks.map(async (buf, i) => {
			const r = Math.floor(i / cols);
			const c = i % cols;
			const input = await sharp(buf)
				.rotate()
				.resize(cellW, cellH, { fit: 'cover', position: 'attention' })
				.toBuffer();
			return { input, left: M + c * (cellW + G), top: M + r * (cellH + G) };
		})
	);

	return sharp({
		create: { width: OG_W, height: OG_H, channels: 3, background: FILM_INK }
	})
		.composite([...cells, { input: overlaySvg(title), top: 0, left: 0 }])
		.jpeg({ quality: 84, mozjpeg: true })
		.toBuffer();
}
