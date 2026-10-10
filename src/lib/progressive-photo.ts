import { preloadImage, type ImagePriority } from './image-loading';
import { isSharperSource, type PhotoLoadPlan, type PhotoSource } from './image-sources';

type LoadImage = (url: string, priority?: ImagePriority) => Promise<void>;

interface Request {
	priority: ImagePriority;
	status: 'pending' | 'ready' | 'failed';
	promise: Promise<void>;
}

/** Own one viewer's promotions while the shared preloader owns image fetching. */
export function createProgressivePhotoLoader(
	onReady: (photoId: string, source: PhotoSource) => void,
	loadImage: LoadImage = preloadImage
) {
	let photoId: string | undefined;
	let generation = 0;
	let current: PhotoSource;
	let target: PhotoSource | undefined;
	let targetIntermediate: PhotoSource | undefined;
	let activePlan: PhotoLoadPlan | undefined;
	let wasFull = false;
	let requests = new Map<string, Request>();

	function request(source: PhotoSource, priority: ImagePriority): Promise<void> {
		if (!isSharperSource(source, current)) return Promise.resolve();
		const existing = requests.get(source.url);
		if (existing) {
			if (
				existing.status === 'pending' &&
				priority === 'high' &&
				existing.priority !== 'high'
			) {
				existing.priority = priority;
				void loadImage(source.url, priority).catch(() => {});
			}
			return existing.promise;
		}

		const version = generation;
		const requestedPhoto = photoId!;
		const entry: Request = { priority, status: 'pending', promise: Promise.resolve() };
		entry.promise = loadImage(source.url, priority).then(
			() => {
				entry.status = 'ready';
				if (version === generation && isSharperSource(source, current)) {
					current = source;
					onReady(requestedPhoto, source);
				}
			},
			() => {
				// Keep the working preview, and avoid retrying on every zoom frame.
				entry.status = 'failed';
			}
		);
		requests.set(source.url, entry);
		return entry.promise;
	}

	function start(plan: PhotoLoadPlan) {
		const intermediate = plan.intermediate;
		const needsIntermediate = intermediate && isSharperSource(intermediate, current);
		const version = generation;
		if (needsIntermediate) {
			const middle = request(intermediate, 'high');
			// Start both immediately, giving visible sharpness first priority.
			void request(plan.final, 'auto');
			void middle.then(() => {
				if (version === generation) void request(plan.final, 'high');
			});
		} else {
			void request(plan.final, 'high');
		}
	}

	function retry() {
		let failed = false;
		for (const [url, entry] of requests) {
			if (entry.status !== 'failed') continue;
			requests.delete(url);
			failed = true;
		}
		// Retry only after a connectivity change or a fresh lightbox entry.
		// Ordinary animation/resize updates keep the same failed attempt.
		if (failed && activePlan) start(activePlan);
	}

	return {
		load(nextPhotoId: string, plan: PhotoLoadPlan, preferFull = false) {
			if (photoId !== nextPhotoId) {
				generation++;
				photoId = nextPhotoId;
				current = plan.preview;
				requests = new Map();
				target = undefined;
				targetIntermediate = undefined;
				activePlan = undefined;
				wasFull = false;
			}
			const enteringFull = preferFull && !wasFull;
			wasFull = preferFull;
			if (enteringFull) retry();
			// Shrinking the postcard must neither cancel a better pending image
			// nor start another, smaller download while that image is on its way.
			if (target && !isSharperSource(plan.final, target)) {
				if (plan.final.url !== target.url) return;
				if (
					!plan.intermediate ||
					(targetIntermediate && !isSharperSource(plan.intermediate, targetIntermediate))
				)
					return;
			}
			target = plan.final;
			targetIntermediate = plan.intermediate;
			activePlan = plan;
			start(plan);
		},
		retry,
		destroy() {
			generation++;
			requests.clear();
			activePlan = undefined;
		}
	};
}
