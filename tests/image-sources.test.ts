import assert from 'node:assert/strict';
import test from 'node:test';
import {
	photoSources,
	photoSourceForWidth,
	photoSrcset,
	photoLoadPlan
} from '../src/lib/image-sources';

test('small originals have unique width descriptors and preserve full quality', () => {
	const photo = { id: 'small', width: 800, height: 600 };
	assert.equal(photoSrcset(photo), '/img/small/sm 480w, /img/small/md 800w');
	assert.equal(photoSrcset(photo, true), '/img/small/sm 480w, /img/small/full 800w');
});

test('portrait candidates describe their actual width, not their longest edge', () => {
	const sources = photoSources({ id: 'portrait', width: 4000, height: 6000 }, true);
	assert.deepEqual(
		sources.map(({ width }) => width),
		[320, 640, 1067, 1707, 4000]
	);
	assert.equal(photoSourceForWidth(sources, 900, 2).url, '/img/portrait/full');
});

test('postcard width selects the sharp source needed for the transformed image', () => {
	const sources = photoSources({ id: 'landscape', width: 6000, height: 4000 }, true);
	// A 1440 × 900 viewport uses a ~1056px settled image but a 1440px postcard.
	assert.equal(photoSourceForWidth(sources, 1056, 2).url, '/img/landscape/xl');
	assert.equal(photoSourceForWidth(sources, 1440, 2).url, '/img/landscape/full');
});

test('source selection stays stable within a derivative and caps zoom at full resolution', () => {
	const sources = photoSources({ id: 'landscape', width: 6000, height: 4000 }, true);
	assert.equal(photoSourceForWidth(sources, 1000), photoSourceForWidth(sources, 1400));
	assert.equal(photoSourceForWidth(sources, 1600).url, '/img/landscape/lg');
	assert.equal(photoSourceForWidth(sources, 1601).url, '/img/landscape/xl');
	assert.equal(photoSourceForWidth(sources, 20000, 2).url, '/img/landscape/full');
});

test('a Retina postcard bridges directly through xl while full resolution downloads', () => {
	const plan = photoLoadPlan({ id: 'landscape', width: 8192, height: 5464 }, 1440, 2);
	assert.equal(plan.preview.url, '/img/landscape/md');
	assert.equal(plan.intermediate?.url, '/img/landscape/xl');
	assert.equal(plan.final.url, '/img/landscape/full');
});

test('lightbox requests full resolution even when a resized image fits its viewport', () => {
	const photo = { id: 'portrait', width: 5145, height: 7714 };
	const postcard = photoLoadPlan(photo, 564, 2);
	assert.equal(postcard.final.url, '/img/portrait/xl');
	assert.equal(postcard.intermediate, undefined);
	const lightbox = photoLoadPlan(photo, 564, 2, true);
	assert.equal(lightbox.final.url, '/img/portrait/full');
	assert.equal(lightbox.intermediate?.url, '/img/portrait/xl');
});

test('an intermediate is omitted when the medium preview already meets display demand', () => {
	const plan = photoLoadPlan({ id: 'large', width: 6000, height: 4000 }, 400, 2, true);
	assert.equal(plan.final.url, '/img/large/full');
	assert.equal(plan.intermediate, undefined);
	const small = photoLoadPlan({ id: 'small', width: 800, height: 600 }, 400, 2, true);
	assert.equal(small.final.url, '/img/small/full');
	assert.equal(small.intermediate, undefined);
});
