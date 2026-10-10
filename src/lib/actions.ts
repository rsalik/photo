/** Scroll-reveal: fades + rises an element the first time it enters the
 *  viewport. Respects prefers-reduced-motion. Usage: `use:reveal={delayMs}` */
export function reveal(node: HTMLElement, delay = 0) {
	if (
		typeof window === 'undefined' ||
		typeof IntersectionObserver === 'undefined' ||
		window.matchMedia('(prefers-reduced-motion: reduce)').matches
	) {
		return {};
	}

	const initial = initiallyVisible(node);
	const stagger = initial ? delay : 0;
	node.style.opacity = '0';
	node.style.transform = 'translateY(16px)';
	node.style.transition = `opacity ${initial ? 0.7 : 0.25}s ease ${stagger}ms, transform ${initial ? 0.8 : 0.35}s cubic-bezier(0.22, 1, 0.36, 1) ${stagger}ms`;

	const io = new IntersectionObserver(
		([entry]) => {
			if (entry.isIntersecting) {
				node.style.opacity = '1';
				node.style.transform = 'none';
				io.disconnect();
			}
		},
		{ rootMargin: '480px 480px' }
	);
	io.observe(node);

	return {
		destroy() {
			io.disconnect();
		}
	};
}

/** Instant-film "develop-in": the frame surfaces from the milky amber fog of a
 *  developing Polaroid — low contrast under the signature warm orange cast —
 *  and clears to full colour as it scrolls into view. Deliberately quick so
 *  browsing never feels gated on the effect. Respects prefers-reduced-motion.
 *  Usage: `use:develop={delayMs}` */
export function develop(node: HTMLElement, delay = 0) {
	if (
		typeof window === 'undefined' ||
		typeof IntersectionObserver === 'undefined' ||
		window.matchMedia('(prefers-reduced-motion: reduce)').matches
	) {
		return {};
	}

	// sepia + re-saturation folds every hue toward the amber of unfinished
	// instant film; low contrast and lifted brightness give it the milky look
	const hidden =
		'sepia(0.85) saturate(1.6) hue-rotate(-12deg) contrast(0.5) brightness(1.16) blur(1.5px)';
	const initial = initiallyVisible(node);
	const stagger = initial ? delay : 0;
	node.style.opacity = '0';
	node.style.filter = hidden;
	node.style.transition = `opacity 0.35s ease ${stagger}ms, filter 0.85s cubic-bezier(0.3, 0.6, 0.2, 1) ${stagger}ms`;

	const io = new IntersectionObserver(
		([entry]) => {
			if (entry.isIntersecting) {
				node.style.opacity = '1';
				node.style.filter = 'none';
				io.disconnect();
			}
		},
		// Downloads can start ahead of time in prepareTile; the visual effect
		// waits until the frame enters view, including a clipped mobile strip.
		{ rootMargin: '0px 0px -4% 0px' }
	);
	io.observe(node);

	return {
		destroy() {
			io.disconnect();
		}
	};
}

function initiallyVisible(node: HTMLElement): boolean {
	const rect = node.getBoundingClientRect();
	return (
		rect.top < window.innerHeight &&
		rect.bottom > 0 &&
		rect.left < window.innerWidth &&
		rect.right > 0
	);
}
