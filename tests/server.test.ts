import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import { registerHooks } from 'node:module';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { after, before, test } from 'node:test';

// SvelteKit supplies this virtual module in the app. Tests use their own
// environment and temporary database, never the project's .env or live Neon.
const hooks = registerHooks({
	resolve(specifier, context, nextResolve) {
		if (specifier === '$env/dynamic/private') {
			return {
				url: 'data:text/javascript,export const env = process.env;',
				shortCircuit: true
			};
		}
		return nextResolve(specifier, context);
	}
});
const dataDir = await mkdtemp(path.join(tmpdir(), 'photo-album-test-'));
process.env.DATA_DIR = dataDir;
process.env.SESSION_SECRET = 'test-only-session-secret';
delete process.env.DATABASE_URL;
for (const key of Object.keys(process.env)) if (key.startsWith('R2_')) delete process.env[key];

const { createSession, verifySession } = await import('../src/lib/server/auth');
const { query, closeDatabase } = await import('../src/lib/server/db-ops/connection');
const { filterPreview, getAlbumPhotos, getPhoto, getPhotoById, listPhotos } =
	await import('../src/lib/server/db-ops/read');
const { setAlbumOrder } = await import('../src/lib/server/db-ops/write');
const { POST: saveAlbumOrder } = await import('../src/routes/admin/api/albums/+server');
const { PATCH: updatePhoto } = await import('../src/routes/admin/api/photos/[id]/+server');
const { GET: serveImage } = await import('../src/routes/img/[id]/[size]/+server');
const { putDerived } = await import('../src/lib/server/storage');
const { load: loadPhoto } = await import('../src/routes/photo/[id]/+page.server');

before(async () => {
	for (let i = 0; i < 9; i++) {
		await query(
			`INSERT INTO photos (id, slug, title, width, height, taken_at, is_test)
			 VALUES ($1, $1, $2, 1200, 800, $3, $4)`,
			[`photo-${i}`, `Photograph ${i}`, `2024-01-${String(i + 1).padStart(2, '0')}`, i === 8]
		);
	}
	await query(`INSERT INTO albums (name, slug) VALUES ('Travel', 'travel'), ('Other', 'other')`);
	await query(`INSERT INTO photo_albums (photo_id, album_id, position)
		SELECT p.id, a.id, row_number() OVER (PARTITION BY a.id ORDER BY p.id)::int - 1
		FROM photos p CROSS JOIN albums a`);
});

after(async () => {
	await closeDatabase();
	hooks.deregister();
	await rm(dataDir, { recursive: true, force: true });
});

test('sessions reject malformed, expired and tampered cookies without throwing', () => {
	const token = createSession();
	assert.equal(verifySession(token), true);
	const [role, expires, signature] = token.split('.');
	for (const invalid of [
		undefined,
		'',
		'not-a-session',
		`${role}.${expires}.${'é'.repeat(43)}`,
		`${role}.${expires}.extra.${signature}`,
		`user.${expires}.${signature}`,
		`${role}.${expires}.${signature.slice(0, -1)}${signature.endsWith('A') ? 'B' : 'A'}`
	]) {
		assert.equal(verifySession(invalid), false);
	}
	const expired = `admin.${Date.now() - 1000}`;
	const signed = createHmac('sha256', process.env.SESSION_SECRET!)
		.update(expired)
		.digest('base64url');
	assert.equal(verifySession(`${expired}.${signed}`), false);
});

test('filter previews keep the full count while returning six ordered thumbnails', async () => {
	const preview = await filterPreview();
	assert.equal(preview.count, 8);
	assert.equal(preview.photos.length, 6);
	assert.deepEqual(
		preview.photos.map((photo) => photo.id),
		['photo-7', 'photo-6', 'photo-5', 'photo-4', 'photo-3', 'photo-2']
	);
	assert.deepEqual(Object.keys(preview.photos[0]).sort(), ['blurData', 'height', 'id', 'width']);
	assert.deepEqual(await filterPreview({ q: 'no matching photograph' }), {
		count: 0,
		photos: []
	});
	assert.equal((await filterPreview({ q: 'Photograph 2' })).count, 1);
});

test('album order is applied consistently to gallery and preview queries', async () => {
	const order = [
		'photo-2',
		'photo-5',
		'photo-1',
		'photo-7',
		'photo-3',
		'photo-6',
		'photo-4',
		'photo-0',
		'photo-8'
	];
	await setAlbumOrder('TRAVEL', order);
	const album = await getAlbumPhotos('Travel');
	const gallery = await listPhotos({ album: 'Travel' });
	const preview = await filterPreview({ album: 'Travel' });
	assert.deepEqual(
		album.map((photo) => photo.id),
		order.slice(0, 8)
	);
	assert.deepEqual(
		gallery.map((photo) => photo.id),
		order.slice(0, 8)
	);
	assert.deepEqual(
		preview.photos.map((photo) => photo.id),
		order.slice(0, 6)
	);
	assert.equal(preview.count, 8);
	assert.deepEqual(
		(await getAlbumPhotos('Other')).map((photo) => photo.id),
		Array.from({ length: 8 }, (_, i) => `photo-${i}`)
	);
});

test('album API rejects malformed orders before attempting a database write', async () => {
	for (const body of [
		'{',
		'null',
		'[]',
		'{"album":12,"photoIds":[]}',
		'{"album":"Travel","photoIds":["photo-1","photo-1"]}',
		'{"album":"Travel","photoIds":["../outside"]}'
	]) {
		const request = new Request('http://localhost/admin/api/albums', { method: 'POST', body });
		await assert.rejects(
			async () => saveAlbumOrder({ request } as Parameters<typeof saveAlbumOrder>[0]),
			(error: unknown) =>
				typeof error === 'object' &&
				error !== null &&
				'status' in error &&
				error.status === 400
		);
	}
});

test('clearing a capture date stores null rather than an invalid timestamp', async () => {
	const request = new Request('http://localhost/admin/api/photos/photo-0', {
		method: 'PATCH',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({ takenAt: '' })
	});
	const response = await updatePhoto({ request, params: { id: 'photo-0' } } as Parameters<
		typeof updatePhoto
	>[0]);
	assert.equal(response.status, 200);
	assert.equal((await response.json()).takenAt, null);
});

test('image serving accepts every safe storage id and rejects traversal', async () => {
	const id = 'Photo_ABC';
	await putDerived(id, 'sm', Buffer.from('test-image-bytes'));
	const response = await serveImage({
		params: { id, size: 'sm' },
		setHeaders() {}
	} as unknown as Parameters<typeof serveImage>[0]);
	assert.equal(await response.text(), 'test-image-bytes');
	await assert.rejects(
		async () =>
			serveImage({
				params: { id: '../outside', size: 'sm' },
				setHeaders() {}
			} as unknown as Parameters<typeof serveImage>[0]),
		(error: unknown) =>
			typeof error === 'object' && error !== null && 'status' in error && error.status === 404
	);
});

test('search treats percent signs, underscores and backslashes as literal text', async () => {
	await query('UPDATE photos SET title = $1 WHERE id = $2', [
		'100% hand_print \\ scan',
		'photo-0'
	]);
	for (const q of ['%', '_', '\\']) {
		assert.deepEqual(
			(await listPhotos({ q })).map((photo) => photo.id),
			['photo-0']
		);
		assert.equal((await filterPreview({ q })).count, 1);
	}
});

test('preview counts apply combined metadata filters and exclude missing values', async () => {
	await query(`UPDATE photos SET camera_model = 'X100V', focal_length = '35mm', iso = 400,
		is_analog = true, film_stock = 'Portra 400', location = 'Kyoto' WHERE id = 'photo-2'`);
	const filters = {
		album: 'Travel',
		camera: 'X100V',
		focalMin: '30',
		focalMax: '40',
		iso: '400',
		analog: '1',
		film: 'portra 400',
		location: 'kyoto'
	};
	const preview = await filterPreview(filters);
	assert.equal(preview.count, 1);
	assert.deepEqual(
		preview.photos.map((photo) => photo.id),
		['photo-2']
	);
	assert.deepEqual(
		(await listPhotos(filters)).map((photo) => photo.id),
		['photo-2']
	);
	assert.deepEqual(await filterPreview({ ...filters, focalMin: '50' }), { count: 0, photos: [] });
});

test('public slugs take precedence over legacy ids while admin lookups stay exact', async () => {
	await query(`INSERT INTO photos (id, slug, title, width, height) VALUES
		('legacy-stable', 'new-public-slug', 'Renamed photograph', 1200, 800),
		('canonical-owner', 'legacy-stable', 'Canonical photograph', 1200, 800)`);
	assert.equal((await getPhoto('legacy-stable'))?.id, 'canonical-owner');
	assert.equal((await getPhotoById('legacy-stable'))?.id, 'legacy-stable');
	assert.equal(await getPhoto('photo-8'), null);
	assert.equal((await getPhotoById('photo-8', { includeTest: true }))?.id, 'photo-8');
	await assert.rejects(
		async () =>
			loadPhoto({
				params: { id: 'canonical-owner' },
				url: new URL('http://localhost/photo/canonical-owner?g=1&album=Travel')
			} as Parameters<typeof loadPhoto>[0]),
		(error: unknown) =>
			typeof error === 'object' &&
			error !== null &&
			'status' in error &&
			error.status === 301 &&
			'location' in error &&
			error.location === '/photo/legacy-stable?g=1&album=Travel'
	);
});

test('closing the local database releases it and preserves data on reopening', async () => {
	const before = await query('SELECT count(*)::int AS count FROM photos');
	await closeDatabase();
	await closeDatabase();
	assert.deepEqual(await query('SELECT count(*)::int AS count FROM photos'), before);
});
