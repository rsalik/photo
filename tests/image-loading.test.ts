import assert from 'node:assert/strict';
import test from 'node:test';
import { createImagePreloader, type ImagePriority } from '../src/lib/image-loading';

function deferred() {
	let resolve!: () => void;
	let reject!: (reason: Error) => void;
	const promise = new Promise<void>((yes, no) => {
		resolve = yes;
		reject = no;
	});
	return { promise, resolve, reject };
}

class FakeImage {
	src = '';
	fetchPriority: ImagePriority = 'auto';
	decoding: 'async' | 'sync' | 'auto' = 'auto';
	naturalWidth = 1600;
	naturalHeight = 1000;
	decoded = deferred();
	decode() {
		return this.decoded.promise;
	}
}

test('predictive and visible loads share decoding and promote request priority', async () => {
	const images: FakeImage[] = [];
	const load = createImagePreloader(() => {
		const image = new FakeImage();
		images.push(image);
		return image;
	});
	const predicted = load('/photo/xl', 'low');
	const visible = load('/photo/xl', 'high');
	assert.equal(predicted, visible);
	assert.equal(images.length, 1);
	assert.equal(images[0].fetchPriority, 'high');
	images[0].decoded.resolve();
	await visible;
	assert.equal(load('/photo/xl'), visible);
});

test('a failed speculative load can be retried when the photo opens', async () => {
	const images: FakeImage[] = [];
	const load = createImagePreloader(() => {
		const image = new FakeImage();
		images.push(image);
		return image;
	});
	const first = load('/photo/xl', 'low');
	images[0].decoded.reject(new Error('Temporary network failure'));
	await assert.rejects(first, /Temporary network failure/);
	const retry = load('/photo/xl', 'high');
	assert.equal(images.length, 2);
	images[1].decoded.resolve();
	await retry;
});

test('pending requests remain coalesced and promotable when decoded cache capacity is exceeded', async () => {
	const images: FakeImage[] = [];
	const load = createImagePreloader(() => {
		const image = new FakeImage();
		images.push(image);
		return image;
	}, 2);
	const first = load('/a/xl', 'low');
	const second = load('/b/xl', 'low');
	const third = load('/c/xl', 'low');
	assert.equal(load('/a/xl', 'high'), first);
	assert.equal(images.length, 3);
	assert.equal(images[0].fetchPriority, 'high');
	images.forEach((image) => image.decoded.resolve());
	await Promise.all([first, second, third]);
});

test('decoded cache evicts older images and does not retain large originals', async () => {
	const images: FakeImage[] = [];
	const load = createImagePreloader(() => {
		const image = new FakeImage();
		images.push(image);
		return image;
	}, 2);
	for (const url of ['/a/xl', '/b/xl', '/c/xl']) {
		const pending = load(url);
		images.at(-1)!.decoded.resolve();
		await pending;
	}
	const oldest = load('/a/xl');
	assert.equal(images.length, 4);
	images.at(-1)!.decoded.resolve();
	await oldest;
	const original = load('/photo/full');
	images.at(-1)!.naturalWidth = 8192;
	images.at(-1)!.naturalHeight = 5464;
	images.at(-1)!.decoded.resolve();
	await original;
	const again = load('/photo/full');
	assert.equal(images.length, 6);
	images.at(-1)!.decoded.resolve();
	await again;
});
