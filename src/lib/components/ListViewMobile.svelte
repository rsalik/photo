<script lang="ts">
	import { onMount } from 'svelte';
	import { FAVORITE_TAG, type Photo } from '$lib/types';
	import { markMorph } from '$lib/morph';
	import { develop } from '$lib/actions';
	import {
		assignRings,
		brandFor,
		frameLabel,
		generateRollBarcodes,
		topEdge
	} from '$lib/contactSheet';
	import Icon, { type IconName } from './Icon.svelte';
	import PhotoTile from './PhotoTile.svelte';

	interface Props {
		photos: Photo[];
		albumContext?: string;
	}
	let { photos, albumContext = '' }: Props = $props();
	const q = $derived(albumContext ? `?album=${encodeURIComponent(albumContext)}` : '');
	const brand = $derived(brandFor(albumContext || 'ne'));

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
	const frameCenter = $derived.by(() => {
		let x = 0;
		const c: number[] = [];
		for (const w of frameW) {
			c.push(x + w / 2);
			x += w + GAP;
		}
		return c;
	});
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

	// ---- details ----
	interface Meta {
		icon: IconName;
		label: string;
		href: string;
		key: string;
	}
	function metaFor(p: Photo): Meta[] {
		const out: Meta[] = [];
		const add = (icon: IconName, key: string, value: string | null | undefined, label = value) => {
			if (value) out.push({ icon, key, href: `/?${key}=${encodeURIComponent(value)}`, label: String(label) });
		};
		if (p.analog && p.filmStock)
			add('film', 'film', p.filmStock, `${p.filmStock}${p.filmFormat ? ` · ${p.filmFormat}` : ''}`);
		add('location', 'location', p.location);
		add('camera', 'camera', p.cameraModel);
		add('lens', 'lens', p.lens);
		add('focal', 'focal', p.focalLength);
		add('aperture', 'aperture', p.aperture);
		add('shutter', 'shutter', p.shutterSpeed);
		if (p.iso) add('iso', 'iso', String(p.iso), `ISO ${p.iso}`);
		return out;
	}
	const dateOf = (p: Photo) =>
		p.takenAt
			? new Date(p.takenAt).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })
			: null;

	// ---- scroll choreography: vertical scroll drives both tracks horizontally ----
	let vw = $state(0);
	let vh = $state(0);
	let headerH = $state(0);
	let stripX = $state(0);
	let detailX = $state(0);
	let active = $state(0);
	let lvmEl: HTMLElement;
	let lvmTop = 0; // document Y where the scroll choreography begins

	const seg = () => Math.max(380, vh * 0.82); // scroll px allotted per photo
	const totalHeight = $derived(Math.max(1, photos.length) * (vh ? seg() : 600));

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
		targetStripX = vw / 2 - centerOf(f);
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
		if (!raf) raf = requestAnimationFrame(tick);
	}

	onMount(() => {
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
		return () => {
			window.removeEventListener('scroll', onScroll);
			window.removeEventListener('resize', sync);
			if (raf) cancelAnimationFrame(raf);
		};
	});
</script>

{#snippet barcode(w: number, idx: number)}
	<svg class="mark-barcode" width={w + GAP} height="9" viewBox="0 0 {w + GAP} 9" preserveAspectRatio="none" aria-hidden="true">
		{#each rollBarcodes.get(idx) || [] as r, i (i)}
			<rect x={r.offsetAlong} y={r.offsetAcross} width={r.widthAlong} height={r.heightAcross} fill="currentColor" />
		{/each}
	</svg>
{/snippet}

{#snippet advArrow()}
	<svg width="14" height="9" viewBox="0 0 14 9" class="block" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
		<path d="M1 4.5 H11" /><path d="M7.5 1.5 L12 4.5 L7.5 7.5" />
	</svg>
{/snippet}

{#snippet edgeText(te: NonNullable<ReturnType<typeof topEdge>>)}
	<span class="mark-edge" style="left: {te.pos * 100}%">
		{#each te.segments as s, i (i)}{#if s.bold}<b>{s.t}</b>{:else}{s.t}{/if}{/each}
	</span>
{/snippet}

<div class="lvm" bind:this={lvmEl} style="height: {totalHeight}px">
	<div class="lvm-stage" style="top: {headerH}px; height: calc(100dvh - {headerH}px)">
		<!-- film strip: one continuous roll, full contact-sheet markings -->
		<div class="lvm-strip" style="color: {brand.color}">
			<div class="sheet-strip lvm-track py-1" style="transform: translate3d({stripX}px,0,0)">
				<div class="mark-band flex" style="gap: {GAP}px">
					{#each photos as photo, i (photo.id)}
						{@const te = topEdge(brand, i, photo)}
						<div class="mark-cell" style="flex: 0 0 {frameW[i]}px">
							<span class="mark-num">{frameLabel(i)}</span>
							{#if te && frameW[i] > 80}{@render edgeText(te)}{/if}
						</div>
					{/each}
				</div>
				<div class="film-edge sprocket-band"></div>
				<div class="flex" style="height: {STRIP_H}px; gap: {GAP}px">
					{#each photos as photo, i (photo.id)}
						{@const ring = ringMap.get(photo.id) ?? null}
						<a href="/photo/{photo.id}{q}" onclick={markMorph} class="sheet-frame lvm-frame" class:active={i === active} style="flex: 0 0 {frameW[i]}px" aria-label={photo.title}>
							<div use:develop={Math.min((i % 12) * 50, 360)} class="h-full w-full">
								<PhotoTile {photo} displayWidth={frameW[i]} eager={i < 4} showTitle />
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
				<div class="mark-band mark-band-b flex" style="gap: {GAP}px">
					{#each photos as photo, i (photo.id)}
						<div class="mark-cell mark-cell-b" style="flex: 0 0 {frameW[i]}px">
							{@render barcode(frameW[i], i)}
							<span class="mark-num mark-num-b">{frameLabel(i)}</span>
							<span class="mark-adv"><span class="mark-adv-label">{frameLabel(i)}A</span>{@render advArrow()}</span>
						</div>
					{/each}
				</div>
			</div>
		</div>

		<!-- details: a horizontal track, one card per photo, synced to the strip -->
		<div class="lvm-details">
			<div class="lvm-detail-track" style="transform: translate3d({detailX}px,0,0)">
				{#each photos as photo, i (photo.id)}
					{@const fav = isFav(photo)}
					<section class="lvm-detail" style="width: {vw}px">
						<span class="type-mono text-ink-soft">Photo {i + 1} / {photos.length}</span>
						<a href="/photo/{photo.id}{q}" onclick={markMorph} class="block">
							<h2 class="type-display mt-1 text-3xl leading-tight">{photo.title}</h2>
						</a>
						{#if dateOf(photo)}<p class="type-label mt-2 text-ink-soft">{dateOf(photo)}</p>{/if}
						{#if photo.description}
							<p class="mt-3 line-clamp-3 max-w-prose text-sm leading-relaxed text-ink-soft">{photo.description}</p>
						{/if}
						<div class="mt-4 flex flex-wrap gap-x-5 gap-y-2">
							{#each metaFor(photo) as m (m.key + m.href)}
								<a href={m.href} class="type-mono inline-flex items-center gap-1.5 whitespace-nowrap text-ink-soft hover:text-accent">
									<Icon name={m.icon} size={14} />{m.label}
								</a>
							{/each}
						</div>
						{#if photo.albums.length || photo.tags.length || fav}
							<div class="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-hairline pt-4">
								{#if fav}<a href="/?favorite=1" class="type-label inline-flex items-center gap-1.5 text-amber-600"><Icon name="star" size={14} />Favorite</a>{/if}
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
