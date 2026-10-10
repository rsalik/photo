import { ImageResponse } from '@cf-wasm/og';
import { htmlToReact } from '@cf-wasm/og/html-to-react';

/**
 * Dynamic Open-Graph cards rendered at request time with Satori (via
 * @cf-wasm/og, which runs on the Cloudflare Workers runtime and in Node dev).
 * The photos are embedded by URL — Satori fetches them — so nothing is pre-baked.
 *
 *  - photoCardHtml:   one photo, full-bleed, with the domain watermark.
 *  - galleryCardHtml: a 3×2 contact-sheet grid, with the filter title.
 */

export const OG_W = 1200;
export const OG_H = 630;
const DOMAIN = 'PHOTOS.RYANSALIK.COM';

const esc = (s: string) => s.replace(/[<>&"]/g, (c) => `&#${c.charCodeAt(0)};`);

/** bottom scrim + centered domain watermark, plus an optional top-left title */
function chrome(title?: string): string {
	const t = title
		? `<div style="display:flex;position:absolute;top:0;left:0;width:${OG_W}px;height:150px;background-image:linear-gradient(to bottom, rgba(0,0,0,0.5), rgba(0,0,0,0));"></div>
		   <div style="display:flex;position:absolute;top:36px;left:42px;color:#fff;font-size:40px;letter-spacing:1px;text-transform:uppercase;">${esc(title)}</div>`
		: '';
	return `${t}
		<div style="display:flex;position:absolute;bottom:0;left:0;width:${OG_W}px;height:190px;background-image:linear-gradient(to top, rgba(0,0,0,0.62), rgba(0,0,0,0));"></div>
		<div style="display:flex;position:absolute;bottom:34px;left:0;width:${OG_W}px;align-items:center;justify-content:center;color:#fff;font-size:26px;letter-spacing:6px;">${DOMAIN}</div>`;
}

export function photoCardHtml(photoUrl: string): string {
	return `<div style="display:flex;position:relative;width:${OG_W}px;height:${OG_H}px;background-color:#17150f;">
		<img src="${photoUrl}" width="${OG_W}" height="${OG_H}" style="width:${OG_W}px;height:${OG_H}px;object-fit:cover;" />
		${chrome()}
	</div>`;
}

export function galleryCardHtml(urls: string[], title?: string): string {
	const cols = 3;
	const rows = 2;
	const M = 14;
	const G = 6;
	const cw = Math.floor((OG_W - 2 * M - (cols - 1) * G) / cols);
	const ch = Math.floor((OG_H - 2 * M - (rows - 1) * G) / rows);
	const cells = urls
		.slice(0, cols * rows)
		.map((u, i) => {
			const left = M + (i % cols) * (cw + G);
			const top = M + Math.floor(i / cols) * (ch + G);
			return `<img src="${u}" width="${cw}" height="${ch}" style="position:absolute;left:${left}px;top:${top}px;width:${cw}px;height:${ch}px;object-fit:cover;" />`;
		})
		.join('');
	return `<div style="display:flex;position:relative;width:${OG_W}px;height:${OG_H}px;background-color:#17150f;">
		${cells}
		${chrome(title)}
	</div>`;
}

/** Render an OG HTML string to a 1200×630 PNG response. */
export function ogResponse(html: string): Response {
	return new ImageResponse(htmlToReact(html), {
		width: OG_W,
		height: OG_H,
		headers: { 'cache-control': 'public, max-age=86400, s-maxage=604800' }
	}) as unknown as Response;
}
