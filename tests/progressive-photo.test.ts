import assert from 'node:assert/strict';
import test from 'node:test';
import { createProgressivePhotoLoader } from '../src/lib/progressive-photo';
import { photoLoadPlan } from '../src/lib/image-sources';
import type { ImagePriority } from '../src/lib/image-loading';

const landscape = { id: 'landscape', width: 8192, height: 5464 };
const settle = () => new Promise<void>((resolve) => setImmediate(resolve));

function harness() {
	const pending = new Map<
		string,
		{ promise: Promise<void>; resolve: () => void; reject: () => void }
	>();
	const calls: { url: string; priority?: ImagePriority }[] = [];
	const ready: string[] = [];
	const loader = createProgressivePhotoLoader(
		(id, source) => ready.push(`${id}:${source.url}`),
		(url, priority) => {
			calls.push({ url, priority });
			if (!pending.has(url)) {
				let resolve!: () => void;
				let reject!: () => void;
				const promise = new Promise<void>((yes, no) => {
					resolve = yes;
					reject = () => no(new Error('Unavailable'));
				});
				pending.set(url, { promise, resolve, reject });
			}
			return pending.get(url)!.promise;
		}
	);
	return { loader, calls, ready, pending };
}

test('the display derivative sharpens first while the full download starts immediately', async () => {
	const h = harness();
	h.loader.load(landscape.id, photoLoadPlan(landscape, 1440, 2));
	assert.deepEqual(h.calls, [
		{ url: '/img/landscape/xl', priority: 'high' },
		{ url: '/img/landscape/full', priority: 'auto' }
	]);
	h.pending.get('/img/landscape/xl')!.resolve();
	await settle();
	assert.deepEqual(h.ready, ['landscape:/img/landscape/xl']);
	assert.deepEqual(h.calls.at(-1), { url: '/img/landscape/full', priority: 'high' });
	h.pending.get('/img/landscape/full')!.resolve();
	await settle();
	assert.deepEqual(h.ready, ['landscape:/img/landscape/xl', 'landscape:/img/landscape/full']);
});

test('a late intermediate never replaces full quality, including equal-size derivatives', async () => {
	const h = harness();
	const photo = { id: 'small', width: 1600, height: 1200 };
	h.loader.load(photo.id, photoLoadPlan(photo, 900, 2));
	h.pending.get('/img/small/full')!.resolve();
	await settle();
	h.pending.get('/img/small/lg')!.resolve();
	await settle();
	assert.deepEqual(h.ready, ['small:/img/small/full']);
});

test('a failed intermediate does not block or repeatedly restart the final image', async () => {
	const h = harness();
	const plan = photoLoadPlan(landscape, 1440, 2);
	h.loader.load(landscape.id, plan);
	h.pending.get('/img/landscape/xl')!.reject();
	await settle();
	assert.deepEqual(h.calls.at(-1), { url: '/img/landscape/full', priority: 'high' });
	h.pending.get('/img/landscape/full')!.resolve();
	await settle();
	h.loader.load(landscape.id, plan);
	assert.equal(h.calls.length, 3);
	assert.deepEqual(h.ready, ['landscape:/img/landscape/full']);
});

test('shrinking preserves the larger pending request and navigation rejects stale promotions', async () => {
	const h = harness();
	h.loader.load(landscape.id, photoLoadPlan(landscape, 1440, 2));
	h.loader.load(landscape.id, photoLoadPlan(landscape, 400, 2));
	assert.equal(h.calls.length, 2);
	const next = { ...landscape, id: 'next' };
	h.loader.load(next.id, photoLoadPlan(next, 1440, 2));
	h.pending.get('/img/landscape/xl')!.resolve();
	h.pending.get('/img/landscape/full')!.resolve();
	await settle();
	assert.deepEqual(h.ready, []);
	h.pending.get('/img/next/xl')!.resolve();
	await settle();
	assert.deepEqual(h.ready, ['next:/img/next/xl']);
	h.loader.destroy();
	h.pending.get('/img/next/full')!.resolve();
	await settle();
	assert.deepEqual(h.ready, ['next:/img/next/xl']);
});

test('failed full resolution retries once on a fresh lightbox entry, not on animation frames', async () => {
	const h = harness();
	const plan = photoLoadPlan(landscape, 1440, 2);
	h.loader.load(landscape.id, plan);
	h.pending.get('/img/landscape/xl')!.resolve();
	await settle();
	h.pending.get('/img/landscape/full')!.reject();
	await settle();
	// The real shared preloader also evicts failed promises before a retry.
	h.pending.delete('/img/landscape/full');
	for (let frame = 0; frame < 60; frame++) h.loader.load(landscape.id, plan);
	assert.equal(h.calls.length, 3);
	h.loader.load(landscape.id, plan, true);
	assert.equal(h.calls.length, 4);
	for (let frame = 0; frame < 60; frame++) h.loader.load(landscape.id, plan, true);
	assert.equal(h.calls.length, 4);
	h.pending.get('/img/landscape/full')!.resolve();
	await settle();
	assert.equal(h.ready.at(-1), 'landscape:/img/landscape/full');
});

test('connectivity recovery retries a failed final while preserving the displayed intermediate', async () => {
	const h = harness();
	h.loader.load(landscape.id, photoLoadPlan(landscape, 1440, 2));
	h.pending.get('/img/landscape/xl')!.resolve();
	await settle();
	h.pending.get('/img/landscape/full')!.reject();
	await settle();
	h.pending.delete('/img/landscape/full');
	h.loader.retry();
	assert.equal(h.calls.length, 4);
	assert.deepEqual(h.ready, ['landscape:/img/landscape/xl']);
	h.loader.retry(); // A second event while the new request is pending is inert.
	assert.equal(h.calls.length, 4);
	h.pending.get('/img/landscape/full')!.resolve();
	await settle();
	assert.equal(h.ready.at(-1), 'landscape:/img/landscape/full');
});
