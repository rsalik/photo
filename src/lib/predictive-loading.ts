import { preloadImage } from './image-loading';
import { photoSourceForWidth, photoSources } from './image-sources';
import { PreloadQueue } from './preload-queue';
import type { Photo } from './types';

interface Connection {
	saveData?: boolean;
	effectiveType?: string;
	downlink?: number;
}

/** Save bandwidth for the current view when the browser reports a slow link. */
export function permitsPreloading(connection?: Connection): boolean {
	return !(
		connection?.saveData ||
		/^(slow-2g|2g|3g)$/.test(connection?.effectiveType ?? '') ||
		(connection?.downlink !== undefined && connection.downlink < 1.5)
	);
}

function canPreload(): boolean {
	return (
		typeof navigator !== 'undefined' &&
		permitsPreloading((navigator as Navigator & { connection?: Connection }).connection)
	);
}

const queue = new PreloadQueue();

interface TileOptions {
	id: string;
	/** Horizontal film strips explicitly identify the next frames to prepare. */
	nearby?: boolean;
}

/** Start the actual responsive image before it enters the viewport. */
export function prepareTile(node: HTMLImageElement, options: TileOptions) {
	let nearby = options.nearby ?? false;
	let intersecting = false;
	let cancel: (() => void) | undefined;
	let observer: IntersectionObserver | undefined;
	let id = options.id;
	let destroyed = false;

	function schedule() {
		if (!canPreload() || (node.complete && node.naturalWidth > 0)) return;
		const rect = node.getBoundingClientRect();
		const visible =
			rect.top < window.innerHeight &&
			rect.bottom > 0 &&
			rect.left < window.innerWidth &&
			rect.right > 0;
		cancel = queue.add(
			node,
			async () => {
				if (destroyed || !node.isConnected || (!intersecting && !nearby) || !canPreload())
					return;
				// Keep the browser's srcset selection, rather than downloading a second
				// guessed size. Existing eager images and native lazy loads can be reused.
				node.loading = 'eager';
				await node.decode();
			},
			visible ? 3 : nearby ? 1 : 0
		);
	}

	if (typeof IntersectionObserver !== 'undefined') {
		observer = new IntersectionObserver(
			([entry]) => {
				intersecting = entry.isIntersecting;
				if (intersecting || nearby) schedule();
				else cancel?.();
			},
			{ rootMargin: '800px 500px' }
		);
		observer.observe(node);
	}
	if (nearby) schedule();

	const loaded = () => {
		cancel?.();
		observer?.unobserve(node);
	};
	node.addEventListener('load', loaded);

	return {
		update(next: TileOptions) {
			if (id !== next.id) {
				cancel?.();
				id = next.id;
				observer?.observe(node);
			}
			nearby = next.nearby ?? false;
			if (nearby || intersecting) schedule();
			else cancel?.();
		},
		destroy() {
			destroyed = true;
			cancel?.();
			observer?.disconnect();
			node.removeEventListener('load', loaded);
		}
	};
}

type ImagePhoto = Pick<Photo, 'id' | 'width' | 'height'>;

/** Match the postcard's cover/contain geometry, capped at existing derivatives. */
export function detailPreviewSource(
	photo: ImagePhoto,
	width: number,
	height: number,
	dpr: number
): string {
	const aspect = photo.width / photo.height;
	const matchingOrientation = photo.width >= photo.height === width >= height;
	const displayedWidth = matchingOrientation
		? Math.max(width, height * aspect)
		: Math.min(width * 0.94, height * 0.94 * aspect);
	return photoSourceForWidth(photoSources(photo), displayedWidth, dpr).url;
}

/** Hover, keyboard focus and touch intent warm the likely next photograph. */
export function photoIntent(node: HTMLAnchorElement, photo: ImagePhoto) {
	let current = photo;
	let timer: ReturnType<typeof setTimeout> | undefined;
	let cancel: (() => void) | undefined;
	let destroyed = false;
	let touchOrigin: { x: number; y: number } | undefined;

	function warm() {
		if (!canPreload() || destroyed) return;
		const url = detailPreviewSource(
			current,
			window.innerWidth,
			window.innerHeight,
			window.devicePixelRatio || 1
		);
		cancel = queue.add(
			node,
			async () => {
				if (!destroyed && canPreload()) await preloadImage(url, 'low');
			},
			2
		);
	}
	function enter(event: PointerEvent) {
		if (event.pointerType === 'touch') return;
		clearTimeout(timer);
		timer = setTimeout(warm, 100);
	}
	function immediate() {
		clearTimeout(timer);
		warm();
	}
	function leave() {
		clearTimeout(timer);
		cancel?.();
	}
	function touchStart(event: TouchEvent) {
		leave();
		touchOrigin = undefined;
		if (event.touches.length !== 1) return;
		const touch = event.touches[0];
		touchOrigin = { x: touch.clientX, y: touch.clientY };
		// A finger landing during a scroll is not navigation intent. Wait for a
		// stationary dwell or a completed tap; movement cancels queued work.
		timer = setTimeout(warm, 120);
	}
	function touchMove(event: TouchEvent) {
		const touch = event.touches[0];
		if (
			touchOrigin &&
			(!touch || Math.hypot(touch.clientX - touchOrigin.x, touch.clientY - touchOrigin.y) > 8)
		) {
			touchOrigin = undefined;
			leave();
		}
	}
	function touchEnd() {
		if (touchOrigin) immediate();
		touchOrigin = undefined;
	}
	function touchCancel() {
		touchOrigin = undefined;
		leave();
	}
	function pointerDown(event: PointerEvent) {
		if (event.pointerType !== 'touch') immediate();
	}
	node.addEventListener('pointerenter', enter);
	node.addEventListener('pointerleave', leave);
	node.addEventListener('focus', immediate);
	node.addEventListener('blur', leave);
	node.addEventListener('touchstart', touchStart, { passive: true });
	node.addEventListener('touchmove', touchMove, { passive: true });
	node.addEventListener('touchend', touchEnd, { passive: true });
	node.addEventListener('touchcancel', touchCancel, { passive: true });
	node.addEventListener('pointerdown', pointerDown);

	return {
		update(next: ImagePhoto) {
			touchCancel();
			current = next;
		},
		destroy() {
			destroyed = true;
			touchCancel();
			node.removeEventListener('pointerenter', enter);
			node.removeEventListener('pointerleave', leave);
			node.removeEventListener('focus', immediate);
			node.removeEventListener('blur', leave);
			node.removeEventListener('touchstart', touchStart);
			node.removeEventListener('touchmove', touchMove);
			node.removeEventListener('touchend', touchEnd);
			node.removeEventListener('touchcancel', touchCancel);
			node.removeEventListener('pointerdown', pointerDown);
		}
	};
}
