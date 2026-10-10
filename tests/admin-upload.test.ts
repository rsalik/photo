// Exercise admin uploads with real image processing and isolated local storage,
// including Cloudflare's platform emulation during development.
import assert from 'node:assert/strict';
import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises';
import { registerHooks } from 'node:module';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { after, test } from 'node:test';
import sharp from 'sharp';

const environmentModule = `data:text/javascript,${encodeURIComponent(`
export let dev = true;
export function setDevelopment(value) { dev = value; }
`)}`;
const hooks = registerHooks({
	resolve(specifier, context, nextResolve) {
		if (specifier === '$app/environment') {
			return { url: environmentModule, shortCircuit: true };
		}
		if (specifier === '$env/dynamic/private') {
			return {
				url: 'data:text/javascript,export const env = process.env;',
				shortCircuit: true
			};
		}
		return nextResolve(specifier, context);
	}
});

// Never use the project's .env, Neon database, or R2 buckets in these tests.
const dataDir = await mkdtemp(path.join(tmpdir(), 'photo-album-upload-test-'));
process.env.DATA_DIR = dataDir;
delete process.env.DATABASE_URL;
for (const key of Object.keys(process.env)) if (key.startsWith('R2_')) delete process.env[key];

const { setDevelopment } = (await import(environmentModule)) as {
	setDevelopment(value: boolean): void;
};
const { query, closeDatabase } = await import('../src/lib/server/db-ops/connection');
const { getPhotoById } = await import('../src/lib/server/db-ops/read');
const { POST: uploadPhoto } = await import('../src/routes/admin/api/upload/+server');
const { load: loadUploadPage } = await import('../src/routes/admin/upload/+page.server');
const { IMAGE_SIZES } = await import('../src/lib/types');
const platform = { env: {} };

after(async () => {
	await closeDatabase();
	hooks.deregister();
	await rm(dataDir, { recursive: true, force: true });
});

test('development uploads process photographs when Cloudflare supplies an emulated platform', async () => {
	setDevelopment(true);
	const id = '32bdbf16-34db-4cc0-8b4e-490e997c90b6';
	const jpeg = await sharp({
		create: { width: 64, height: 48, channels: 3, background: '#6699bb' }
	})
		.jpeg()
		.toBuffer();
	const form = new FormData();
	form.set('file', new File([jpeg], 'Local Photograph.jpg', { type: 'image/jpeg' }));
	form.set('uploadId', id);
	form.set('description', 'A local upload');
	form.set('location', 'Test studio');
	form.set('tags', 'Local, Test');
	form.set('albums', 'Uploads');
	const request = new Request('http://localhost/admin/api/upload', {
		method: 'POST',
		body: form
	});
	const response = await uploadPhoto({ request, platform } as unknown as Parameters<
		typeof uploadPhoto
	>[0]);
	assert.equal(response.status, 201);
	const photo = await response.json();
	assert.equal(photo.id, id);
	assert.equal(photo.title, 'Local Photograph');
	assert.equal(photo.description, 'A local upload');
	assert.equal(photo.location, 'Test studio');
	assert.equal(photo.width, 64);
	assert.equal(photo.height, 48);
	assert.deepEqual(photo.tags, ['Local', 'Test']);
	assert.deepEqual(photo.albums, ['Uploads']);
	assert.match(photo.blurData, /^data:image\/jpeg;base64,/);
	assert.match(photo.titleColor, /^#[0-9a-f]{6}$/i);
	assert.ok(photo.palette.includes(photo.titleColor));
	assert.deepEqual(await getPhotoById(id), photo);

	const originalDir = path.join(dataDir, 'originals', id);
	const originals = await readdir(originalDir);
	assert.equal(originals.length, 1);
	assert.match(originals[0], /\.jpg$/);
	assert.deepEqual(await readFile(path.join(originalDir, originals[0])), jpeg);
	const derivedDir = path.join(dataDir, 'derived', id);
	const sizes = [...Object.keys(IMAGE_SIZES), 'full'];
	assert.deepEqual((await readdir(derivedDir)).sort(), sizes.map((size) => `${size}.jpg`).sort());
	for (const size of sizes) {
		const metadata = await sharp(
			await readFile(path.join(derivedDir, `${size}.jpg`))
		).metadata();
		assert.equal(metadata.format, 'jpeg');
		assert.equal(metadata.width, 64);
		assert.equal(metadata.height, 48);
	}

	const page = await loadUploadPage({ platform } as unknown as Parameters<
		typeof loadUploadPage
	>[0]);
	assert.ok(page);
	assert.equal(page.localProcessing, true);
	assert.deepEqual(page.options.albums, ['Uploads']);
});

test('production Cloudflare uploads stop before reading the file and the upload page is disabled', async () => {
	setDevelopment(false);
	try {
		const rowsBefore = await query('SELECT count(*)::int AS count FROM photos');
		let readForm = false;
		const request = new Request('https://photos.example/admin/api/upload', { method: 'POST' });
		request.formData = async () => {
			readForm = true;
			throw new Error('Cloudflare must stop before file parsing and native processing');
		};
		await assert.rejects(
			async () =>
				uploadPhoto({ request, platform } as unknown as Parameters<typeof uploadPhoto>[0]),
			(error: unknown) =>
				typeof error === 'object' &&
				error !== null &&
				'status' in error &&
				error.status === 501
		);
		assert.equal(readForm, false);
		const page = await loadUploadPage({ platform } as unknown as Parameters<
			typeof loadUploadPage
		>[0]);
		assert.ok(page);
		assert.equal(page.localProcessing, false);
		assert.deepEqual(await query('SELECT count(*)::int AS count FROM photos'), rowsBefore);
	} finally {
		setDevelopment(true);
	}
});
