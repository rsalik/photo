<script lang="ts">
	import { onMount } from 'svelte';
	import { FAVORITE_TAG, type Photo } from '$lib/types';
	import { photoDate, photoDateTime } from '$lib/dates';
	import { markMorph } from '$lib/morph';
	import { develop } from '$lib/actions';
	import { photoIntent } from '$lib/predictive-loading';
	import {
		assignRings,
		brandFor,
		DEFAULT_ROLL_KEY,
		frameLabel,
		generateRollBarcodes,
		placeEdgeTexts
	} from '$lib/contactSheet';
	import { photoMetaChips } from '$lib/photo-meta';
	import AdvanceArrow from './film/AdvanceArrow.svelte';
	import EdgeText from './film/EdgeText.svelte';
	import RollBarcode from './film/RollBarcode.svelte';
	import Icon from './Icon.svelte';
	import PhotoTile from './PhotoTile.svelte';

	interface Props {
		photos: Photo[];
		albumContext?: string;
		photoQuery?: string;
	}
	let { photos, albumContext = '', photoQuery = '?g=1' }: Props = $props();
	const brand = $derived(brandFor(albumContext || DEFAULT_ROLL_KEY));

	const STRIP_H = 188; // photo height inside the strip
	const GAP = 3; // inter-frame margin (matches the contact sheet)
	const STICK = 0.6; // fraction of a photo's scroll where its frame holds still

	// ---- film markings (identical generators to the contact sheet) ----
	const frameW = $derived(
		photos.map((p) => {
			const ar = p.width / p.height;
			return Math.round(Math.max(STRIP_H * 0.58, Math.min(STRIP_H * 1.7, STRIP_H * ar)));
		})
	);
	const frameLeft = $derived.by(() => {
		let x = 0;
		const l: number[] = [];
		for (const w of frameW) {
			l.push(x);
			x += w + GAP;
		}
		return l;
	});
	const frameCenter = $derived(frameLeft.map((l, i) => l + frameW[i] / 2));

	// The roll is one uncut strip, so edge print simply runs through frame
	// boundaries; strip coordinates come straight from the cumulative lefts.
	const edgeTexts = $derived(
		placeEdgeTexts(
			brand,
			photos.map((p, i) => ({ idx: i, left: frameLeft[i], width: frameW[i], photo: p }))
		)
	);
	// total width of the roll (last frame's right edge), used to tether the first
	// and last frames to the screen edges
	const trackW = $derived(
		frameCenter.length ? frameCenter[frameCenter.length - 1] + frameW[frameW.length - 1] / 2 : 0
	);
	const rollBarcodes = $derived.by(() => {
		const frames = photos.map((p, i) => ({
			idx: i,
			length: Math.max(20, frameW[i]),
			gap: i < photos.length - 1 ? GAP : 0
		}));
		return generateRollBarcodes(brand, frames, 250, 110, 14);
	});
	const isFav = (p: Photo) => p.tags.some((t) => t.toLowerCase() === FAVORITE_TAG);
	const ringMap = $derived(assignRings(photos.filter(isFav).map((p) => p.id), brand.seed));


	// ---- scroll choreography: vertical scroll drives both tracks horizontally ----
	let vw = $state(0);
	let vh = $state(0);
	let headerH = $state(0);
	let stripX = $state(0);
	let detailX = $state(0);
	let active = $state(0);
	let reducedMotion = $state(false);
	let lvmEl: HTMLElement;
	let lvmTop = 0; // document Y where the scroll choreography begins

	const seg = () => Math.max(380, vh * 0.82); // scroll px allotted per photo
	// A sticky stage needs one viewport of its own plus enough travel to move
	// between every pair of frames. The old n*segment formula released early,
	// before the final photograph could settle (and under-sized one-photo views).
	const totalHeight = $derived(
		vh ? Math.max(1, vh - headerH) + Math.max(0, photos.length - 1) * seg() : 600
	);

	function centerOf(f: number): number {
		const n = photos.length;
		const i = Math.max(0, Math.min(n - 1, Math.floor(f)));
		const j = Math.min(n - 1, i + 1);
		return frameCenter[i] + (frameCenter[j] - frameCenter[i]) * (f - i);
	}

	let targetStripX = 0;
	let targetDetailX = 0;
	let raf = 0;
	const EASE = 0.16; // how quickly the tracks chase the scroll target (lower = smoother)

	function computeTargets() {
		const n = photos.length;
		// progress starts once the stage pins under the header
		const p = Math.max(0, Math.min(n - 1, (window.scrollY - (lvmTop - headerH)) / seg()));
		const i = Math.floor(p);
		const t = p - i;
		let f = i;
		if (t > STICK) {
			const m = (t - STICK) / (1 - STICK);
			f = i + m * m * (3 - 2 * m); // smoothstep glide between frames
		}
		// centre the active frame, but tether the ends: the first frame's left edge
		// stays pinned to the screen's left edge and the last frame's right edge to
		// the right edge, so the roll never pulls "paper" past either window edge.
		const centred = vw / 2 - centerOf(f);
		targetStripX = vw && trackW > vw ? Math.min(0, Math.max(vw - trackW, centred)) : centred;
		targetDetailX = -f * vw; // each detail card is one viewport wide
		active = Math.min(n - 1, Math.round(f));
	}

	// rAF loop eases the actual transforms toward the target for fluid, damped motion
	function tick() {
		raf = 0;
		const dx = targetStripX - stripX;
		const dd = targetDetailX - detailX;
		if (Math.abs(dx) < 0.4 && Math.abs(dd) < 0.4) {
			stripX = targetStripX;
			detailX = targetDetailX;
			return;
		}
		stripX += dx * EASE;
		detailX += dd * EASE;
		raf = requestAnimationFrame(tick);
	}
	function onScroll() {
		computeTargets();
		if (reducedMotion) {
			stripX = targetStripX;
			detailX = targetDetailX;
			return;
		}
		if (!raf) raf = requestAnimationFrame(tick);
	}

	// The roll advances with vertical page scroll, but a horizontal swipe is the
	// natural gesture on a film strip — so map it onto that same scroll: swiping
	// right-to-left scrolls down (forward through the roll), left-to-right scrolls
	// up. A flick keeps going with decaying momentum. touch-action:pan-y leaves
	// vertical panning to the browser (with its own momentum); we own horizontal.
	let stageEl: HTMLElement;
	let tStartX = 0;
	let tStartY = 0;
	let tLastX = 0;
	let tLastT = 0;
	let axis: 'none' | 'h' | 'v' = 'none';
	let vel = 0; // finger x-velocity, px/ms (negative swiping left)
	let momo = 0;
	const H_GAIN = 1.35; // a swipe of the screen advances a little over one frame

	function onTouchStart(e: TouchEvent) {
		if (momo) cancelAnimationFrame(momo), (momo = 0);
		const t = e.touches[0];
		tStartX = tLastX = t.clientX;
		tStartY = t.clientY;
		tLastT = e.timeStamp;
		axis = 'none';
		vel = 0;
	}
	function onTouchMove(e: TouchEvent) {
		const t = e.touches[0];
		if (axis === 'none' && Math.hypot(t.clientX - tStartX, t.clientY - tStartY) > 8) {
			axis = Math.abs(t.clientX - tStartX) > Math.abs(t.clientY - tStartY) ? 'h' : 'v';
		}
		if (axis === 'h') {
			const step = tLastX - t.clientX; // >0 when swiping left → scroll down
			window.scrollBy(0, step * H_GAIN);
			const dt = e.timeStamp - tLastT;
			if (dt > 0) vel = (t.clientX - tLastX) / dt;
			e.preventDefault();
		}
		tLastX = t.clientX;
		tLastT = e.timeStamp;
	}
	function onTouchEnd() {
		if (axis !== 'h') return;
		if (reducedMotion) return;
		let v = -vel * H_GAIN; // scroll velocity, px/ms (down positive)
		let prev = 0;
		const decay = (now: number) => {
			if (!prev) prev = now;
			const dt = now - prev;
			prev = now;
			window.scrollBy(0, v * dt);
			v *= Math.pow(0.9, dt / 16); // friction
			momo = Math.abs(v) > 0.02 ? requestAnimationFrame(decay) : 0;
		};
		if (Math.abs(v) > 0.05) momo = requestAnimationFrame(decay);
	}

	onMount(() => {
		const motion = window.matchMedia('(prefers-reduced-motion: reduce)');
		const syncMotion = () => (reducedMotion = motion.matches);
		syncMotion();
		motion.addEventListener('change', syncMotion);
		const sync = () => {
			vw = window.innerWidth;
			vh = window.innerHeight;
			headerH = (document.querySelector('header')?.offsetHeight ?? 0) || 0;
			lvmTop = (lvmEl?.getBoundingClientRect().top ?? 0) + window.scrollY;
			computeTargets();
			stripX = targetStripX; // snap on layout changes (no easing)
			detailX = targetDetailX;
		};
		sync();
		window.addEventListener('scroll', onScroll, { passive: true });
		window.addEventListener('resize', sync);
		stageEl?.addEventListener('touchstart', onTouchStart, { passive: true });
		stageEl?.addEventListener('touchmove', onTouchMove, { passive: false });
		stageEl?.addEventListener('touchend', onTouchEnd, { passive: true });
		return () => {
			window.removeEventListener('scroll', onScroll);
			window.removeEventListener('resize', sync);
			motion.removeEventListener('change', syncMotion);
			stageEl?.removeEventListener('touchstart', onTouchStart);
			stageEl?.removeEventListener('touchmove', onTouchMove);
			stageEl?.removeEventListener('touchend', onTouchEnd);
			if (raf) cancelAnimationFrame(raf);
			if (momo) cancelAnimationFrame(momo);
		};
	});
</script>

<div class="lvm" bind:this={lvmEl} style="height: {totalHeight}px">
	<div bind:this={stageEl} class="lvm-stage" style="top: {headerH}px; height: calc(100dvh - {headerH}px)">
		<!-- film strip: one continuous roll, full contact-sheet markings -->
		<div class="lvm-strip" style="color: {brand.color}">
			<div class="sheet-strip lvm-track py-1" style="transform: translate3d({stripX}px,0,0)">
				<div class="mark-band" style="width: {trackW}px">
					{#each photos as photo, i (photo.id)}
						<span class="mark-num" style="left: {frameLeft[i] + 0.4 * frameW[i]}px">{frameLabel(i)}</span>
					{/each}
					{#each edgeTexts as e, i (i)}<EdgeText te={e.te} x={e.x} />{/each}
				</div>
				<div class="film-edge sprocket-band"></div>
				<div class="flex" style="height: {STRIP_H}px; gap: {GAP}px">
					{#each photos as photo, i (photo.id)}
						{@const ring = ringMap.get(photo.id) ?? null}
						<a
							href="/photo/{photo.slug}{photoQuery}" use:photoIntent={photo}
							onclick={markMorph}
							class="sheet-frame lvm-frame"
							class:active={i === active}
							style="flex: 0 0 {frameW[i]}px"
							aria-label={photo.title}
							aria-hidden={i !== active}
							tabindex={i === active ? 0 : -1}
						>
							<div use:develop={Math.min((i % 12) * 50, 360)} class="h-full w-full">
									<PhotoTile {photo} displayWidth={frameW[i]} eager={i < 4} nearby={i >= active - 1 && i <= active + 2} showTitle fit="contain" />
							</div>
							{#if ring}
								<svg class="pointer-events-none absolute inset-0 h-full w-full" viewBox="0 0 100 100" preserveAspectRatio="none" style="transform: rotate({ring.rotate}deg)" aria-hidden="true">
									<path d={ring.path} fill="none" stroke={ring.color} stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" vector-effect="non-scaling-stroke" opacity="0.9" />
								</svg>
							{/if}
						</a>
					{/each}
				</div>
				<div class="film-edge sprocket-band"></div>
				<div class="mark-band mark-band-b" style="width: {trackW}px">
					{#each photos as photo, i (photo.id)}
						<RollBarcode x={frameLeft[i]} w={frameW[i]} gap={GAP} rects={rollBarcodes.get(i) ?? []} />
						<span class="mark-num mark-num-b" style="left: {frameLeft[i] + 0.4 * frameW[i]}px">{frameLabel(i)}</span>
						<span class="mark-adv" style="left: {frameLeft[i] + 0.86 * frameW[i]}px"><span class="mark-adv-label">{frameLabel(i)}A</span><AdvanceArrow /></span>
					{/each}
				</div>
			</div>
		</div>

		<!-- details: a horizontal track, one card per photo, synced to the strip -->
		<div class="lvm-details">
			<div class="lvm-detail-track" style="transform: translate3d({detailX}px,0,0)">
				{#each photos as photo, i (photo.id)}
					{@const fav = isFav(photo)}
					<section
						class="lvm-detail"
						style="width: {vw}px"
						aria-hidden={i !== active}
						inert={i !== active}
					>
						<span class="type-mono text-ink-soft">Photo {i + 1} / {photos.length}</span>
						<a href="/photo/{photo.slug}{photoQuery}" use:photoIntent={photo} onclick={markMorph} class="block">
							<h2 class="type-display mt-1 text-3xl leading-tight">{photo.title}</h2>
						</a>
						{#if photo.takenAt}<p class="type-label mt-2 w-fit text-ink-soft" data-tip={photoDateTime(photo.takenAt)}>{photoDate(photo.takenAt)}</p>{/if}
						{#if photo.description}
							<p class="mt-3 line-clamp-3 max-w-prose text-sm leading-relaxed text-ink-soft">{photo.description}</p>
						{/if}
						<div class="mt-4 flex flex-wrap gap-x-5 gap-y-2">
							{#each photoMetaChips(photo) as m (m.key + m.href)}
								<a href={m.href} class="type-mono inline-flex items-center gap-1.5 whitespace-nowrap text-ink-soft hover:text-accent">
									<Icon name={m.icon} size={14} />{m.label}
								</a>
							{/each}
						</div>
						{#if photo.albums.length || photo.tags.length || fav}
							<div class="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-hairline pt-4">
								{#if fav}<a href="/?favorite=1" class="type-label inline-flex items-center gap-1.5 text-amber-700"><Icon name="star" size={14} />Favorite</a>{/if}
								{#each photo.albums as album (album)}
									<a href="/?album={encodeURIComponent(album)}" class="type-label inline-flex items-center gap-1.5 text-accent"><Icon name="album" size={14} />{album}</a>
								{/each}
								{#each photo.tags as tag (tag)}
									{#if tag.toLowerCase() !== FAVORITE_TAG}
										<a href="/?tag={encodeURIComponent(tag)}" class="type-label inline-flex items-center gap-1.5 text-ink-soft"><Icon name="tag" size={14} />{tag}</a>
									{/if}
								{/each}
							</div>
						{/if}
					</section>
				{/each}
			</div>
		</div>
	</div>
</div>
