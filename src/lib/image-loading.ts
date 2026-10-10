export type ImagePriority = 'high' | 'auto' | 'low';

type DecodableImage = Pick<
	HTMLImageElement,
	'src' | 'fetchPriority' | 'decoding' | 'decode' | 'naturalWidth' | 'naturalHeight'
>;

interface PreloadEntry {
	image: DecodableImage;
	promise: Promise<void>;
	pixels: number;
	priority: ImagePriority;
	pending: boolean;
}

const PRIORITY = { low: 0, auto: 1, high: 2 } as const;

/**
 * Coalesce predictive and visible requests, including their decode work.
 * Retain a small LRU of decoded derivatives; large originals are released
 * after delivery instead of pinning hundreds of megabytes in this cache.
 */
export function createImagePreloader(
	makeImage: () => DecodableImage,
	maxEntries = 8,
	maxDecodedPixels = 24_000_000
) {
	const entries = new Map<string, PreloadEntry>();

	function trim() {
		let pixels = [...entries.values()].reduce((total, entry) => total + entry.pixels, 0);
		let decodedCount = [...entries.values()].filter((entry) => !entry.pending).length;
		for (const [url, entry] of entries) {
			if (decodedCount <= maxEntries && pixels <= maxDecodedPixels) break;
			// A pending request must remain discoverable for coalescing and
			// priority promotion, even while the decoded-image LRU is full.
			if (entry.pending) continue;
			entries.delete(url);
			decodedCount--;
			pixels -= entry.pixels;
		}
	}

	return function preload(url: string, priority: ImagePriority = 'auto'): Promise<void> {
		const existing = entries.get(url);
		if (existing) {
			if (PRIORITY[priority] > PRIORITY[existing.priority]) {
				existing.priority = priority;
				existing.image.fetchPriority = priority;
			}
			entries.delete(url);
			entries.set(url, existing);
			return existing.promise;
		}

		const image = makeImage();
		image.fetchPriority = priority;
		image.decoding = 'async';
		image.src = url;
		const entry: PreloadEntry = {
			image,
			priority,
			pixels: 0,
			pending: true,
			promise: Promise.resolve()
		};
		entry.promise = image.decode().then(
			() => {
				entry.pending = false;
				entry.pixels = image.naturalWidth * image.naturalHeight;
				if (entry.pixels > maxDecodedPixels && entries.get(url) === entry)
					entries.delete(url);
				trim();
			},
			(error: unknown) => {
				// Failed speculative requests must be retryable when the photo opens.
				if (entries.get(url) === entry) entries.delete(url);
				throw error;
			}
		);
		entries.set(url, entry);
		trim();
		return entry.promise;
	};
}

export const preloadImage = createImagePreloader(() => new Image());
