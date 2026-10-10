<script lang="ts">
	import { untrack } from 'svelte';
	import { on } from 'svelte/events';
	import { goto } from '$app/navigation';
	import { browser } from '$app/environment';
	import { FAVORITE_TAG } from '$lib/types';
	import { cameraLabel } from '$lib/camera';
	import { photoDate, photoDateTime } from '$lib/dates';
	import { focalRangeText, galleryHref, galleryPhotoQuery } from '$lib/filters';
	import { consumeMorph } from '$lib/morph';
	import { photoIntent } from '$lib/predictive-loading';
	import { immersiveChrome } from '$lib/immersive-chrome';
	import { photoLayout, PHOTO_HEADER_HEIGHT, PHOTO_MARGIN } from '$lib/photo-layout';
	import { palette } from '$lib/palette-state.svelte';
	import Icon, { type IconName } from '$lib/components/Icon.svelte';
	import PreviewLink from '$lib/components/PreviewLink.svelte';
	import ProgressivePhoto from '$lib/components/ProgressivePhoto.svelte';
	import Postmark from '$lib/components/Postmark.svelte';
	import TickerText from '$lib/components/TickerText.svelte';
	import Tooltip from '$lib/components/Tooltip.svelte';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();
	const photo = $derived(data.photo);

	// when a gallery frame was clicked it sets this flag; the image then shares a
	// view-transition-name so the frame zooms into the photo (see +layout onNavigate)
	const morphIn = browser && consumeMorph();
	const reduceMotion = browser && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

	/* ------------------------------------------------------------------ state */
	let vw = $state(browser ? window.innerWidth : 0);
	let vh = $state(browser ? window.innerHeight : 0);
	let footerH = $state(132);
	const HEADER_H = PHOTO_HEADER_HEIGHT;
	const M = PHOTO_MARGIN;

	type Phase = 'intro' | 'settling' | 'done';
	let phase = $state<Phase>('intro');
	// the postcard intro plays only on the first view (gallery → photo). Walking
	// between photos keeps this component mounted, so subsequent loads skip it.
	let firstLoad = true;
	let titleVisible = $state(false);
	let timers: ReturnType<typeof setTimeout>[] = [];

	/* "Postcard match": photo orientation matches the viewport's */
	const isMatch = $derived(
		vw && vh ? photo.width >= photo.height === vw >= vh : photo.width >= photo.height
	);

	const layout = $derived(photoLayout(photo, vw, vh));
	const sideMode = $derived(layout.sidebar);
	const compactLandscape = $derived(layout.compact);
	const sidebarWidth = $derived(layout.sidebarWidth);

	/* ----------------------------------------------------------- geometry
	   The image is laid out ONCE at its settled position; every animated
	   state (postcard intro, fullscreen) is a pure `transform` from there,
	   so animation does not repeatedly lay out the photograph. */
	interface Box {
		w: number;
		h: number;
		cx: number;
		cy: number;
	}

	const fit = (
		boxW: number,
		boxH: number,
		mode: 'contain' | 'cover'
	): { w: number; h: number } => {
		const { width: pw, height: ph } = photo;
		const scale = (mode === 'contain' ? Math.min : Math.max)(boxW / pw, boxH / ph);
		return { w: pw * scale, h: ph * scale };
	};

	const settled = $derived.by((): Box => {
		const w = vw || 1280;
		const h = vh || 800;
		if (sideMode) {
			const availW = Math.max(1, w - sidebarWidth - M * 2);
			return { ...fit(availW, h - M * 2, 'contain'), cx: M + availW / 2, cy: h / 2 };
		}
		const availH = Math.max(1, h - HEADER_H - footerH - M * 2);
		return { ...fit(w - M * 2, availH, 'contain'), cx: w / 2, cy: HEADER_H + M + availH / 2 };
	});

	const introBox = $derived.by((): Box => {
		const w = vw || 1280;
		const h = vh || 800;
		const size = isMatch ? fit(w, h, 'cover') : fit(w * 0.94, h * 0.94, 'contain');
		return { ...size, cx: w / 2, cy: h / 2 };
	});

	const fullscreenBox = $derived.by((): Box => {
		const w = vw || 1280;
		const h = vh || 800;
		return { ...fit(w, h, 'contain'), cx: w / 2, cy: h / 2 };
	});

	/* ----------------------------------------------------------- lightbox
	   The photo page doubles as a lightbox. Desktop: click the photo to fill
	   the screen, wheel to zoom toward the cursor, drag to pan, click again to
	   step back out (or click the paper margin / press Esc to close); the
	   scroll wheel still eases between settled and fullscreen, and holding
	   Shift peeks at the fit view. Mobile follows learned gestures: tap
	   toggles the immersive view, double-tap zooms at the tap point, pinch
	   zooms at the pinch, one finger pans while zoomed, horizontal swipes walk
	   the gallery set, and a downward swipe closes the lightbox.

	   Boundary gate (Fit↔Zoom): macOS trackpad inertia sends wheel events
	   continuously for seconds with inter-event gaps as short as ~8ms, making
	   a pure time-gap approach unreliable: too low and inertia overshoots into
	   zoom; too high and you get stuck waiting for inertia to die. Instead we
	   track an exponential moving average (EMA) of |deltaY|. Inertia has
	   monotonically *decreasing* deltas so the EMA decays in step and no
	   single event ever spikes above it. A fresh deliberate scroll starts with
	   a large delta that easily exceeds the decayed EMA — that spike is the
	   gate signal. A short cooldown (BOUNDARY_COOLDOWN_MS) after first
	   arriving at the boundary prevents even genuine spikes during the very
	   first moments of inertia from crossing. */
	const MAX_ZOOM = 3.5;
	const CLICK_ZOOM = 2.6; // click / double-tap magnification
	const BOUNDARY_COOLDOWN_MS = 100; // hard minimum wait at the fit boundary
	const EMA_ALPHA = 0.25; // smoothing factor for |delta| tracker
	const SPIKE_RATIO = 2.0; // current |d| must exceed EMA × this to cross
	let fsShown = $state(0); // animated 0..1  (Default → Zoom-to-Fit)
	let zoomShown = $state(1); // animated 1..MAX_ZOOM (Zoom-to-Fit → Zoom Detail)
	let panShown = $state({ x: 0, y: 0 });
	let fsTarget = $state(0);
	let zoomTarget = $state(1);
	let panTarget = { x: 0, y: 0 };
	let fsRaf = 0;
	let shiftHolding = false;
	let shiftDownAt = 0;
	let imgWrapEl = $state<HTMLElement>();
	// Boundary gate state
	let atBoundary = false; // true while sitting at fsTarget≈1 absorbing scroll-down
	let boundaryEnteredAt = 0; // timestamp when we first hit the boundary
	let deltaEma = 0; // EMA of |delta| — tracks inertia decay
	let lastWheelAt = 0; // for time-decay of EMA when events are sparse

	function startFsLoop() {
		if (reduceMotion) {
			fsShown = fsTarget;
			zoomShown = zoomTarget;
			panShown = { ...panTarget };
			return;
		}
		if (!fsRaf && phase === 'done') fsTick();
	}

	function fsTick() {
		fsRaf = requestAnimationFrame(() => {
			// holding Shift snaps the target to fit after a short dead zone (so a
			// quick double-tap palette shortcut shows no motion); the same easing
			// below drives it, making shift zoom-in and zoom-out symmetric in speed
			if (shiftHolding) {
				fsTarget = performance.now() - shiftDownAt > 130 ? 1 : 0;
			}
			const step = (current: number, target: number, factor = 0.16) =>
				Math.abs(target - current) < 0.003 ? target : current + (target - current) * factor;
			const fsFactor = shiftHolding && fsTarget > fsShown ? 0.28 : 0.16;
			fsShown = step(fsShown, fsTarget, fsFactor);
			zoomShown = step(zoomShown, zoomTarget);
			panShown = { x: step(panShown.x, panTarget.x), y: step(panShown.y, panTarget.y) };
			const idle =
				!shiftHolding &&
				fsShown === fsTarget &&
				zoomShown === zoomTarget &&
				panShown.x === panTarget.x &&
				panShown.y === panTarget.y;
			if (idle) {
				fsRaf = 0;
				return;
			}
			fsTick();
		});
	}

	function exitFullscreen() {
		fsTarget = 0;
		zoomTarget = 1;
		panTarget = { x: 0, y: 0 };
		atBoundary = false;
		deltaEma = 0;
		startFsLoop();
	}

	/** clamp the pan so the photo edge never leaves the screen edge */
	function clampPan(zoom = zoomTarget) {
		const bx = Math.max(0, (fullscreenBox.w * zoom - (vw || 1280)) / 2);
		const by = Math.max(0, (fullscreenBox.h * zoom - (vh || 800)) / 2);
		panTarget = {
			x: Math.max(-bx, Math.min(bx, panTarget.x)),
			y: Math.max(-by, Math.min(by, panTarget.y))
		};
	}

	/** step back from Zoom Detail to the fit view, re-arming the boundary gate */
	function resetZoom() {
		zoomTarget = 1;
		panTarget = { x: 0, y: 0 };
		atBoundary = true;
		boundaryEnteredAt = performance.now();
		startFsLoop();
	}

	/** zoom toward a screen point so the pixel under it stays put — the one
	 *  invariant every familiar lightbox shares. `snap` skips the easing for
	 *  gestures that must track the fingers 1:1. */
	function zoomAt(clientX: number, clientY: number, factor: number, snap = false) {
		const z = Math.max(1, zoomTarget);
		const z2 = Math.min(MAX_ZOOM, Math.max(1, z * factor));
		const cx = clientX - (vw || 1280) / 2;
		const cy = clientY - (vh || 800) / 2;
		panTarget = {
			x: cx - ((cx - panTarget.x) * z2) / z,
			y: cy - ((cy - panTarget.y) * z2) / z
		};
		zoomTarget = z2;
		if (z2 <= 1.005) {
			zoomTarget = 1;
			panTarget = { x: 0, y: 0 };
		}
		clampPan();
		if (snap) {
			zoomShown = zoomTarget;
			panShown = { ...panTarget };
		}
		startFsLoop();
	}

	function onWheel(e: WheelEvent) {
		if (phase !== 'done') return;
		// let the chrome (footer metadata, sidebar) scroll natively instead of
		// hijacking the wheel for fullscreen when the pointer is over it
		if ((e.target as HTMLElement | null)?.closest('footer, header, aside')) return;
		// don't swallow horizontal gestures — the browser uses them for back/forward
		// swipe; only vertical wheel drives the fullscreen/zoom behaviour
		if (Math.abs(e.deltaX) > Math.abs(e.deltaY)) return;
		e.preventDefault();
		const d = e.deltaY * 0.0016;
		const absD = Math.abs(d);
		const now = performance.now();

		// Time-decay the EMA when events are sparse (covers the gap between
		// inertia dying out and the user scrolling again)
		const elapsed = now - lastWheelAt;
		if (elapsed > 30) {
			const decay = Math.pow(1 - EMA_ALPHA, elapsed / 16);
			deltaEma *= decay;
		}
		lastWheelAt = now;

		// Update the EMA with this event's magnitude
		deltaEma = deltaEma * (1 - EMA_ALPHA) + absD * EMA_ALPHA;

		if (zoomTarget > 1) {
			// Already in Zoom Detail — zoom toward the cursor
			zoomAt(e.clientX, e.clientY, 1 + d);
			if (zoomTarget <= 1) {
				// re-arm the gate so scrolling down again requires a fresh gesture
				atBoundary = true;
				boundaryEnteredAt = now;
			}
		} else if (fsTarget >= 1 && d > 0) {
			// At the fit boundary, scrolling down (toward zoom)
			if (!atBoundary) {
				// Just arrived at the boundary
				atBoundary = true;
				boundaryEnteredAt = now;
			} else {
				// Gate check: allow crossing into zoom if cooldown has passed
				// AND the current delta spikes above the EMA (indicating fresh
				// active input, not decaying inertia)
				const cooledDown = now - boundaryEnteredAt > BOUNDARY_COOLDOWN_MS;
				const spiked = absD > deltaEma * SPIKE_RATIO;
				if (cooledDown && spiked) {
					atBoundary = false;
					zoomAt(e.clientX, e.clientY, 1 + d);
				}
				// else: absorb the event (inertia dies out harmlessly)
			}
		} else {
			// Default→Fit range, or scrolling up from the boundary
			if (d < 0 && atBoundary) {
				atBoundary = false;
			}
			fsTarget = Math.max(0, Math.min(1, fsTarget + d));
			if (fsTarget < 1) atBoundary = false;
		}

		startFsLoop();
	}

	/* --------------------------------------------------- mouse: click + drag
	   A drag pans the zoomed photo 1:1 under the hand; anything under the
	   movement threshold is a click, which steps the lightbox: settled → fit,
	   fit → zoom at the cursor (photo) or close (margin), zoomed → fit. */
	let mouseDrag: { sx: number; sy: number; lx: number; ly: number; moved: boolean } | null = null;

	function onPointerDown(e: PointerEvent) {
		if (e.pointerType !== 'mouse' || e.button !== 0 || phase !== 'done') return;
		if ((e.target as Element).closest('footer, header, aside')) return;
		mouseDrag = { sx: e.clientX, sy: e.clientY, lx: e.clientX, ly: e.clientY, moved: false };
	}

	function onPointerMove(e: PointerEvent) {
		if (e.pointerType !== 'mouse' || !mouseDrag) return;
		if (!(e.buttons & 1)) {
			// the press ended outside the window — a pointerup we never received
			mouseDrag = null;
			return;
		}
		if (
			!mouseDrag.moved &&
			Math.hypot(e.clientX - mouseDrag.sx, e.clientY - mouseDrag.sy) > 4
		) {
			mouseDrag.moved = true;
		}
		if (mouseDrag.moved && zoomTarget > 1) {
			panTarget = {
				x: panTarget.x + e.clientX - mouseDrag.lx,
				y: panTarget.y + e.clientY - mouseDrag.ly
			};
			clampPan();
			panShown = { ...panTarget };
			startFsLoop();
		}
		mouseDrag.lx = e.clientX;
		mouseDrag.ly = e.clientY;
	}

	function onPointerUp(e: PointerEvent) {
		if (e.pointerType !== 'mouse' || !mouseDrag) return;
		const wasDrag = mouseDrag.moved;
		mouseDrag = null;
		if (wasDrag || phase !== 'done') return;
		if (zoomTarget > 1) {
			resetZoom();
		} else if (fsTarget >= 1) {
			if (imgWrapEl?.contains(e.target as Node)) zoomAt(e.clientX, e.clientY, CLICK_ZOOM);
			else exitFullscreen(); // the paper margin acts as the lightbox backdrop
		} else {
			fsTarget = 1;
			atBoundary = false;
			startFsLoop();
		}
	}

	/* --------------------------------------------------------- touch gestures
	   One state machine, resolved by what the fingers do: two fingers pinch
	   (zoom anchored at the midpoint, which also drags the pan), one finger
	   pans when zoomed and swipes when not — horizontal to walk the gallery
	   set, downward to close — and anything that never moves is a tap: single
	   toggles the immersive view, double zooms at the tap point. */
	interface TouchGesture {
		mode: 'tap' | 'pan' | 'pinch' | 'swipe';
		sx: number;
		sy: number;
		lx: number;
		ly: number;
		dist: number;
		mx: number;
		my: number;
		dx: number;
		dy: number;
	}
	let gesture: TouchGesture | null = null;
	let singleTapTimer: ReturnType<typeof setTimeout> | undefined;
	let lastTapAt = 0;
	let lastTapPos = { x: 0, y: 0 };

	/* Svelte registers `ontouchstart`/`ontouchmove` attribute handlers as passive,
	   which silently discards the preventDefault() the pan/pinch gestures rely on —
	   the browser keeps scrolling / rubber-banding / pinch-zooming the page while
	   the photo tries to pan underneath. Attach them explicitly as non-passive. */
	function touchGestures(node: HTMLElement) {
		const offs = [
			on(node, 'touchstart', onTouchStart, { passive: false }),
			on(node, 'touchmove', onTouchMove, { passive: false })
		];
		return { destroy: () => offs.forEach((off) => off()) };
	}

	function touchDist(t: TouchList) {
		return Math.hypot(t[0].clientX - t[1].clientX, t[0].clientY - t[1].clientY);
	}
	function touchMid(t: TouchList) {
		return { x: (t[0].clientX + t[1].clientX) / 2, y: (t[0].clientY + t[1].clientY) / 2 };
	}

	function onTouchStart(e: TouchEvent) {
		if (phase !== 'done') return;
		if ((e.target as Element).closest('footer, header, aside')) return;
		if (e.touches.length === 2) {
			e.preventDefault();
			clearTimeout(singleTapTimer); // a pinch is never a tap
			lastTapAt = 0;
			if (fsTarget < 1) {
				// a pinch implies the immersive view; snap so zoom reads from 1×
				fsTarget = 1;
				fsShown = 1;
			}
			atBoundary = false;
			const m = touchMid(e.touches);
			gesture = {
				mode: 'pinch',
				sx: 0,
				sy: 0,
				lx: 0,
				ly: 0,
				dist: touchDist(e.touches),
				mx: m.x,
				my: m.y,
				dx: 0,
				dy: 0
			};
		} else if (e.touches.length === 1 && !gesture) {
			const t = e.touches[0];
			gesture = {
				mode: 'tap',
				sx: t.clientX,
				sy: t.clientY,
				lx: t.clientX,
				ly: t.clientY,
				dist: 0,
				mx: 0,
				my: 0,
				dx: 0,
				dy: 0
			};
		}
	}

	function onTouchMove(e: TouchEvent) {
		if (!gesture) return;
		if (gesture.mode === 'pinch') {
			if (e.touches.length !== 2) return;
			e.preventDefault();
			const d = touchDist(e.touches);
			const m = touchMid(e.touches);
			zoomAt(m.x, m.y, d / (gesture.dist || d), true);
			// the midpoint's travel drags the pan along — two-finger pan
			panTarget = { x: panTarget.x + m.x - gesture.mx, y: panTarget.y + m.y - gesture.my };
			clampPan();
			panShown = { ...panTarget };
			gesture.dist = d;
			gesture.mx = m.x;
			gesture.my = m.y;
			startFsLoop();
			return;
		}
		const t = e.touches[0];
		if (!t) return;
		const dx = t.clientX - gesture.sx;
		const dy = t.clientY - gesture.sy;
		if (gesture.mode === 'tap' && Math.hypot(dx, dy) > 10) {
			gesture.mode = zoomTarget > 1.02 ? 'pan' : 'swipe';
		}
		if (gesture.mode === 'pan') {
			e.preventDefault();
			panTarget = {
				x: panTarget.x + t.clientX - gesture.lx,
				y: panTarget.y + t.clientY - gesture.ly
			};
			clampPan();
			panShown = { ...panTarget };
			startFsLoop();
		} else if (gesture.mode === 'swipe') {
			// only consumed by onTouchEnd's fullscreen nav/close branch below — in the
			// settled view a swipe is a no-op, so let the browser handle it natively
			// (e.g. pull-to-refresh) instead of blocking it for nothing
			if (fsTarget >= 1) e.preventDefault();
			gesture.dx = dx;
			gesture.dy = dy;
		}
		gesture.lx = t.clientX;
		gesture.ly = t.clientY;
	}

	function onTouchEnd(e: TouchEvent) {
		if (!gesture) return;
		const g = gesture;
		if (g.mode === 'pinch') {
			if (e.touches.length < 2) {
				gesture = null;
				if (zoomTarget <= 1.02) {
					zoomTarget = 1;
					panTarget = { x: 0, y: 0 };
					startFsLoop();
				}
			}
			return;
		}
		if (e.touches.length > 0) return; // wait for the last finger
		gesture = null;

		if (g.mode === 'swipe') {
			if (fsTarget >= 1 && zoomTarget <= 1.02) {
				if (Math.abs(g.dx) > 64 && Math.abs(g.dx) > Math.abs(g.dy) * 1.3) {
					const to = g.dx < 0 ? data.nav?.next : data.nav?.prev;
					if (to) goNav(to.slug);
				} else if (g.dy > 72) {
					exitFullscreen();
				}
			}
			return;
		}
		if (g.mode !== 'tap') return;

		const t = e.changedTouches[0];
		if (!t) return;
		const now = performance.now();
		const near = Math.hypot(t.clientX - lastTapPos.x, t.clientY - lastTapPos.y) < 48;
		if (now - lastTapAt < 300 && near) {
			// double-tap: zoom at the tap point, or back out to fit
			e.preventDefault();
			clearTimeout(singleTapTimer);
			lastTapAt = 0;
			if (zoomTarget > 1.02) {
				resetZoom();
			} else {
				if (fsTarget < 1) {
					fsTarget = 1;
					fsShown = 1;
				}
				atBoundary = false;
				zoomAt(t.clientX, t.clientY, CLICK_ZOOM);
			}
		} else {
			lastTapAt = now;
			lastTapPos = { x: t.clientX, y: t.clientY };
			// wait out the double-tap window before treating it as a single tap
			clearTimeout(singleTapTimer);
			singleTapTimer = setTimeout(() => {
				if (zoomTarget > 1.02) return; // taps while zoomed are inert
				if (fsTarget >= 1) exitFullscreen();
				else {
					fsTarget = 1;
					atBoundary = false;
					startFsLoop();
				}
			}, 300);
		}
	}

	const lerpBox = (a: Box, b: Box, t: number): Box => ({
		w: a.w + (b.w - a.w) * t,
		h: a.h + (b.h - a.h) * t,
		cx: a.cx + (b.cx - a.cx) * t,
		cy: a.cy + (b.cy - a.cy) * t
	});

	const fsActive = $derived(fsShown > 0.001 || zoomShown > 1.001);

	/* transform from the settled layout to whatever box is current */
	const imgTransform = $derived.by(() => {
		const target =
			phase === 'intro'
				? introBox
				: fsActive
					? lerpBox(settled, fullscreenBox, fsShown)
					: settled;
		const s = (target.w / settled.w) * (phase === 'intro' ? 1 : zoomShown);
		const dx = target.cx - settled.cx + panShown.x;
		const dy = target.cy - settled.cy + panShown.y;
		return `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px)) scale(${s})`;
	});

	/* CSS-eased for the postcard sequence; instant while rAF drives fullscreen */
	const imgTransition = $derived(
		fsActive ? 'none' : 'transform 1.1s cubic-bezier(0.33, 1, 0.68, 1)'
	);

	// Source selection must include the CSS scale: during the postcard intro
	// the visible photo can be much wider than its settled layout box.
	const imageDisplayWidth = $derived(
		Math.max(
			settled.w,
			phase !== 'done' ? introBox.w : 0,
			lerpBox(settled, fullscreenBox, Math.max(fsShown, fsTarget)).w *
				Math.max(zoomShown, zoomTarget)
		)
	);

	const chromeStyle = $derived(
		phase === 'done' && fsActive
			? `opacity: ${1 - fsShown}; transition: none; pointer-events: ${fsShown > 0.5 ? 'none' : 'auto'}`
			: ''
	);

	/* ----------------------------------------------------------- title */
	/* Postcard back: when the photo's orientation mismatches the viewport, the
	   intro leaves large empty flanks beside (or above/below) it. Instead of a
	   scrimmed overlay, those flanks carry the title as kinetic type plus an
	   address block and postmark — the photograph itself stays untouched. */
	const flanks = $derived.by(() => {
		if (isMatch || phase === 'done') return null;
		const w = vw || 1280;
		const h = vh || 800;
		const horizontal = w >= h;
		const gap = horizontal ? (w - introBox.w) / 2 : (h - introBox.h) / 2;
		if (gap < 150) return null; // too slim to speak in — fall back to the overlay
		return { horizontal, gap };
	});

	const titleWords = $derived(photo.title.split(/\s+/).filter(Boolean));

	/** display size for the flank title: fit the longest word across the flank
	 *  and the whole word stack along the viewport's long axis */
	const flankWordPx = $derived.by(() => {
		if (!flanks) return 0;
		const w = vw || 1280;
		const h = vh || 800;
		if (flanks.horizontal) {
			const longest = Math.max(...titleWords.map((t) => t.length), 1);
			const across = (flanks.gap - 56) / (longest * 0.58);
			const along = ((h * 0.66) / titleWords.length) * 0.92;
			return Math.max(26, Math.min(across, along, 130));
		}
		const oneLine = (w * 0.86) / (photo.title.length * 0.6);
		return Math.max(24, Math.min(oneLine, (flanks.gap - 40) * 0.5, 88));
	});

	const flankMeta = $derived.by(() => {
		const lines: { icon: IconName; text: string }[] = [];
		if (photo.location) lines.push({ icon: 'location', text: photo.location });
		if (dateStr) lines.push({ icon: 'calendar', text: dateStr });
		if (camera) lines.push({ icon: 'camera', text: camera });
		if (photo.analog && photo.filmStock) lines.push({ icon: 'film', text: photo.filmStock });
		return lines.slice(0, 4);
	});

	// on phones a long title is allowed to wrap onto multiple lines instead of
	// shrinking to a sliver to fit one line
	const multilineTitle = $derived((vw || 1280) < 640 && photo.title.length > 16);
	const titleSize = $derived.by(() => {
		const w = vw || 1280;
		const h = vh || 800;
		if (multilineTitle) {
			// size for roughly two balanced lines rather than one long line
			const perLine = Math.ceil(photo.title.length / 2);
			const fitPx = (0.84 * w) / (perLine * 0.6);
			return Math.max(32, Math.min(fitPx, h * 0.16, 76));
		}
		const fitPx = (0.86 * w) / (photo.title.length * 0.62);
		return Math.max(26, Math.min(fitPx, h * 0.24, 190));
	});

	/* Scrim adapts: dark glow under light titles, light under dark titles. */
	const titleIsLight = $derived.by(() => {
		const n = parseInt(photo.titleColor.slice(1), 16);
		const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255];
		return 0.2126 * r + 0.7152 * g + 0.0722 * b > 140;
	});

	const scrim = $derived.by(() => {
		const f = data.settings.postcardScrimStrength;
		const a = (base: number) => Math.min(0.9, base * f);
		// `glow` is the blanket alpha (lighter, since it covers everything); `glowMid`
		// is a softer stop used to feather the ellipse so its edge never reads as a
		// hard shape. `shadow` is kept for callers that still want it.
		return titleIsLight
			? {
					glow: `rgba(12, 11, 9, ${a(0.34)})`,
					glowCore: `rgba(12, 11, 9, ${a(0.5)})`,
					glowMid: `rgba(12, 11, 9, ${a(0.26)})`,
					shadow: `0 1px 18px rgba(0, 0, 0, ${a(0.45)}), 0 1px 56px rgba(0, 0, 0, ${a(0.35)})`
				}
			: {
					glow: `rgba(255, 254, 250, ${a(0.42)})`,
					glowCore: `rgba(255, 254, 250, ${a(0.6)})`,
					glowMid: `rgba(255, 254, 250, ${a(0.32)})`,
					shadow: `0 1px 18px rgba(255, 255, 250, ${a(0.55)}), 0 1px 56px rgba(255, 255, 250, ${a(0.45)})`
				};
	});

	/* ------------------------------------------------------------------ timeline */
	function clearTimers() {
		timers.forEach(clearTimeout);
		timers = [];
	}

	function skip() {
		if (phase === 'done') return;
		clearTimers();
		titleVisible = false;
		phase = 'done';
	}

	$effect.pre(() => {
		photo.id; // reset transient state before the next photograph is rendered
		titleVisible = false;
		fsShown = 0;
		fsTarget = 0;
		zoomShown = 1;
		zoomTarget = 1;
		panShown = { x: 0, y: 0 };
		panTarget = { x: 0, y: 0 };
		shiftHolding = false;
		atBoundary = false;
		deltaEma = 0;

		const cleanup = () => {
			clearTimers();
			clearTimeout(singleTapTimer);
			gesture = null;
			mouseDrag = null;
			cancelAnimationFrame(fsRaf);
			fsRaf = 0;
		};

		// only the first load (arriving from the gallery) plays the postcard intro;
		// photo→photo navigation jumps straight to the settled view
		const playIntro = firstLoad;
		firstLoad = false;
		if (!playIntro || window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
			phase = 'done';
			return cleanup;
		}
		phase = 'intro';
		// the postcard back (kinetic flanks) tells a longer story than the classic
		// overlay title — words, address, postmark — so it earns a longer hold.
		// untrack: resizing mid-intro must not restart the timeline.
		const hold = data.settings.postcardHoldMs + (untrack(() => flanks) ? 1100 : 0);
		const tIn = 400; // title fade-in starts
		const tOut = tIn + 700 + hold; // title fade-out starts
		const tSettle = tOut + 500; // image glides to its resting place
		const tDone = tSettle + 500; // chrome fades in while image settles
		timers = [
			setTimeout(() => (titleVisible = true), tIn),
			setTimeout(() => (titleVisible = false), tOut),
			setTimeout(() => (phase = 'settling'), tSettle),
			setTimeout(() => (phase = 'done'), tDone)
		];
		return cleanup;
	});

	function onKeydown(e: KeyboardEvent) {
		if (e.defaultPrevented) return; // another handler (e.g. palette) already consumed this
		// Shift engages immediately (the rAF loop applies a short dead zone,
		// so a quick double-tap for the palette never shows motion)
		if (e.key === 'Shift' && !e.repeat && phase === 'done' && !palette.open) {
			shiftHolding = true;
			shiftDownAt = performance.now();
			startFsLoop();
		}
		if (palette.open) return; // the site palette owns the keyboard while open
		if (e.key === 'Escape') {
			if (zoomTarget > 1) {
				zoomTarget = 1;
				panTarget = { x: 0, y: 0 };
				startFsLoop();
			} else if (fsTarget > 0) {
				exitFullscreen();
			} else {
				goto(galleryUrl);
			}
		}
		if ((e.key === ' ' || e.key === 'Enter') && phase !== 'done') {
			e.preventDefault();
			skip();
		}
		// ← / → walk the active gallery set in its order
		if (e.key === 'ArrowLeft' && data.nav?.prev) {
			e.preventDefault();
			goNav(data.nav.prev.slug);
		}
		if (e.key === 'ArrowRight' && data.nav?.next) {
			e.preventDefault();
			goNav(data.nav.next.slug);
		}
	}

	// Preserve the gallery context (the active filters) on every onward link so
	// Prev/Next keep walking the same filtered set. `g` marks "came from gallery".
	const navQuery = $derived(galleryPhotoQuery(data.filters));
	const galleryUrl = $derived(galleryHref(data.filters));
	function goNav(slug: string) {
		goto(`/photo/${slug}${navQuery}`);
	}

	// The active filters, as icon + label, so the strip can read "More from {filters}"
	// — e.g. a tag icon and "NATURE", or several chips when filters are combined.
	const navFilters = $derived.by((): { icon: IconName; text: string }[] => {
		const f = data.filters;
		const out: { icon: IconName; text: string }[] = [];
		if (f.album) out.push({ icon: 'album', text: f.album });
		if (f.favorite) out.push({ icon: 'star', text: 'Favorites' });
		if (f.film) out.push({ icon: 'film', text: f.film });
		else if (f.analog) out.push({ icon: 'film', text: 'Film' });
		if (f.tag && f.tag.toLowerCase() !== FAVORITE_TAG) out.push({ icon: 'tag', text: f.tag });
		if (f.location) out.push({ icon: 'location', text: f.location });
		if (f.camera) out.push({ icon: 'camera', text: f.camera });
		if (f.lens) out.push({ icon: 'lens', text: f.lens });
		if (f.focal) out.push({ icon: 'focal', text: f.focal });
		if (f.focalMin || f.focalMax)
			out.push({ icon: 'focal', text: focalRangeText(f.focalMin, f.focalMax) });
		if (f.aperture) out.push({ icon: 'aperture', text: f.aperture });
		if (f.shutter) out.push({ icon: 'shutter', text: f.shutter });
		if (f.iso) out.push({ icon: 'iso', text: `ISO ${f.iso}` });
		if (f.q) out.push({ icon: 'search', text: `“${f.q}”` });
		return out;
	});

	// Strip of neighbouring frames from the active filtered set (empty when the
	// photo was opened directly, where we fall back to "more like this").
	const navItems = $derived(data.nav ? data.nav.strip : data.similar);

	function onKeyup(e: KeyboardEvent) {
		// always release the hold, even if the palette opened mid-press
		if (e.key === 'Shift' && shiftHolding) {
			shiftHolding = false;
			exitFullscreen();
		}
	}

	function onWindowBlur() {
		mouseDrag = null;
		gesture = null;
		clearTimeout(singleTapTimer);
		// A key released outside the window never reaches our keyup handler.
		if (shiftHolding) {
			shiftHolding = false;
			exitFullscreen();
		}
	}

	// Rotation changes the pan limits even when no gesture is in progress.
	$effect(() => {
		vw;
		vh;
		untrack(() => {
			gesture = null;
			mouseDrag = null;
			if (zoomTarget > 1) {
				clampPan();
				panShown = { ...panTarget };
			}
		});
	});

	// opening the palette cancels any in-flight shift-hold
	$effect(() => {
		if (palette.open && shiftHolding) {
			shiftHolding = false;
			exitFullscreen();
		}
	});

	/* ------------------------------------------------------------------ metadata */
	const chromeInert = $derived(phase !== 'done' || fsShown > 0.5);

	const dateStr = $derived(photoDate(photo.takenAt));
	const dateTimeStr = $derived(photoDateTime(photo.takenAt));

	/* The footer is strictly two columns on sm+ screens — title left, metadata
	   right. The title column is width-capped and TickerText scrolls any
	   overflow, so title length never forces a stacked layout; only phone
	   widths stack. */
	const stackedFooter = $derived((vw || 1280) < 640 && !compactLandscape);

	const isFavorited = $derived(photo.tags.some((t) => t.toLowerCase() === FAVORITE_TAG));

	const camera = $derived(cameraLabel(photo.cameraMake, photo.cameraModel) || null);

	interface MetaItem {
		icon: 'camera' | 'lens' | 'focal' | 'aperture' | 'shutter' | 'iso';
		tip: string;
		label: string;
		href: string;
	}

	const exifLinks = $derived(
		(
			[
				['camera', 'Camera', photo.cameraModel, camera, 'camera', photo.cameraModel],
				['lens', 'Lens', photo.lens, photo.lens, 'lens', photo.lens],
				[
					'focal',
					'Focal length',
					photo.focalLength,
					photo.focalLength,
					'focal',
					photo.focalLength
				],
				[
					'aperture',
					'Aperture',
					photo.aperture,
					photo.aperture,
					'aperture',
					photo.aperture
				],
				[
					'shutter',
					'Shutter speed',
					photo.shutterSpeed,
					photo.shutterSpeed,
					'shutter',
					photo.shutterSpeed
				],
				['iso', 'ISO sensitivity', photo.iso, `ISO ${photo.iso}`, 'iso', String(photo.iso)]
			] as const
		)
			.filter(([, , present]) => present)
			.map(([icon, tip, , label, key, value]): MetaItem => ({
				icon,
				tip,
				label: String(label),
				href: `/?${key}=${encodeURIComponent(String(value))}`
			}))
	);
</script>

<svelte:window
	bind:innerWidth={vw}
	bind:innerHeight={vh}
	onkeydown={onKeydown}
	onkeyup={onKeyup}
	onblur={onWindowBlur}
/>

<svelte:head>
	<title>{photo.title} — {data.settings.siteTitle}</title>
	<meta name="description" content={photo.description ?? photo.title} />
	<meta property="og:type" content="article" />
	<meta property="og:title" content={photo.title} />
	<meta property="og:description" content={photo.description ?? data.settings.siteTitle} />
	<meta property="og:url" content={data.canonicalUrl} />
	<link rel="canonical" href={data.canonicalUrl} />
	{#if data.ogImage}
		<meta property="og:image" content={data.ogImage} />
		<meta property="og:image:width" content="1200" />
		<meta property="og:image:height" content="630" />
		<meta name="twitter:card" content="summary_large_image" />
		<meta name="twitter:image" content={data.ogImage} />
	{/if}
</svelte:head>

{#snippet navHeading()}
	<span class="inline-flex max-w-full items-center gap-2.5">
		{#if data.nav?.prev}
			<a
				href="/photo/{data.nav.prev.slug}{navQuery}"
				use:photoIntent={data.nav.prev}
				class="has-tip leading-0 transition-colors hover:text-accent"
				aria-label="Previous photo"
			>
				<Icon name="arrow-left" size={14} />
				<span class="tip-content">Previous <kbd class="key key-sm key-tip">←</kbd></span>
			</a>
		{:else}
			<span aria-disabled="true" class="opacity-40 leading-0"
				><Icon name="arrow-left" size={14} /></span
			>
		{/if}
		<span
			class="type-label inline-flex min-w-0 items-center gap-x-3 gap-y-1 truncate text-ink-soft"
		>
			{#if navFilters.length}
				{#each navFilters as f, i (`${f.icon}:${f.text}:${i}`)}
					<span class="inline-flex items-center gap-1.5 truncate">
						<Icon name={f.icon} size={13} class="shrink-0" />
						<span class="truncate">{f.text}</span>
						{#if i < navFilters.length - 1}<span class="text-ink-soft/40">·</span>{/if}
					</span>
				{/each}
			{:else}
				All photos
			{/if}
			{#if data.nav}<span class="shrink-0 text-ink-soft/50"
					>{data.nav.index + 1}/{data.nav.total}</span
				>{/if}
		</span>
		{#if data.nav?.next}
			<a
				href="/photo/{data.nav.next.slug}{navQuery}"
				use:photoIntent={data.nav.next}
				class="has-tip leading-0 transition-colors hover:text-accent"
				aria-label="Next photo"
			>
				<Icon name="arrow-right" size={14} />
				<span class="tip-content leading-0"
					>Next <kbd class="key key-sm key-tip">→</kbd></span
				>
			</a>
		{:else}
			<span aria-disabled="true" class="opacity-40"
				><Icon name="arrow-right" size={14} /></span
			>
		{/if}
	</span>
{/snippet}

{#snippet galleryLinks()}
	<a
		href={galleryUrl}
		class="has-tip tip-below type-label inline-flex items-center gap-1.5 text-ink-soft transition-colors hover:text-accent"
	>
		<Icon name="arrow-left" size={15} />Gallery
		<span class="tip-content">Gallery <kbd class="key key-sm key-tip">Esc</kbd></span>
	</a>
	{#if data.isAdmin}
		<a
			href="/admin?photo={photo.id}"
			data-tip="Open in admin panel"
			class="tip-below type-label inline-flex items-center gap-1.5 text-ink-soft transition-colors hover:text-accent"
		>
			<Icon name="edit" size={15} />Edit
		</a>
	{/if}
{/snippet}

{#snippet metaLink(item: MetaItem)}
	<PreviewLink
		href={item.href}
		previewParams={item.href.slice(2)}
		tip={item.tip}
		label={item.label}
		icon={item.icon}
		class="type-mono inline-flex items-center gap-1.5 whitespace-nowrap text-ink-soft transition-colors hover:text-accent"
	>
		<Icon name={item.icon} size={15} />{item.label}
	</PreviewLink>
{/snippet}

{#snippet locationLink()}
	{#if photo.location}
		<PreviewLink
			href="/?location={encodeURIComponent(photo.location)}"
			previewParams="location={encodeURIComponent(photo.location)}"
			tip="Location"
			icon="location"
			class="type-mono inline-flex items-center gap-1.5 whitespace-nowrap text-ink-soft transition-colors hover:text-accent"
		>
			<Icon name="location" size={15} />{photo.location}
		</PreviewLink>
	{/if}
{/snippet}

{#snippet favoriteChip()}
	{#if isFavorited}
		<PreviewLink
			href="/?favorite=1"
			previewParams="favorite=1"
			tip="Favorite"
			label="Favorites"
			icon="star"
			class="type-label inline-flex items-center gap-1.5 whitespace-nowrap text-amber-700 transition-colors hover:text-amber-700"
		>
			<Icon name="star" size={15} />Favorite
		</PreviewLink>
	{/if}
{/snippet}

{#snippet filmChip()}
	{#if photo.analog && photo.filmStock}
		<PreviewLink
			href="/?film={encodeURIComponent(photo.filmStock)}"
			previewParams="film={encodeURIComponent(photo.filmStock)}"
			tip="Film stock"
			icon="film"
			class="type-mono inline-flex items-center gap-1.5 whitespace-nowrap text-ink-soft transition-colors hover:text-accent"
		>
			<Icon name="film" size={15} />{photo.filmStock}
		</PreviewLink>
	{/if}
{/snippet}

{#snippet chipLinks(extraClass: string)}
	{#each photo.albums as album (album)}
		<PreviewLink
			href="/?album={encodeURIComponent(album)}"
			previewParams="album={encodeURIComponent(album)}"
			tip="Album"
			icon="album"
			class="type-label inline-flex items-center gap-1.5 whitespace-nowrap text-accent transition-colors hover:underline {extraClass}"
		>
			<Icon name="album" size={15} />{album}
		</PreviewLink>
	{/each}
	{#each photo.tags as tag (tag)}
		{#if tag.toLowerCase() !== FAVORITE_TAG}
			<PreviewLink
				href="/?tag={encodeURIComponent(tag)}"
				previewParams="tag={encodeURIComponent(tag)}"
				tip="Tag"
				icon="tag"
				class="type-label inline-flex items-center gap-1.5 whitespace-nowrap text-ink-soft transition-colors hover:text-accent {extraClass}"
			>
				<Icon name="tag" size={15} />{tag}
			</PreviewLink>
		{/if}
	{/each}
{/snippet}

{#snippet similarThumbs(height: string, items: typeof data.similar)}
	{#each items as s (s.id)}
		{@const current = s.id === photo.id}
		<a
			href="/photo/{s.slug}{data.nav ? navQuery : ''}"
			use:photoIntent={s}
			title={s.title}
			class="block {height} overflow-hidden bg-cover bg-center transition-opacity {current
				? 'opacity-100 outline-2 outline-offset-1 outline-accent'
				: 'opacity-80 hover:opacity-100'}"
			style="aspect-ratio: {s.width} / {s.height}; background-image: url('{s.blurData}')"
		>
			<img
				src="/img/{s.id}/sm"
				alt={s.title}
				loading="lazy"
				class="h-full w-full object-cover"
			/>
		</a>
	{/each}
{/snippet}

<!-- svelte-ignore a11y_no_static_element_interactions, a11y_click_events_have_key_events -->
<div
	class="photo-viewer fixed inset-0 overflow-hidden bg-paper [touch-action:manipulation]"
	style:background-color={fsShown === 1 ? '#000' : undefined}
	use:immersiveChrome={fsTarget > 0 || fsActive}
	onclick={skip}
	onpointerdown={onPointerDown}
	onpointermove={onPointerMove}
	onpointerup={onPointerUp}
	onpointercancel={() => (mouseDrag = null)}
	use:touchGestures
	ontouchend={onTouchEnd}
	ontouchcancel={() => (gesture = null)}
	onwheel={onWheel}
>
	<div
		class="lightbox-backdrop pointer-events-none absolute inset-0 bg-black"
		style="opacity: {fsShown}"
		aria-hidden="true"
	></div>
	<!-- Declare gesture ownership before the first touch. Metadata remains outside
	     this surface so its scrolling and browser accessibility zoom stay native. -->
	<div class="photo-interaction-surface absolute inset-0 touch-none">
		<!-- Recreate the wrapper so a new photo cannot inherit an in-flight zoom. -->
		{#key photo.id}
			<!-- Keep the raster hint only for the intro. Interactive zoom must let the
		     browser redraw from the source at the enlarged scale. -->
			<div
				bind:this={imgWrapEl}
				class="photo-frame absolute {phase !== 'done'
					? 'will-change-transform'
					: ''} {phase === 'done'
					? zoomShown > 1.01
						? 'cursor-grab active:cursor-grabbing'
						: 'cursor-zoom-in'
					: ''}"
				style="
				width: {settled.w}px;
				height: {settled.h}px;
				left: {settled.cx}px;
				top: {settled.cy}px;
				transform: {imgTransform};
				transition: {imgTransition};
				{morphIn ? 'view-transition-name: morph-frame;' : ''}
			"
			>
				<div
					class="h-full w-full bg-cover bg-center"
					style="background-image: url('{photo.blurData}')"
				>
					<ProgressivePhoto
						{photo}
						displayWidth={imageDisplayWidth}
						preferFull={fsTarget > 0 || zoomTarget > 1}
					/>
				</div>
			</div>
		{/key}
	</div>

	{#if flanks}
		<!-- postcard back: the mismatch flanks carry the title as kinetic type,
		     an address block, and a postmark — the photograph stays untouched -->
		<div
			class="pointer-events-none absolute inset-0 z-10 transition-opacity duration-700 {titleVisible
				? 'opacity-100'
				: 'opacity-0'}"
		>
			{#if titleVisible}
				<!-- title flank -->
				<h1
					class="type-display absolute flex {flanks.horizontal
						? 'inset-y-0 left-0 flex-col items-end justify-center pr-9 text-right'
						: 'inset-x-0 top-0 flex-row flex-wrap content-end items-end justify-center gap-x-[0.45em] pb-5 text-center'}"
					style="{flanks.horizontal
						? `width: ${Math.round(flanks.gap - 8)}px;`
						: `height: ${Math.round(flanks.gap - 4)}px;`} font-size: {flankWordPx}px; line-height: 0.98;"
				>
					{#each titleWords as word, i (i)}
						<span class="kinetic-word block" style="--kd: {0.15 + i * 0.11}s"
							>{word}</span
						>
					{/each}
				</h1>

				<!-- address block + postmark flank -->
				<div
					class="absolute flex {flanks.horizontal
						? 'inset-y-0 right-0 flex-col items-start justify-center px-6'
						: 'inset-x-0 bottom-0 flex-row items-center justify-center gap-5 px-5 py-4'}"
					style={flanks.horizontal
						? `width: ${Math.round(flanks.gap - 8)}px;`
						: `height: ${Math.round(flanks.gap - 4)}px;`}
				>
					<div
						class="flex min-w-0 flex-col gap-2 {flanks.horizontal
							? 'max-w-full'
							: 'max-w-72'}"
					>
						{#each flankMeta as line, i (line.text)}
							<span
								class="kinetic-line type-mono flex min-w-0 items-start gap-2 text-sm text-ink-soft"
								style="--kd: {0.55 + i * 0.12}s"
							>
								<Icon
									name={line.icon}
									size={14}
									class="text-ink-soft/70"
								/>{line.text}
							</span>
						{/each}
					</div>
					<!-- postmark: stamped last -->
					<Postmark
						location={photo.location ?? data.settings.siteTitle}
						takenAt={photo.takenAt}
						size={flanks.horizontal && !compactLandscape ? 104 : 88}
						class={flanks.horizontal ? 'mt-5 -ml-1' : ''}
					/>
				</div>
			{/if}
		</div>
	{:else}
		<!-- adaptive scrim keeps the title legible: either a flat rectangle wash over the
		     whole photo, or a tall, softly-feathered ellipse behind the title — shape is
		     configurable per device since the two read differently at phone widths -->
		{#if data.settings.postcardScrimStrength > 0}
			<div
				class="pointer-events-none absolute inset-0 z-10 transition-opacity duration-1000 {titleVisible
					? 'opacity-100'
					: 'opacity-0'}"
				style="background: {((vw || 1280) >= 640
					? data.settings.postcardScrimShapeDesktop
					: data.settings.postcardScrimShapeMobile) === 'ellipse'
					? `radial-gradient(ellipse 78% 116% at 50% 50%, ${scrim.glowCore} 0%, ${scrim.glowMid} 42%, transparent 78%)`
					: scrim.glow}"
			></div>
		{/if}

		<!-- postcard title -->
		<h1
			class="type-display pointer-events-none absolute inset-x-0 top-1/2 z-10 -translate-y-1/2 text-center transition-all duration-700 ease-out {multilineTitle
				? 'px-7 leading-[1.08] text-balance'
				: 'whitespace-nowrap'} {titleVisible ? 'opacity-100' : 'opacity-0'}"
			style="
				color: {photo.titleColor};
				font-size: {titleSize}px;
				letter-spacing: {titleVisible ? '0.06em' : '0.14em'};
			"
		>
			{photo.title}
		</h1>
	{/if}

	{#if !sideMode}
		<!-- minimal header -->
		<header
			inert={chromeInert}
			aria-hidden={chromeInert}
			class="absolute inset-x-0 top-0 z-20 flex items-center justify-between px-4 transition-all duration-700 sm:px-5 {phase ===
			'done'
				? 'opacity-100'
				: 'pointer-events-none -translate-y-2 opacity-0'}"
			style="height: {HEADER_H}px; {chromeStyle}"
		>
			<a href={galleryUrl} class="type-display text-sm hover:text-accent"
				>{data.settings.siteTitle}</a
			>
			<div class="flex items-center gap-5">
				{@render galleryLinks()}
			</div>
		</header>

		<!-- metadata footer -->
		<footer
			inert={chromeInert}
			aria-hidden={chromeInert}
			bind:clientHeight={footerH}
			class="postcard-meta photo-footer absolute inset-x-0 bottom-0 z-20 border-t border-hairline bg-paper px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] transition-all duration-700 sm:px-5 {phase ===
			'done'
				? 'opacity-100'
				: 'pointer-events-none translate-y-3 opacity-0'}"
			style={chromeStyle}
		>
			{#if compactLandscape}
				<div class="flex min-w-0 items-center justify-between gap-4">
					<TickerText text={photo.title} class="type-display min-w-0 flex-1 text-xl" />
					{#if data.nav}
						<div class="shrink-0">{@render navHeading()}</div>
					{:else if navItems.length}
						<div class="flex shrink-0 gap-1.5">
							{@render similarThumbs('h-8', navItems.slice(0, 2))}
						</div>
					{/if}
				</div>
				<div class="compact-photo-meta mt-2 flex items-center gap-5 overflow-x-auto pb-1">
					{@render favoriteChip()}
					{@render filmChip()}
					{@render locationLink()}
					{#if dateStr}
						<Tooltip
							text={dateTimeStr}
							class="type-mono inline-flex cursor-help items-center gap-1.5 whitespace-nowrap text-ink-soft"
						>
							<Icon name="calendar" size={15} />{dateStr}
						</Tooltip>
					{/if}
					{#each exifLinks as item (item.href)}{@render metaLink(item)}{/each}
					{@render chipLinks('')}
					{#if photo.description}<span class="text-sm whitespace-nowrap text-ink-soft"
							>{photo.description}</span
						>{/if}
				</div>
			{:else}
				<div
					class={stackedFooter
						? 'flex flex-col gap-y-2.5'
						: 'flex items-end justify-between gap-x-10'}
				>
					<div
						class={stackedFooter
							? 'flex items-start justify-between gap-6'
							: 'contents'}
					>
						<!-- title & description (top-aligned in the columns layout); the cap
					     grows with the viewport so wide screens rarely need the ticker -->
						<div
							class="min-w-0 {stackedFooter
								? ''
								: 'max-w-72 shrink-0 self-start lg:max-w-96 xl:max-w-[34rem] 2xl:max-w-[44rem]'}"
						>
							<TickerText
								text={photo.title}
								class="type-display mt-1 {photo.description
									? 'text-xl sm:text-2xl'
									: 'text-2xl sm:text-3xl lg:text-4xl'}"
							/>
							{#if photo.description}
								<p class="line-clamp-2 text-sm leading-snug text-ink-soft">
									{photo.description}
								</p>
							{/if}
						</div>

						{#if stackedFooter && navItems.length && (vw || 1280) >= 640}
							<div class="flex shrink-0 flex-col items-end gap-2">
								{@render navHeading()}
								<div class="flex gap-1.5">
									{@render similarThumbs('h-12', navItems.slice(0, 4))}
								</div>
							</div>
						{/if}
					</div>

					<!-- metadata chips, flowing into columns; full width when stacked
				     so every chip shows without scrolling -->
					<div
						class="min-w-0 flex-1 gap-x-7 gap-y-2 pb-0.5 {(vw || 1280) < 640
							? 'flex flex-wrap'
							: 'grid auto-cols-max grid-flow-col overflow-x-auto [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden ' +
								(stackedFooter ? 'grid-rows-2' : 'grid-rows-3')}"
						onwheel={(e) => {
							const el = e.currentTarget;
							if (el.scrollWidth > el.clientWidth + 2) {
								el.scrollLeft += e.deltaY + e.deltaX;
								e.stopPropagation();
							}
						}}
					>
						{@render favoriteChip()}
						{@render filmChip()}
						{@render locationLink()}
						{#if dateStr}
							<Tooltip
								text={dateTimeStr}
								class="type-mono inline-flex cursor-help items-center gap-1.5 whitespace-nowrap text-ink-soft"
							>
								<Icon name="calendar" size={15} />{dateStr}
							</Tooltip>
						{/if}
						{#each exifLinks as item (item.href)}
							{@render metaLink(item)}
						{/each}
						{@render chipLinks('')}
					</div>

					{#if !stackedFooter && navItems.length}
						<div class="flex shrink-0 flex-col items-end gap-2">
							{@render navHeading()}
							<div class="flex gap-1.5">
								{@render similarThumbs('h-13', navItems.slice(0, 4))}
							</div>
						</div>
					{/if}
				</div>

				{#if navItems.length && (vw || 1280) < 640}
					<div class="mt-3">
						{@render navHeading()}
						<div class="mt-1.5 flex gap-1.5">
							{@render similarThumbs('h-11', navItems.slice(0, 4))}
						</div>
					</div>
				{/if}
			{/if}
		</footer>
	{:else}
		<!-- sidebar: preserves image height on desktop portraits and landscape phones -->
		<aside
			inert={chromeInert}
			aria-hidden={chromeInert}
			class="postcard-meta photo-sidebar absolute inset-y-0 right-0 z-20 flex flex-col overflow-y-auto border-l border-hairline bg-paper transition-all duration-700 {compactLandscape
				? 'compact-sidebar px-4 py-3'
				: 'px-7 py-5'} {phase === 'done'
				? 'opacity-100'
				: 'pointer-events-none translate-x-4 opacity-0'}"
			style="width: {sidebarWidth}px; {chromeStyle}"
		>
			<div class="flex items-center justify-between">
				<a href={galleryUrl} class="type-display text-sm hover:text-accent"
					>{data.settings.siteTitle}</a
				>
				<div class="flex items-center gap-4">
					{@render galleryLinks()}
				</div>
			</div>

			<div class="mt-auto pt-8">
				<h1 class="type-display text-[1.75rem] leading-tight">{photo.title}</h1>
				<div class="mt-3 flex flex-col gap-2">
					{@render favoriteChip()}
					{@render filmChip()}
					{@render locationLink()}
					{#if dateStr}
						<Tooltip
							text={dateTimeStr}
							class="type-mono inline-flex cursor-help items-center gap-2 text-ink-soft"
						>
							<Icon name="calendar" size={15} />{dateStr}
						</Tooltip>
					{/if}
				</div>
				{#if photo.description}
					<p class="mt-4 text-sm leading-relaxed text-ink-soft">{photo.description}</p>
				{/if}

				{#if exifLinks.length}
					<div class="mt-5 border-t border-hairline pt-4">
						<div class="grid grid-cols-1 gap-y-2">
							{#each exifLinks as item (item.href)}
								<a
									href={item.href}
									aria-label="{item.tip}: {item.label}"
									class="type-mono inline-flex items-center gap-2.5 text-ink-soft transition-colors hover:text-accent"
								>
									<Icon
										name={item.icon}
										size={15}
										class="shrink-0 text-ink-soft/70"
									/>{item.label}
									<span
										class="exif-label type-mono ml-auto text-[0.6rem] text-ink-soft/50"
										>{item.tip}</span
									>
								</a>
							{/each}
						</div>
					</div>
				{/if}

				{#if photo.albums.length || photo.tags.length}
					<div class="mt-4 flex flex-wrap gap-x-4 gap-y-2 border-t border-hairline pt-4">
						{@render chipLinks('')}
					</div>
				{/if}

				{#if navItems.length}
					<div class="mt-5 border-t border-hairline pt-4">
						{@render navHeading()}
						<!-- always one row: the four thumbs share the panel width equally -->
						<div class="mt-2 flex gap-1.5 [&>a]:min-w-0 [&>a]:flex-1">
							{@render similarThumbs('h-14', navItems.slice(0, 4))}
						</div>
					</div>
				{/if}
			</div>
		</aside>
	{/if}
</div>

<style>
	.photo-footer {
		max-height: calc(100% - 160px);
		overflow-y: auto;
	}

	.compact-photo-meta {
		scrollbar-width: thin;
	}

	.compact-photo-meta :global(> *) {
		flex-shrink: 0;
	}

	.photo-sidebar {
		padding-right: max(var(--sidebar-padding, 1.75rem), env(safe-area-inset-right));
		padding-bottom: max(0.75rem, env(safe-area-inset-bottom));
	}

	.compact-sidebar {
		--sidebar-padding: 1rem;
	}

	.compact-sidebar :global(h1) {
		font-size: 1.375rem;
	}

	.compact-sidebar .exif-label {
		display: none;
	}

	.compact-sidebar > div:first-child {
		flex-shrink: 0;
		flex-wrap: wrap;
		gap: 0.5rem;
	}

	.compact-sidebar > div:last-child {
		padding-top: 1rem;
	}

	.compact-sidebar :global(.type-label),
	.compact-sidebar :global(.type-mono) {
		overflow-wrap: anywhere;
		white-space: normal;
	}
</style>
