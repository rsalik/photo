/** Scroll-reveal: fades + rises an element the first time it enters the
 *  viewport. Respects prefers-reduced-motion. Usage: `use:reveal={delayMs}` */
export function reveal(node: HTMLElement, delay = 0) {
	if (
		typeof window === 'undefined' ||
		window.matchMedia('(prefers-reduced-motion: reduce)').matches
	) {
		return {};
	}

	node.style.opacity = '0';
	node.style.transform = 'translateY(16px)';
	node.style.transition = `opacity 0.7s ease ${delay}ms, transform 0.8s cubic-bezier(0.22, 1, 0.36, 1) ${delay}ms`;

	const io = new IntersectionObserver(
		([entry]) => {
			if (entry.isIntersecting) {
				node.style.opacity = '1';
				node.style.transform = 'none';
				io.disconnect();
			}
		},
		{ rootMargin: '0px 0px -4% 0px' }
	);
	io.observe(node);

	return {
		destroy() {
			io.disconnect();
		}
	};
}

/** Darkroom "develop-in": the frame surfaces from a milky, low-contrast, slightly
 *  desaturated state to its full self as it scrolls into view — like a print
 *  coming up in the developer tray. Respects prefers-reduced-motion.
 *  Usage: `use:develop={delayMs}` */
export function develop(node: HTMLElement, delay = 0) {
	if (
		typeof window === 'undefined' ||
		window.matchMedia('(prefers-reduced-motion: reduce)').matches
	) {
		return {};
	}

	// starts washed-out and slightly out of focus, then resolves — like a print
	// coming up in the developer tray
	const hidden = 'contrast(0.55) brightness(1.32) saturate(0.25) sepia(0.18) blur(3px)';
	node.style.opacity = '0';
	node.style.filter = hidden;
	node.style.transform = 'scale(1.02)';
	node.style.transition =
		`opacity 0.7s ease ${delay}ms, filter 1.5s ease ${delay}ms, transform 1.5s cubic-bezier(0.22, 1, 0.36, 1) ${delay}ms`;

	const io = new IntersectionObserver(
		([entry]) => {
			if (entry.isIntersecting) {
				node.style.opacity = '1';
				node.style.filter = 'none';
				node.style.transform = 'none';
				io.disconnect();
			}
		},
		{ rootMargin: '0px 0px -4% 0px' }
	);
	io.observe(node);

	return {
		destroy() {
			io.disconnect();
		}
	};
}
