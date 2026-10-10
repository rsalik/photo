/**
 * Seed the portfolio with generated sample photographs.
 *
 * Creates images with ImageMagick, writes real EXIF with exiftool, then
 * uploads them through the running dev server's admin API — exercising the
 * exact same pipeline real uploads use (EXIF extraction, resizing, blur
 * placeholders, title-color detection).
 *
 * Usage: npm run dev (in another terminal), then: npm run seed
 */
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const BASE = process.env.BASE_URL ?? 'http://localhost:5173';
const PASSWORD = process.env.ADMIN_PASSWORD ?? readEnvFile('ADMIN_PASSWORD');

function readEnvFile(key) {
	try {
		const env = fs.readFileSync(new URL('../.env', import.meta.url), 'utf8');
		return env.match(new RegExp(`^${key}=(.*)$`, 'm'))?.[1]?.trim();
	} catch {
		return undefined;
	}
}

const SAMPLES = [
	{ title: 'Alpenglow Over the Ridge', w: 3600, h: 2400, c: ['#1d2d44', '#c4683f', '#e8c39e'], camera: ['SONY', 'ILCE-7M4'], lens: 'FE 24-70mm F2.8 GM II', f: 8, exp: '1/250', focal: 35, iso: 100, date: '2025:09:14 18:42:00', location: 'Dolomites, Italy', tags: 'mountains, golden hour', albums: 'Alps 2025', desc: 'Last light catching the western face after an afternoon storm.', film: { stock: 'Kodak Portra 400', iso: '400', format: '35mm' } },
	{ title: 'Quiet Harbor at Dawn', w: 3600, h: 2400, c: ['#9db4c0', '#e8e4da', '#f4ddc4'], camera: ['SONY', 'ILCE-7M4'], lens: 'FE 24-70mm F2.8 GM II', f: 11, exp: '1/60', focal: 24, iso: 200, date: '2025-08-02 05:58:00', location: 'Cinque Terre, Italy', tags: 'coast, morning', albums: 'Coastal', desc: 'Fishing boats before the town woke up.' },
	{ title: 'The Campanile', w: 2400, h: 3600, c: ['#d9c7a7', '#8c6f4e', '#3a2f23'], camera: ['Leica', 'Q3'], lens: 'SUMMILUX 1:1.7/28 ASPH.', f: 5.6, exp: '1/500', focal: 28, iso: 100, date: '2025:08:03 16:21:00', location: 'Florence, Italy', tags: 'architecture, city', albums: 'Italy 2025', desc: null },
	{ title: 'Dune Field No. 7', w: 3600, h: 1200, c: ['#e3c79e', '#b5854f', '#7a4f28'], camera: ['FUJIFILM', 'GFX100S'], lens: 'GF45-100mmF4 R LM OIS WR', f: 16, exp: '1/125', focal: 64, iso: 100, date: '2025:03:19 17:05:00', location: 'Death Valley, California', tags: 'desert, abstract', albums: 'American West', desc: 'A panorama of wind-carved ridgelines an hour before sunset.' },
	{ title: 'Birch Interior', w: 2400, h: 3000, c: ['#3d4a3a', '#94a58a', '#e7ead8'], camera: ['FUJIFILM', 'X-T5'], lens: 'XF56mmF1.2 R WR', f: 1.8, exp: '1/1000', focal: 56, iso: 320, date: '2024:10:22 11:30:00', location: 'Vermont', tags: 'forest, autumn', albums: 'New England', desc: null, film: { stock: 'Ilford HP5 Plus', iso: '400', format: '120' } },
	{ title: 'Stockholm Stillness', w: 3600, h: 2400, c: ['#46586a', '#90a0ac', '#d8d2c4'], camera: ['Leica', 'Q3'], lens: 'SUMMILUX 1:1.7/28 ASPH.', f: 4, exp: '1/320', focal: 28, iso: 400, date: '2024:12:08 14:12:00', location: 'Stockholm, Sweden', tags: 'city, winter', albums: 'Nordic Light', desc: 'Gamla Stan across the water in December light.' },
	{ title: 'Tidal Glass', w: 3000, h: 3000, c: ['#16323e', '#3e7a8a', '#bfe0e2'], camera: ['SONY', 'ILCE-7M4'], lens: 'FE 70-200mm F2.8 GM OSS II', f: 22, exp: '2', focal: 110, iso: 50, date: '2025:01-30 19:48:00', location: 'Big Sur, California', tags: 'coast, long exposure', albums: 'Coastal', desc: 'Two seconds of the Pacific smoothing itself out.' },
	{ title: 'Market Umbrellas', w: 2400, h: 3600, c: ['#a33b2e', '#d98e4a', '#ecd9b8'], camera: ['FUJIFILM', 'X-T5'], lens: 'XF23mmF1.4 R LM WR', f: 2.8, exp: '1/800', focal: 23, iso: 160, date: '2025:08:05 10:15:00', location: 'Florence, Italy', tags: 'street, color', albums: 'Italy 2025', desc: null },
	{ title: 'Glacier Lagoon', w: 3600, h: 2000, c: ['#274a5c', '#7fb0c0', '#e8f1f2'], camera: ['FUJIFILM', 'GFX100S'], lens: 'GF23mmF4 R LM WR', f: 11, exp: '1/160', focal: 23, iso: 100, date: '2024:06:17 23:30:00', location: 'Jökulsárlón, Iceland', tags: 'ice, midnight sun', albums: 'Nordic Light', desc: 'Midnight sun over drifting ice.' },
	{ title: 'Brownstone Geometry', w: 2400, h: 3000, c: ['#5d4a3a', '#9a7f63', '#d9cbb8'], camera: ['Leica', 'Q3'], lens: 'SUMMILUX 1:1.7/28 ASPH.', f: 6.3, exp: '1/250', focal: 28, iso: 200, date: '2025:05:11 09:05:00', location: 'Brooklyn, New York', tags: 'architecture, street', albums: 'American West', desc: null },
	{ title: 'Saffron Field Storm', w: 3600, h: 2400, c: ['#41435c', '#8a86a0', '#e0b54a'], camera: ['SONY', 'ILCE-7M4'], lens: 'FE 70-200mm F2.8 GM OSS II', f: 4, exp: '1/2000', focal: 135, iso: 250, date: '2024:07:09 16:50:00', location: 'Provence, France', tags: 'fields, storm light', albums: 'Provence', desc: 'A break in the clouds over July bloom.' },
	{ title: 'Night Tram, Kreuzberg', w: 3600, h: 2400, c: ['#101820', '#27405c', '#c8a050'], camera: ['FUJIFILM', 'X-T5'], lens: 'XF35mmF1.4 R', f: 1.4, exp: '1/30', focal: 35, iso: 3200, date: '2024:11:23 21:40:00', location: 'Berlin, Germany', tags: 'night, city', albums: 'Nordic Light', desc: null }
];

function makeImage(sample, file) {
	const { w, h, c } = sample;
	// sky gradient over a darker "ground" band → reads as a horizon
	const skyH = Math.round(h * (0.52 + Math.random() * 0.18));
	execFileSync('magick', [
		'(', '-size', `${w}x${skyH}`, `gradient:${c[0]}-${c[2]}`, ')',
		'(', '-size', `${w}x${h - skyH}`, `gradient:${c[1]}-#241f18`, ')',
		'-append',
		'-attenuate', '0.18', '+noise', 'Gaussian',
		'-blur', '0x0.8',
		'-quality', '90',
		file
	]);
	execFileSync('exiftool', [
		'-overwrite_original',
		`-Make=${sample.camera[0]}`,
		`-Model=${sample.camera[1]}`,
		`-LensModel=${sample.lens}`,
		`-FNumber=${sample.f}`,
		`-ExposureTime=${sample.exp}`,
		`-FocalLength=${sample.focal}`,
		`-ISO=${sample.iso}`,
		`-DateTimeOriginal=${sample.date.replace(/-/g, ':')}`,
		file
	]);
}

async function login() {
	if (!PASSWORD) throw new Error('Set ADMIN_PASSWORD in .env first');
	const form = new FormData();
	form.set('password', PASSWORD);
	const res = await fetch(`${BASE}/admin/login`, {
		method: 'POST',
		body: form,
		redirect: 'manual',
		headers: { origin: BASE }
	});
	const cookie = res.headers.get('set-cookie')?.split(';')[0];
	if (!cookie || !cookie.includes('pa_session')) {
		throw new Error(`Login failed (${res.status}) — is the dev server running and the password correct?`);
	}
	return cookie;
}

const cookie = await login();
const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pa-seed-'));

for (const sample of SAMPLES) {
	const file = path.join(tmpDir, `${sample.title.replace(/\W+/g, '_')}.jpg`);
	process.stdout.write(`→ ${sample.title} (${sample.w}×${sample.h}) ... `);
	makeImage(sample, file);

	const form = new FormData();
	form.set('file', new Blob([fs.readFileSync(file)], { type: 'image/jpeg' }), path.basename(file));
	form.set('title', sample.title);
	form.set('description', sample.desc ?? '');
	form.set('location', sample.location);
	form.set('tags', sample.tags);
	form.set('albums', sample.albums);
	if (sample.film) {
		form.set('analog', '1');
		form.set('filmStock', sample.film.stock);
		form.set('filmIso', sample.film.iso);
		form.set('filmFormat', sample.film.format);
	}
	let res;
	for (let attempt = 1; ; attempt++) {
		try {
			res = await fetch(`${BASE}/admin/api/upload`, {
				method: 'POST',
				body: form,
				headers: { cookie, origin: BASE }
			});
			break;
		} catch (err) {
			// dev server occasionally drops the kept-alive socket between big bodies
			if (attempt >= 3) throw err;
			await new Promise((r) => setTimeout(r, 300));
		}
	}
	if (!res.ok) {
		console.log(`FAILED (${res.status}): ${(await res.text()).slice(0, 200)}`);
	} else {
		const photo = await res.json();
		console.log(`ok → /photo/${photo.id} (title color ${photo.titleColor})`);
	}
}

fs.rmSync(tmpDir, { recursive: true, force: true });
console.log('Done.');
