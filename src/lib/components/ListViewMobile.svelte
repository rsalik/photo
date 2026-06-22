<script lang="ts">
	import { onMount } from 'svelte';
	import { FAVORITE_TAG, type Photo } from '$lib/types';
	import { markMorph } from '$lib/morph';
	import { brandFor } from '$lib/contactSheet';
	import Icon, { type IconName } from './Icon.svelte';
	import PhotoTile from './PhotoTile.svelte';

	interface Props {
		photos: Photo[];
		albumContext?: string;
	}
	let { photos, albumContext = '' }: Props = $props();
	const q = $derived(albumContext ? `?album=${encodeURIComponent(albumContext)}` : '');
	const brand = $derived(brandFor(albumContext || 'ne'));

	const STRIP_H = 230; // film strip height, px
	const GAP = 3; // inter-frame margin, px
	const STICK = 0.58; // fraction of a panel where the active frame holds still

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
	const isFav = (p: Photo) => p.tags.some((t) => t.toLowerCase() === FAVORITE_TAG);

	// frame geometry: each frame's width follows its aspect ratio, clamped so very
	// wide/tall frames stay legible. centres are cumulative for translateX maths.
	const frameW = $derived(
		photos.map((p) => {
			const ar = p.width / p.height;
			return Math.round(Math.max(STRIP_H * 0.58, Math.min(STRIP_H * 1.6, STRIP_H * ar)));
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

	let vw = $state(0);
	let stripX = $state(0);
	let active = $state(0);
	let panelsEl: HTMLElement;
	let stripEl: HTMLElement;
	let stripH = STRIP_H;
	let panelTops: number[] = [];

	// translateX that centres a fractional frame index in the viewport
	function centerAt(f: number): number {
		const n = photos.length;
		const i = Math.max(0, Math.min(n - 1, Math.floor(f)));
		const j = Math.min(n - 1, i + 1);
		const c = frameCenter[i] + (frameCenter[j] - frameCenter[i]) * (f - i);
		return vw / 2 - c;
	}

	function measure() {
		if (!panelsEl) return;
		stripH = stripEl?.offsetHeight ?? STRIP_H;
		panelTops = [...panelsEl.children].map(
			(el) => (el as HTMLElement).getBoundingClientRect().top + window.scrollY
		);
	}

	let raf = 0;
	function update() {
		raf = 0;
		if (!panelTops.length) return;
		const y = window.scrollY + stripH; // reference line: just under the sticky strip
		let i = 0;
		while (i < panelTops.length - 1 && panelTops[i + 1] <= y) i++;
		const top = panelTops[i];
		const next = panelTops[i + 1] ?? top + window.innerHeight;
		const t = Math.max(0, Math.min(1, (y - top) / Math.max(1, next - top)));
		// hold on frame i for the first STICK of the panel, then ease across to i+1
		let f = i;
		if (t > STICK) {
			const m = (t - STICK) / (1 - STICK);
			f = i + m * m * (3 - 2 * m); // smoothstep glide
		}
		stripX = centerAt(f);
		active = Math.min(photos.length - 1, Math.round(f));
	}
	function onScroll() {
		if (!raf) raf = requestAnimationFrame(update);
	}

	onMount(() => {
		const sync = () => {
			vw = window.innerWidth;
			measure();
			update();
		};
		sync();
		const ro = new ResizeObserver(sync);
		ro.observe(panelsEl);
		window.addEventListener('scroll', onScroll, { passive: true });
		window.addEventListener('resize', sync);
		// images settling can shift panel offsets; re-measure shortly after mount
		const t = setTimeout(sync, 500);
		return () => {
			window.removeEventListener('scroll', onScroll);
			window.removeEventListener('resize', sync);
			ro.disconnect();
			clearTimeout(t);
			if (raf) cancelAnimationFrame(raf);
		};
	});
</script>

<div class="lvm" style="--strip-h: {STRIP_H}px">
	<!-- sticky horizontal film strip -->
	<div class="lvm-strip" bind:this={stripEl} style="color: {brand.color}">
		<span class="lvm-rail film-edge sprocket-band" aria-hidden="true"></span>
		<div class="lvm-track" style="transform: translate3d({stripX}px, 0, 0); gap: {GAP}px">
			{#each photos as photo, i (photo.id)}
				<a
					href="/photo/{photo.id}{q}"
					onclick={markMorph}
					class="lvm-frame"
					class:active={i === active}
					style="width: {frameW[i]}px"
					aria-label={photo.title}
				>
					<PhotoTile {photo} eager={i < 3} />
					{#if isFav(photo)}
						<span class="absolute top-1.5 left-1.5 text-amber-300"><Icon name="star" size={13} /></span>
					{/if}
					<span class="lvm-num">{i + 1}</span>
				</a>
			{/each}
		</div>
		<span class="lvm-rail film-edge sprocket-band" aria-hidden="true"></span>
	</div>

	<!-- per-photo detail panels; the active one is read while its frame holds above -->
	<div class="lvm-panels" bind:this={panelsEl}>
		{#each photos as photo, i (photo.id)}
			{@const fav = isFav(photo)}
			<section class="lvm-panel" class:lvm-panel-on={i === active}>
				<span class="lvm-panel-frame type-mono">Frame {i + 1} / {photos.length}</span>
				<a href="/photo/{photo.id}{q}" onclick={markMorph} class="min-w-0">
					<h2 class="type-display mt-1 text-3xl leading-tight">{photo.title}</h2>
				</a>
				{#if dateOf(photo)}<p class="type-label mt-2 text-ink-soft">{dateOf(photo)}</p>{/if}
				{#if photo.description}
					<p class="mt-3 max-w-prose text-sm leading-relaxed text-ink-soft">{photo.description}</p>
				{/if}

				<div class="mt-4 flex flex-wrap gap-x-5 gap-y-2">
					{#each metaFor(photo) as m (m.key + m.href)}
						<a
							href={m.href}
							class="type-mono inline-flex items-center gap-1.5 whitespace-nowrap text-ink-soft transition-colors hover:text-accent"
						>
							<Icon name={m.icon} size={14} />{m.label}
						</a>
					{/each}
				</div>

				{#if photo.albums.length || photo.tags.length || fav}
					<div class="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-hairline pt-4">
						{#if fav}
							<a href="/?favorite=1" class="type-label inline-flex items-center gap-1.5 text-amber-600">
								<Icon name="star" size={14} />Favorite
							</a>
						{/if}
						{#each photo.albums as album (album)}
							<a href="/?album={encodeURIComponent(album)}" class="type-label inline-flex items-center gap-1.5 text-accent">
								<Icon name="album" size={14} />{album}
							</a>
						{/each}
						{#each photo.tags as tag (tag)}
							{#if tag.toLowerCase() !== FAVORITE_TAG}
								<a href="/?tag={encodeURIComponent(tag)}" class="type-label inline-flex items-center gap-1.5 text-ink-soft">
									<Icon name="tag" size={14} />{tag}
								</a>
							{/if}
						{/each}
					</div>
				{/if}
			</section>
		{/each}
	</div>
</div>
