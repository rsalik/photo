<script lang="ts">
	import { FAVORITE_TAG, type Photo } from '$lib/types';
	import { develop } from '$lib/actions';
	import { photoIntent } from '$lib/predictive-loading';
	import {
		assignRings,
		brandFor,
		carryEdgeTexts,
		frameLabel,
		generateRollBarcodes,
		placeEdgeTexts,
		type PlacedEdge
	} from '$lib/contactSheet';
	import { markMorph } from '$lib/morph';
	import AdvanceArrow from './film/AdvanceArrow.svelte';
	import EdgeText from './film/EdgeText.svelte';
	import RollBarcode from './film/RollBarcode.svelte';
	import PhotoTile from './PhotoTile.svelte';
	import FilmRuler from './FilmRuler.svelte';

	interface Props {
		photos: Photo[];
		rowHeight?: number;
		/** Stable per-view seed so a given sheet always renders the same edge ink,
		 *  DX style, and keeper marks, but different filters look like different rolls. */
		viewKey: string;
		photoQuery?: string;
	}
	let { photos, rowHeight = 300, viewKey, photoQuery = '?g=1' }: Props = $props();

	// Gap between frames, in px. Also the width of the film margin the barcode must
	// bleed across so it reads as one continuous edge code rather than per-frame chunks.
	const GAP = 3;
	const RULER_W = 22;

	let innerW = $state(0);
	let innerH = $state(0);

	const brand = $derived(brandFor(viewKey));

	interface Item {
		photo: Photo;
		ar: number;
		idx: number;
	}
	interface Row {
		items: Item[];
		h: number;
		justified: boolean;
	}

	// Justified-rows layout: pack frames into rows at a target height, growing the
	// final partial row's height only up to a cap so it isn't blown up to full width.
	const rows = $derived.by((): Row[] => {
		const W = innerW || 1180;
		// The sheet fills whatever width it's given. Past ~1600px the frames grow
		// with the viewport (up to 1.6×) so an ultra-wide display enlarges the
		// photographs rather than just packing ever more, smaller frames per row.
		const target =
			W < 480
				? Math.max(150, rowHeight * 0.62)
				: W < 1024
					? rowHeight * 0.8
					: rowHeight * Math.min(1.6, 1 + Math.max(0, W - 1600) / 4200);
		const items: Item[] = photos.map((p, idx): Item => ({ photo: p, ar: p.width / p.height, idx }));
		const out: Row[] = [];
		let row: Item[] = [];
		let arSum = 0;
		const isPortrait = (it: Item) => it.ar <= 0.85;
		const cap = () => (row.some(isPortrait) ? target * 1.45 : target);
		const flush = (justified: boolean) => {
			if (!row.length) return;
			const inner = W - GAP * (row.length - 1);
			const h = justified ? inner / arSum : Math.min(cap(), inner / arSum);
			out.push({ items: row, h, justified });
			row = [];
			arSum = 0;
		};
		for (const it of items) {
			row.push(it);
			arSum += it.ar;
			if ((W - GAP * (row.length - 1)) / arSum <= cap()) flush(true);
		}
		flush(false);
		return out;
	});

	const isFav = (p: Photo) => p.tags.some((t) => t.toLowerCase() === FAVORITE_TAG);
	// When every frame is a favourite (e.g. the Favorites filter), the rings carry no information.
	const allFavs = $derived(photos.length > 0 && photos.every(isFav));
	// keeper marks assigned in order so no two consecutive favourites match
	const ringMap = $derived(
		allFavs ? new Map() : assignRings(photos.filter(isFav).map((p) => p.id), brand.seed)
	);
	const basisFor = (it: Item, row: Row) =>
		row.justified ? `flex: ${it.ar} 1 0; min-width: 0` : `flex: 0 0 ${it.ar * row.h}px`;
	const frameW = (it: Item, row: Row) => it.ar * row.h;

	// the leftover (unjustified) last row is rendered as a separate strip — a little
	// cutting trimmed off the sheet and laid back down by hand, slightly askew. (If
	// every photo fits in one short row there's no main sheet to trim from, so we
	// just show that row in the sheet as normal.)
	const justifiedRows = $derived(rows.filter((r) => r.justified));
	const sheetRows = $derived(justifiedRows.length > 0 ? justifiedRows : rows);
	const trimRow = $derived(
		justifiedRows.length > 0 ? (rows.find((r) => !r.justified) ?? null) : null
	);
	const trimRot = $derived((((brand.seed >>> 3) % 9) - 4) * 0.55); // ~±2.2°

	// The sprocket strip is one continuous run of film cut into rows, so each row
	// starts its hole pattern where the previous row left off. The tile repeats
	// every SPROCKET_TILE px, so shifting the background by the cumulative row
	// width keeps a hole that was clipped at one row's edge whole across the seam.
	const SPROCKET_TILE = 18;
	const sprocketShift = (ri: number) => -((ri * (innerW || 1180)) % SPROCKET_TILE);

	/* ------------------------------------------------------------- strip geometry
	   Each row is one physical segment of the strip. Frames get cumulative px
	   offsets, and the marking bands draw over the segment as a whole (strip
	   coordinates), so edge print runs straight through frame boundaries. Edge
	   text that reaches a row's cut edge is re-rendered on the following row at
	   a negative offset — resuming mid-glyph, exactly where the scissors fell. */
	interface Placed {
		item: Item;
		left: number;
		width: number;
	}
	interface StripRow {
		row: Row;
		placed: Placed[];
		/** exact px width of the segment's frames (≈ sheet width for justified rows) */
		width: number;
		edges: PlacedEdge[];
		/** runs cut at the previous row's right edge, continuing on this one */
		carried: PlacedEdge[];
		trim: boolean;
	}

	const stripRows = $derived.by((): StripRow[] => {
		const build = (row: Row, trim: boolean): StripRow => {
			let x = 0;
			const placed = row.items.map((it): Placed => {
				const p = { item: it, left: x, width: frameW(it, row) };
				x += p.width + GAP;
				return p;
			});
			const frames = placed.map((p) => ({
				idx: p.item.idx,
				left: p.left,
				width: p.width,
				photo: p.item.photo
			}));
			return { row, placed, width: x - GAP, edges: placeEdgeTexts(brand, frames), carried: [], trim };
		};
		const all = sheetRows.map((r) => build(r, false));
		if (trimRow) all.push(build(trimRow, true));
		for (let i = 1; i < all.length; i++) {
			all[i].carried = carryEdgeTexts(all[i - 1].edges, all[i - 1].width);
		}
		return all;
	});

	// Edge barcode for the whole roll. We generate it across the entire frame
	// sequence (not per-frame) so a single DX block can straddle a frame boundary;
	// each frame except the last in its row carries a trailing `gap` the bars are
	// allowed to bleed into, so the inter-frame margin doesn't slice the code.
	// Exact (fractional) frame widths keep the generator's roll coordinates in
	// lockstep with the rendered svg positions — rounding here would shift each
	// seam's two halves apart by up to half a pixel.
	const rollBarcodes = $derived.by(() => {
		const frames: { idx: number; length: number; gap: number }[] = [];
		for (const r of rows) {
			r.items.forEach((it, i) => {
				frames.push({
					idx: it.idx,
					length: Math.max(20, frameW(it, r)),
					gap: i < r.items.length - 1 ? GAP : 0
				});
			});
		}
		frames.sort((a, b) => a.idx - b.idx);
		return generateRollBarcodes(brand, frames, 250, 110, 14);
	});
</script>

{#snippet filmStrip(sr: StripRow, ri: number)}
	{@const shift = sprocketShift(ri)}
	{@const trimWidth = `width: ${Math.round(sr.width)}px; margin-inline: auto;`}
	{@const sprocketStyle = sr.trim
		? `background-position-x: ${shift}px; ${trimWidth}`
		: `background-position-x: ${shift}px;`}
	<div
		class="sheet-strip"
		class:sheet-strip-trim={sr.trim}
		style="color: {brand.color}; {sr.trim ? `transform: rotate(${trimRot}deg);` : ''}"
	>
		<!-- 1 · top markings: frame numbers + edge print in strip coordinates,
		     plus any run cut at the previous row's edge, resuming mid-glyph -->
		<div class="mark-band" style={sr.trim ? trimWidth : ''}>
			{#each sr.placed as pl (pl.item.photo.id)}
				<span class="mark-num" style="left: {pl.left + 0.4 * pl.width}px">{frameLabel(pl.item.idx)}</span>
			{/each}
			{#each sr.edges as e, i (i)}<EdgeText te={e.te} x={e.x} />{/each}
			{#each sr.carried as e, i (i)}<EdgeText te={e.te} x={e.x} />{/each}
		</div>

		<!-- 2 · top sprockets -->
		<div class="film-edge sprocket-band" style={sprocketStyle}></div>

		<!-- 3 · the film images -->
		<div class="flex" style="height: {sr.row.h}px; gap: {GAP}px; {sr.trim ? 'justify-content: center;' : ''}">
			{#each sr.placed as pl (pl.item.photo.id)}
				{@const photo = pl.item.photo}
				{@const ring = ringMap.get(photo.id) ?? null}
				<a href="/photo/{photo.slug}{photoQuery}" use:photoIntent={photo} class="sheet-frame group" style={basisFor(pl.item, sr.row)} aria-label={photo.title} onclick={markMorph}>
					<div use:develop={Math.min((pl.item.idx % 12) * 50, 360)} class="h-full w-full">
						<PhotoTile {photo} displayWidth={pl.width} eager={ri < 2} showTitle />
					</div>
					{#if ring}
						<svg class="pointer-events-none absolute inset-0 h-full w-full" viewBox="0 0 100 100" preserveAspectRatio="none" style="transform: rotate({ring.rotate}deg)" aria-hidden="true">
							<path d={ring.path} fill="none" stroke={ring.color} stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" vector-effect="non-scaling-stroke" opacity="0.9" />
						</svg>
					{/if}
				</a>
			{/each}
		</div>

		<!-- 4 · bottom sprockets -->
		<div class="film-edge sprocket-band" style={sprocketStyle}></div>

		<!-- 5 · bottom markings: a DX barcode sits in the gaps either side of the bold
		     frame number, with the half-frame "NA" marker near the right -->
		<div class="mark-band mark-band-b" style={sr.trim ? trimWidth : ''}>
			{#each sr.placed as pl (pl.item.photo.id)}
				<RollBarcode x={pl.left} w={Math.max(20, pl.width)} gap={GAP} rects={rollBarcodes.get(pl.item.idx) ?? []} />
				<span class="mark-num mark-num-b" style="left: {pl.left + 0.4 * pl.width}px">{frameLabel(pl.item.idx)}</span>
				<span class="mark-adv" style="left: {pl.left + 0.86 * pl.width}px">
					<span class="mark-adv-label">{frameLabel(pl.item.idx)}A</span>
					<AdvanceArrow />
				</span>
			{/each}
		</div>
	</div>
{/snippet}

<div class="contact-sheet" style="--edge: {brand.color}">
	<div class="flex">
		<div class="sheet-ruler-col" style="width: {RULER_W}px">
			<FilmRuler length={innerH} color={brand.color} width={RULER_W} />
		</div>

		<div bind:clientWidth={innerW} bind:clientHeight={innerH} class="gallery-spotlight min-w-0 flex-1">
			<!-- the trimmed tail of the roll (last, unjustified row) stays on the sheet
			     (the off-black base and the ruler carry on past it) but is laid down a
			     touch askew, by hand -->
			{#each stripRows as sr, ri (ri)}
				{@render filmStrip(sr, ri)}
			{/each}
		</div>
	</div>
</div>
