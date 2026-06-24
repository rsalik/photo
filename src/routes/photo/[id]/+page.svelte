<script lang="ts">
	import { goto } from '$app/navigation';
	import { browser } from '$app/environment';
	import { FAVORITE_TAG, IMAGE_SIZES, SCRIM_FACTORS } from '$lib/types';
	import { cameraLabel } from '$lib/camera';
	import { palette } from '$lib/palette-state.svelte';
	import Icon, { type IconName } from '$lib/components/Icon.svelte';
	import PreviewLink from '$lib/components/PreviewLink.svelte';
	import TickerText from '$lib/components/TickerText.svelte';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();
	const photo = $derived(data.photo);

	// when a gallery frame was clicked it sets this flag; the image then shares a
	// view-transition-name so the frame zooms into the photo (see +layout onNavigate)
	const morphIn = browser && sessionStorage.getItem('morph') === '1';
	if (morphIn) sessionStorage.removeItem('morph');

	/* ------------------------------------------------------------------ state */
	let vw = $state(0);
	let vh = $state(0);
	let footerH = $state(132);
	const HEADER_H = 48;
	const SIDEBAR_W = 320;
	const M = 8; // same breathing room as the gallery grid gap

	type Phase = 'intro' | 'settling' | 'done';
	let phase = $state<Phase>('intro');
	// the postcard intro plays only on the first view (gallery → photo). Walking
	// between photos keeps this component mounted, so subsequent loads skip it.
	let firstLoad = true;
	let titleVisible = $state(false);
	let imgLoaded = $state(false);
	let imgEl = $state<HTMLImageElement>();
	let timers: ReturnType<typeof setTimeout>[] = [];

	// onload never fires for images already in cache at hydration time
	$effect(() => {
		if (imgEl?.complete) imgLoaded = true;
	});

	// The gallery already has the `md` size cached, so we paint that immediately
	// (sharp, instant — the morph captures a real image, not the blur) and only
	// attach the full srcset once settled, which upgrades to a crisp source. This
	// keeps the zoom morph smooth instead of decoding a huge image mid-transition.
	let hiRes = $state(false);
	$effect(() => {
		photo.id;
		hiRes = false;
		const t = setTimeout(() => (hiRes = true), 180);
		return () => clearTimeout(t);
	});

	/* "Postcard match": photo orientation matches the viewport's */
	const isMatch = $derived(
		vw && vh ? photo.width >= photo.height === vw >= vh : photo.width >= photo.height
	);

	/* Vertical photos on wide screens get a sidebar so they can run
	   from the top of the window to the bottom. */
	const sideMode = $derived(
		photo.height > photo.width && (vw || 1280) >= 900 && (vw || 1280) >= (vh || 800)
	);

	/* ----------------------------------------------------------- geometry
	   The image is laid out ONCE at its settled position; every animated
	   state (postcard intro, fullscreen) is a pure `transform` from there,
	   so animation never triggers layout or re-rasterization per frame. */
	interface Box {
		w: number;
		h: number;
		cx: number;
		cy: number;
	}

	const fit = (boxW: number, boxH: number, mode: 'contain' | 'cover'): { w: number; h: number } => {
		const { width: pw, height: ph } = photo;
		const scale = (mode === 'contain' ? Math.min : Math.max)(boxW / pw, boxH / ph);
		return { w: pw * scale, h: ph * scale };
	};

	const settled = $derived.by((): Box => {
		const w = vw || 1280;
		const h = vh || 800;
		if (sideMode) {
			const availW = w - SIDEBAR_W - M * 2;
			return { ...fit(availW, h - M * 2, 'contain'), cx: M + availW / 2, cy: h / 2 };
		}
		const availH = Math.max(120, h - HEADER_H - footerH - M * 2);
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

	/* ----------------------------------------------------------- fullscreen + zoom
	   Scroll down (or hold Shift) progressively hides the chrome and grows the
	   photo to fill the screen; keep scrolling to zoom in, with the cursor
	   steering the pan. Scroll up unwinds; moving the mouse (when not zoomed)
	   or releasing Shift returns to the settled view. One rAF loop eases
	   fullscreen progress, zoom, and pan toward their targets.

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
	const BOUNDARY_COOLDOWN_MS = 100; // hard minimum wait at the fit boundary
	const EMA_ALPHA = 0.25;           // smoothing factor for |delta| tracker
	const SPIKE_RATIO = 2.0;          // current |d| must exceed EMA × this to cross
	let fsShown = $state(0); // animated 0..1  (Default → Zoom-to-Fit)
	let zoomShown = $state(1); // animated 1..MAX_ZOOM (Zoom-to-Fit → Zoom Detail)
	let panShown = $state({ x: 0, y: 0 });
	let fsTarget = 0;
	let zoomTarget = 1;
	let panTarget = { x: 0, y: 0 };
	let fsRaf = 0;
	let shiftHolding = false;
	let shiftDownAt = 0;
	let mouseAccum = 0;
	let lastMouse: { x: number; y: number } | null = null;
	// Boundary gate state
	let atBoundary = false;       // true while sitting at fsTarget≈1 absorbing scroll-down
	let boundaryEnteredAt = 0;    // timestamp when we first hit the boundary
	let deltaEma = 0;             // EMA of |delta| — tracks inertia decay
	let lastWheelAt = 0;          // for time-decay of EMA when events are sparse

	function startFsLoop() {
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
		mouseAccum = 0;
		atBoundary = false;
		deltaEma = 0;
		startFsLoop();
	}

	/** clamp the pan so the photo edge never leaves the screen edge */
	function panBounds(): { x: number; y: number } {
		return {
			x: Math.max(0, (fullscreenBox.w * zoomTarget - (vw || 1280)) / 2),
			y: Math.max(0, (fullscreenBox.h * zoomTarget - (vh || 800)) / 2)
		};
	}

	function steerPan(clientX: number, clientY: number) {
		const bounds = panBounds();
		const nx = (clientX / (vw || 1280) - 0.5) * 2;
		const ny = (clientY / (vh || 800) - 0.5) * 2;
		panTarget = { x: -nx * bounds.x, y: -ny * bounds.y };
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
			// Already in Zoom Detail — adjust zoom level
			zoomTarget = Math.max(1, Math.min(MAX_ZOOM, zoomTarget * (1 + d)));
			if (zoomTarget <= 1.005) {
				zoomTarget = 1;
				panTarget = { x: 0, y: 0 };
				// Re-enter boundary so scrolling down requires a fresh gesture
				atBoundary = true;
				boundaryEnteredAt = now;
			} else {
				steerPan(e.clientX, e.clientY);
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
					zoomTarget = Math.max(1, Math.min(MAX_ZOOM, 1 + d));
					steerPan(e.clientX, e.clientY);
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

		mouseAccum = 0;
		startFsLoop();
	}

	function onMouseMove(e: MouseEvent) {
		if (phase !== 'done') return;
		if (zoomTarget > 1) {
			// zoomed in: the cursor steers the pan instead of exiting
			steerPan(e.clientX, e.clientY);
			startFsLoop();
			lastMouse = null;
			return;
		}
		if (fsTarget === 0 || shiftHolding) {
			lastMouse = null;
			return;
		}
		if (lastMouse) {
			mouseAccum += Math.hypot(e.clientX - lastMouse.x, e.clientY - lastMouse.y);
			if (mouseAccum > 150) exitFullscreen();
		}
		lastMouse = { x: e.clientX, y: e.clientY };
	}

	function onDblClick(e: MouseEvent) {
		if (phase !== 'done') return;
		// only the image area zooms — never the chrome (footer / header / sidebar)
		if ((e.target as Element).closest('footer, header, aside')) return;
		e.preventDefault();
		toggleZoom(e.clientX, e.clientY);
	}

	// mobile: double-tap the photo toggles the immersive fullscreen view (touch
	// has no wheel; a binary toggle is the fluid, expected gesture on a phone)
	let lastTapAt = 0;
	let lastTapPos = { x: 0, y: 0 };
	function onTouchEnd(e: TouchEvent) {
		if (phase !== 'done') return;
		const t = e.changedTouches[0];
		if (!t || (e.target as Element).closest('footer, header, aside')) {
			lastTapAt = 0;
			return;
		}
		const now = performance.now();
		const near = Math.hypot(t.clientX - lastTapPos.x, t.clientY - lastTapPos.y) < 40;
		if (now - lastTapAt < 300 && near) {
			e.preventDefault();
			if (fsTarget >= 1 || zoomTarget > 1) exitFullscreen();
			else {
				fsTarget = 1;
				atBoundary = false;
				startFsLoop();
			}
			lastTapAt = 0;
		} else {
			lastTapAt = now;
			lastTapPos = { x: t.clientX, y: t.clientY };
		}
	}

	function toggleZoom(clientX: number, clientY: number) {
		if (zoomTarget > 1) {
			// Zoom Detail → Default
			exitFullscreen();
		} else if (fsTarget >= 1) {
			// Zoom-to-Fit → Zoom Detail
			zoomTarget = MAX_ZOOM;
			steerPan(clientX, clientY);
			startFsLoop();
		} else {
			// Default → Zoom-to-Fit
			fsTarget = 1;
			atBoundary = false;
			startFsLoop();
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
			phase === 'intro' ? introBox : fsActive ? lerpBox(settled, fullscreenBox, fsShown) : settled;
		const s = (target.w / settled.w) * (phase === 'intro' ? 1 : zoomShown);
		const dx = target.cx - settled.cx + panShown.x;
		const dy = target.cy - settled.cy + panShown.y;
		return `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px)) scale(${s})`;
	});

	/* CSS-eased for the postcard sequence; instant while rAF drives fullscreen */
	const imgTransition = $derived(
		fsActive ? 'none' : 'transform 1.1s cubic-bezier(0.33, 1, 0.68, 1)'
	);

	/* fetch a sharper source once the user actually zooms in */
	const zoomedIn = $derived(zoomShown > 1.25);

	const chromeStyle = $derived(
		phase === 'done' && fsActive
			? `opacity: ${1 - fsShown}; transition: none; pointer-events: ${fsShown > 0.5 ? 'none' : 'auto'}`
			: ''
	);

	/* ----------------------------------------------------------- title */
	const titleSize = $derived.by(() => {
		const w = vw || 1280;
		const h = vh || 800;
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
		const f = SCRIM_FACTORS[data.settings.scrimStrength];
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

	$effect(() => {
		photo.id; // reset transient state on every navigation between photos
		titleVisible = false;
		imgLoaded = false;
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
		const hold = data.settings.postcardHoldMs;
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
				goto('/');
			}
		}
		if ((e.key === ' ' || e.key === 'Enter') && phase !== 'done') {
			e.preventDefault();
			skip();
		}
		// ← / → walk the active gallery set in its order
		if (e.key === 'ArrowLeft' && data.nav?.prev) {
			e.preventDefault();
			goNav(data.nav.prev.id);
		}
		if (e.key === 'ArrowRight' && data.nav?.next) {
			e.preventDefault();
			goNav(data.nav.next.id);
		}
	}

	// Preserve the gallery context (the active filters) on every onward link so
	// Prev/Next keep walking the same filtered set. `g` marks "came from gallery".
	const navQuery = $derived.by(() => {
		const p = new URLSearchParams();
		for (const [key, value] of Object.entries(data.filters)) if (value) p.set(key, String(value));
		p.set('g', '1');
		return `?${p}`;
	});
	function goNav(id: string) {
		goto(`/photo/${id}${navQuery}`);
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

	// opening the palette cancels any in-flight shift-hold
	$effect(() => {
		if (palette.open && shiftHolding) {
			shiftHolding = false;
			exitFullscreen();
		}
	});

	/* ------------------------------------------------------------------ metadata */
	const srcset = $derived(
		[
			...Object.entries(IMAGE_SIZES).map(([name, edge]) => {
				const scale = Math.min(1, edge / Math.max(photo.width, photo.height));
				return `/img/${photo.id}/${name} ${Math.round(photo.width * scale)}w`;
			}),
			`/img/${photo.id}/full ${photo.width}w`
		].join(', ')
	);

	const dateStr = $derived(
		photo.takenAt
			? new Date(photo.takenAt).toLocaleDateString('en-US', {
					year: 'numeric',
					month: 'long',
					day: 'numeric'
				})
			: null
	);

	/* On squarish screens or with long titles, a side-by-side footer leaves
	   the chips no room — stack the footer vertically instead. */
	const stackedFooter = $derived.by(() => {
		const w = vw || 1280;
		const h = vh || 800;
		if (w < 640) return true;
		const titlePx = photo.title.length * (photo.description ? 15 : 22); // rough glyph estimate
		return w / h < 1.3 || titlePx > w * 0.38;
	});

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
				['focal', 'Focal length', photo.focalLength, photo.focalLength, 'focal', photo.focalLength],
				['aperture', 'Aperture', photo.aperture, photo.aperture, 'aperture', photo.aperture],
				['shutter', 'Shutter speed', photo.shutterSpeed, photo.shutterSpeed, 'shutter', photo.shutterSpeed],
				['iso', 'ISO sensitivity', photo.iso, `ISO ${photo.iso}`, 'iso', String(photo.iso)]
			] as const
		)
			.filter(([, , present]) => present)
			.map(
				([icon, tip, , label, key, value]): MetaItem => ({
					icon,
					tip,
					label: String(label),
					href: `/?${key}=${encodeURIComponent(String(value))}`
				})
			)
	);
</script>

<svelte:window
	bind:innerWidth={vw}
	bind:innerHeight={vh}
	onkeydown={onKeydown}
	onkeyup={onKeyup}
	onmousemove={onMouseMove}
/>

<svelte:head>
	<title>{photo.title} — {data.settings.siteTitle}</title>
	<meta name="description" content={photo.description ?? photo.title} />
	<meta property="og:type" content="article" />
	<meta property="og:title" content={photo.title} />
	<meta property="og:description" content={photo.description ?? data.settings.siteTitle} />
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
				href="/photo/{data.nav.prev.id}{navQuery}"
				class="has-tip leading-0 transition-colors hover:text-accent"
				aria-label="Previous photo">
				<Icon name="arrow-left" size={14} />
				<span class="tip-content">Previous <kbd class="key key-sm key-tip">←</kbd></span>
			</a>
		{:else}
			<span aria-disabled="true" class="opacity-40 leading-0"><Icon name="arrow-left" size={14} /></span>
		{/if}
		<span class="type-label inline-flex min-w-0 items-center gap-x-3 gap-y-1 truncate text-ink-soft">
			{#if navFilters.length}
				{#each navFilters as f, i (f.text)}
					<span class="inline-flex items-center gap-1.5 truncate">
						<Icon name={f.icon} size={13} class="shrink-0" />
						<span class="truncate">{f.text}</span>
						{#if i < navFilters.length - 1}<span class="text-ink-soft/40">·</span>{/if}
					</span>
				{/each}
			{:else}
				All photos
			{/if}
			{#if data.nav}<span class="shrink-0 text-ink-soft/50">{data.nav.index + 1}/{data.nav.total}</span>{/if}
		</span>
		{#if data.nav?.next}
			<a
				href="/photo/{data.nav.next.id}{navQuery}"
				class="has-tip leading-0 transition-colors hover:text-accent"
				aria-label="Next photo">
				<Icon name="arrow-right" size={14} />
				<span class="tip-content leading-0">Next <kbd class="key key-sm key-tip">→</kbd></span>
			</a>
		{:else}
			<span aria-disabled="true" class="opacity-40"><Icon name="arrow-right" size={14} /></span>
		{/if}
	</span>
{/snippet}

{#snippet galleryLinks()}
	<a
		href="/"
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
			class="type-label inline-flex items-center gap-1.5 whitespace-nowrap text-amber-600 transition-colors hover:text-amber-700"
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
			<Icon name="film" size={15} />{photo.filmStock}{photo.filmFormat ? ` · ${photo.filmFormat}` : ''}
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
			href="/photo/{s.id}{data.nav ? navQuery : ''}"
			title={s.title}
			class="block {height} overflow-hidden bg-cover bg-center transition-opacity {current
				? 'opacity-100 outline-2 outline-offset-1 outline-accent'
				: 'opacity-80 hover:opacity-100'}"
			style="aspect-ratio: {s.width} / {s.height}; background-image: url('{s.blurData}')"
		>
			<img src="/img/{s.id}/sm" alt={s.title} loading="lazy" class="h-full w-full object-cover" />
		</a>
	{/each}
{/snippet}

<!-- svelte-ignore a11y_no_static_element_interactions, a11y_click_events_have_key_events -->
<div class="fixed inset-0 overflow-hidden bg-paper [touch-action:manipulation]" onclick={skip} ondblclick={onDblClick} ontouchend={onTouchEnd} onwheel={onWheel}>
	<!-- photograph: laid out at its settled box, animated purely via transform -->
	<div
		class="absolute will-change-transform"
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
		<div class="h-full w-full bg-cover bg-center" style="background-image: url('{photo.blurData}')">
			<img
				bind:this={imgEl}
				src="/img/{photo.id}/md"
				srcset={hiRes ? srcset : undefined}
				sizes={hiRes ? (zoomedIn ? '250vw' : `${Math.round(settled.w)}px`) : undefined}
				fetchpriority="high"
				alt={photo.title}
				class="h-full w-full object-cover transition-opacity duration-700 {imgLoaded
					? 'opacity-100'
					: 'opacity-0'}"
				onload={() => (imgLoaded = true)}
			/>
		</div>
	</div>

	<!-- adaptive scrim keeps the title legible: either a flat blanket over the whole
	     photo, or a tall, softly-feathered ellipse behind the title (admin choice).
		 On mobile (vw < 640), force Blanket mode for space -->
	{#if data.settings.scrimStrength !== 'off'}
		<div
			class="pointer-events-none absolute inset-0 z-10 transition-opacity duration-1000 {titleVisible
				? 'opacity-100'
				: 'opacity-0'}"
			style="background: {data.settings.scrimMode === 'ellipse' && (vw || 1280) >= 640
				? `radial-gradient(ellipse 78% 116% at 50% 50%, ${scrim.glowCore} 0%, ${scrim.glowMid} 42%, transparent 78%)`
				: scrim.glow}"
		></div>
	{/if}

	<!-- postcard title -->
	<h1
		class="type-display pointer-events-none absolute inset-x-0 top-1/2 z-10 -translate-y-1/2 text-center whitespace-nowrap transition-all duration-700 ease-out {titleVisible
			? 'opacity-100'
			: 'opacity-0'}"
		style="
			color: {photo.titleColor};
			font-size: {titleSize}px;
			letter-spacing: {titleVisible ? '0.06em' : '0.14em'};
		"
	>
		{photo.title}
	</h1>

	{#if !sideMode}
		<!-- minimal header -->
		<header
			class="absolute inset-x-0 top-0 z-20 flex items-center justify-between px-4 transition-all duration-700 sm:px-5 {phase ===
			'done'
				? 'opacity-100'
				: 'pointer-events-none -translate-y-2 opacity-0'}"
			style="height: {HEADER_H}px; {chromeStyle}"
		>
			<a href="/" class="type-display text-sm hover:text-accent">{data.settings.siteTitle}</a>
			<div class="flex items-center gap-5">
				{@render galleryLinks()}
			</div>
		</header>

		<!-- metadata footer -->
		<footer
			bind:clientHeight={footerH}
			class="postcard-meta absolute inset-x-0 bottom-0 z-20 border-t border-hairline bg-paper px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] transition-all duration-700 sm:px-5 {phase ===
			'done'
				? 'opacity-100'
				: 'pointer-events-none translate-y-3 opacity-0'}"
			style={chromeStyle}
		>
			<div class={stackedFooter ? 'flex flex-col gap-y-2.5' : 'flex items-end justify-between gap-x-10'}>
				<div class={stackedFooter ? 'flex items-start justify-between gap-6' : 'contents'}>
					<!-- title & description (top-aligned in the columns layout) -->
					<div class="min-w-0 {stackedFooter ? '' : 'max-w-72 shrink-0 self-start lg:max-w-96'}">
						<TickerText
							text={photo.title}
							class="type-display mt-1 {photo.description
								? 'text-xl sm:text-2xl'
								: 'text-2xl sm:text-3xl lg:text-4xl'}"
						/>
						{#if photo.description}
							<p class="line-clamp-2 text-sm leading-snug text-ink-soft">{photo.description}</p>
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
						<span
							data-tip="Date taken"
							class="type-mono inline-flex items-center gap-1.5 whitespace-nowrap text-ink-soft"
						>
							<Icon name="calendar" size={15} />{dateStr}
						</span>
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
		</footer>
	{:else}
		<!-- sidebar: vertical photos keep the full window height -->
		<aside
			class="postcard-meta absolute inset-y-0 right-0 z-20 flex flex-col overflow-y-auto border-l border-hairline bg-paper px-7 py-5 transition-all duration-700 {phase ===
			'done'
				? 'opacity-100'
				: 'pointer-events-none translate-x-4 opacity-0'}"
			style="width: {SIDEBAR_W}px; {chromeStyle}"
		>
			<div class="flex items-center justify-between">
				<a href="/" class="type-display text-sm hover:text-accent">{data.settings.siteTitle}</a>
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
						<span class="type-mono inline-flex items-center gap-2 text-ink-soft">
							<Icon name="calendar" size={15} />{dateStr}
						</span>
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
									class="type-mono inline-flex items-center gap-2.5 text-ink-soft transition-colors hover:text-accent"
								>
									<Icon name={item.icon} size={15} class="text-ink-soft/70" />{item.label}
									<span class="type-mono ml-auto text-[0.6rem] text-ink-soft/50">{item.tip}</span>
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
						<div class="mt-2 flex flex-wrap gap-1.5">
							{@render similarThumbs('h-14', navItems.slice(0, 4))}
						</div>
					</div>
				{/if}
			</div>
		</aside>
	{/if}
</div>
