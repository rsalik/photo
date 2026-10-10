import assert from 'node:assert/strict';
import test from 'node:test';
import { photoLayout } from '../src/lib/photo-layout';

test('landscape phones give ordinary photos a sidebar and panoramas a footer', () => {
	for (const [width, height] of [
		[568, 320],
		[667, 375],
		[844, 390],
		[932, 430]
	]) {
		for (const [pw, ph] of [
			[6000, 4000],
			[4000, 6000],
			[4000, 4000]
		]) {
			assert.equal(photoLayout({ width: pw, height: ph }, width, height).sidebar, true);
		}
		for (const ratio of [3, 4, 6]) {
			assert.equal(
				photoLayout({ width: 4000 * ratio, height: 4000 }, width, height).sidebar,
				false
			);
		}
	}
});

test('portrait phones and tablets keep the footer; desktop portraits retain their sidebar', () => {
	const portrait = { width: 4000, height: 6000 };
	for (const [width, height] of [
		[390, 844],
		[768, 1024],
		[820, 1180]
	]) {
		assert.equal(photoLayout(portrait, width, height).sidebar, false);
	}
	assert.equal(photoLayout(portrait, 1440, 900).sidebar, true);
	assert.equal(photoLayout({ width: 6000, height: 4000 }, 1440, 900).sidebar, false);
});

test('rotating a phone recomputes the layout without previous footer measurements', () => {
	const landscape = { width: 6000, height: 4000 };
	assert.equal(photoLayout(landscape, 390, 844).sidebar, false);
	assert.equal(photoLayout(landscape, 844, 390).sidebar, true);
	assert.equal(photoLayout(landscape, 390, 844).sidebar, false);
});
