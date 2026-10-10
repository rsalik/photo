import assert from 'node:assert/strict';
import { afterEach, beforeEach, test } from 'node:test';
import {
	detailPreviewSource,
	permitsPreloading,
	photoIntent,
	prepareTile
} from '../src/lib/predictive-loading';
import { develop } from '../src/lib/actions';
import { PreloadQueue } from '../src/lib/preload-queue';

const flush = () => new Promise<void>((resolve) => setImmediate(resolve));
const deferred = () => {
	let resolve!: () => void;
	const promise = new Promise<void>((done) => {
		resolve = done;
	});
	return { promise, resolve };
};

const originals = new Map<string, PropertyDescriptor | undefined>();
const observers: TestObserver[] = [];
const requests: string[] = [];
let saveData = false;

class TestObserver {
	constructor(
		readonly callback: IntersectionObserverCallback,
		readonly options?: IntersectionObserverInit
	) {
		observers.push(this);
	}
	observe() {}
	unobserve() {}
	disconnect() {}
	enter() {
		this.callback(
			[{ isIntersecting: true } as IntersectionObserverEntry],
			this as unknown as IntersectionObserver
		);
	}
}

beforeEach(() => {
	observers.length = 0;
	requests.length = 0;
	saveData = false;
	const globals = {
		window: {
			innerWidth: 390,
			innerHeight: 844,
			devicePixelRatio: 3,
			matchMedia: () => ({ matches: false })
		},
		navigator: {
			get connection() {
				return { saveData };
			}
		},
		IntersectionObserver: TestObserver,
		Image: class {
			src = '';
			fetchPriority = 'auto';
			decoding = 'auto';
			naturalWidth = 1600;
			naturalHeight = 1067;
			async decode() {
				requests.push(this.src);
			}
		}
	};
	for (const [key, value] of Object.entries(globals)) {
		originals.set(key, Object.getOwnPropertyDescriptor(globalThis, key));
		Object.defineProperty(globalThis, key, { value, configurable: true });
	}
});

afterEach(() => {
	for (const [key, descriptor] of originals) {
		if (descriptor) Object.defineProperty(globalThis, key, descriptor);
		else Reflect.deleteProperty(globalThis, key);
	}
	originals.clear();
});

test('speculative queue bounds concurrency, prioritizes intent and drops excess work', async () => {
	const queue = new PreloadQueue(1, 2);
	const first = deferred();
	const calls: string[] = [];
	queue.add('active', async () => {
		calls.push('active');
		await first.promise;
	});
	queue.add('nearby', async () => {
		calls.push('nearby');
	});
	queue.add('distant', async () => {
		calls.push('distant');
	});
	queue.add(
		'intent',
		async () => {
			calls.push('intent');
		},
		2
	);
	await flush();
	assert.deepEqual(calls, ['active']);
	first.resolve();
	await flush();
	assert.deepEqual(calls, ['active', 'intent', 'nearby']);
});

test('leaving a queued target cancels it and failed requests do not block the queue', async () => {
	const queue = new PreloadQueue(1, 3);
	const first = deferred();
	const calls: string[] = [];
	queue.add('active', () => first.promise);
	const cancel = queue.add('cancelled', async () => {
		calls.push('cancelled');
	});
	queue.add('failure', async () => {
		throw new Error('offline');
	});
	queue.add('next', async () => {
		calls.push('next');
	});
	cancel();
	first.resolve();
	await flush();
	assert.deepEqual(calls, ['next']);
});

test('preloading respects save-data and reported slow connections', () => {
	assert.equal(permitsPreloading(), true);
	assert.equal(permitsPreloading({ effectiveType: '4g', downlink: 10 }), true);
	for (const connection of [
		{ saveData: true },
		{ effectiveType: 'slow-2g' },
		{ effectiveType: '2g' },
		{ effectiveType: '3g' },
		{ downlink: 0.8 }
	]) {
		assert.equal(permitsPreloading(connection), false);
	}
});

test('intent picks an existing derivative appropriate to postcard orientation, never full', () => {
	const landscape = { id: 'landscape', width: 8192, height: 5464 };
	const portrait = { id: 'portrait', width: 5464, height: 8192 };
	assert.equal(detailPreviewSource(landscape, 390, 844, 3), '/img/landscape/lg');
	assert.equal(detailPreviewSource(portrait, 390, 844, 3), '/img/portrait/xl');
	assert.equal(detailPreviewSource(landscape, 2560, 1440, 2), '/img/landscape/xl');
});

function tile() {
	let decodes = 0;
	const node = Object.assign(new EventTarget(), {
		complete: false,
		naturalWidth: 0,
		loading: 'lazy',
		isConnected: true,
		getBoundingClientRect: () => ({ top: 1000, bottom: 1200, left: 0, right: 300 }),
		async decode() {
			decodes++;
		}
	}) as unknown as HTMLImageElement;
	return { node, decodes: () => decodes };
}

test('approaching tiles prepare their actual responsive element before visibility', async () => {
	const { node, decodes } = tile();
	const action = prepareTile(node, { id: 'nearby' });
	assert.equal(node.loading, 'lazy');
	assert.equal(observers[0].options?.rootMargin, '800px 500px');
	observers[0].enter();
	await flush();
	assert.equal(node.loading, 'eager');
	assert.equal(decodes(), 1);
	action.destroy();
});

test('mobile strip hints prepare clipped upcoming frames and save-data suppresses speculation', async () => {
	const first = tile();
	const action = prepareTile(first.node, { id: 'strip', nearby: false });
	action.update({ id: 'strip', nearby: true });
	await flush();
	assert.equal(first.decodes(), 1);
	action.destroy();
	saveData = true;
	const second = tile();
	const skipped = prepareTile(second.node, { id: 'save-data', nearby: true });
	observers[1].enter();
	await flush();
	assert.equal(second.decodes(), 0);
	assert.equal(second.node.loading, 'lazy');
	skipped.destroy();
});

test('keyboard intent warms the next photo and action cleanup removes listeners', async () => {
	const node = new EventTarget() as HTMLAnchorElement;
	const action = photoIntent(node, { id: 'focus-intent', width: 8192, height: 5464 });
	node.dispatchEvent(new Event('focus'));
	await flush();
	assert.deepEqual(requests, ['/img/focus-intent/lg']);
	action.destroy();
	node.dispatchEvent(new Event('focus'));
	await flush();
	assert.equal(requests.length, 1);
});

test('scrolling a finger across a tile does not preload a detail image, but a tap does', async () => {
	const node = new EventTarget() as HTMLAnchorElement;
	const action = photoIntent(node, { id: 'touch-intent', width: 8192, height: 5464 });
	const touchEvent = (type: string, x: number, y: number) =>
		Object.assign(new Event(type), {
			touches: [{ clientX: x, clientY: y }]
		});
	node.dispatchEvent(Object.assign(new Event('pointerdown'), { pointerType: 'touch' }));
	node.dispatchEvent(touchEvent('touchstart', 20, 20));
	node.dispatchEvent(touchEvent('touchmove', 20, 50));
	node.dispatchEvent(new Event('touchend'));
	await flush();
	assert.deepEqual(requests, []);
	node.dispatchEvent(touchEvent('touchstart', 20, 20));
	node.dispatchEvent(new Event('touchend'));
	await flush();
	assert.deepEqual(requests, ['/img/touch-intent/lg']);
	action.destroy();
});

test('preloaded film stays undeveloped until its clipped frame enters view', async () => {
	const image = tile();
	const loading = prepareTile(image.node, { id: 'develop-ahead', nearby: true });
	const node = {
		style: {} as CSSStyleDeclaration,
		getBoundingClientRect: () => ({ top: 0, bottom: 188, left: 900, right: 1200 })
	} as unknown as HTMLElement;
	const action = develop(node, 360);
	assert.equal(observers[1].options?.rootMargin, '0px 0px -4% 0px');
	assert.match(node.style.transition, /filter 0\.85s/);
	assert.doesNotMatch(node.style.transition, /360ms/);
	await flush();
	assert.equal(image.decodes(), 1);
	assert.equal(image.node.loading, 'eager');
	assert.equal(node.style.opacity, '0');
	assert.match(node.style.filter, /sepia/);
	observers[1].enter();
	assert.equal(node.style.opacity, '1');
	assert.equal(node.style.filter, 'none');
	action.destroy?.();
	loading.destroy();
});

test('film development keeps the initial stagger and respects reduced motion', () => {
	const node = {
		style: {} as CSSStyleDeclaration,
		getBoundingClientRect: () => ({ top: 0, bottom: 188, left: 0, right: 300 })
	} as unknown as HTMLElement;
	const action = develop(node, 100);
	assert.match(node.style.transition, /filter 0\.85s .* 100ms/);
	action.destroy?.();

	window.matchMedia = () => ({ matches: true }) as MediaQueryList;
	const still = { ...node, style: {} as CSSStyleDeclaration };
	develop(still);
	assert.deepEqual(still.style, {});
	assert.equal(observers.length, 1);
});
