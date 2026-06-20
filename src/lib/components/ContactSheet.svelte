<script lang="ts">
	import { FAVORITE_TAG, type Photo } from '$lib/types';
	import { develop } from '$lib/actions';
	import { assignRings, brandFor, generateRollBarcodes, frameLabel, topEdge } from '$lib/contactSheet';
	import { markMorph } from '$lib/morph';
	import PhotoTile from './PhotoTile.svelte';
	import FilmRuler from './FilmRuler.svelte';

	interface Props {
		photos: Photo[];
		rowHeight?: number;
		/** Stable per-view seed so a given sheet always renders the same edge ink,
		 *  DX style, and keeper marks, but different filters look like different rolls. */
		viewKey: string;
		albumContext?: string;
	}
	let { photos, rowHeight = 300, viewKey, albumContext = '' }: Props = $props();
	const qy = $derived(albumContext ? `?album=${encodeURIComponent(albumContext)}` : '');

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
		const target = W < 480 ? Math.max(150, rowHeight * 0.62) : W < 1024 ? rowHeight * 0.8 : rowHeight;
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
	// keeper marks assigned in order so no two consecutive favourites match
	const ringMap = $derived(assignRings(photos.filter(isFav).map((p) => p.id), brand.seed));
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

	// Combined pixel width of a row's frames (used to size the trimmed tail's
	// sprockets to its actual content rather than the full sheet width).
	const rowFramesWidth = (row: Row) =>
		row.items.reduce((sum, it, i) => sum + frameW(it, row) + (i > 0 ? GAP : 0), 0);

	// The sprocket strip is one continuous run of film cut into rows, so each row
	// starts its hole pattern where the previous row left off. The tile repeats
	// every SPROCKET_TILE px, so shifting the background by the cumulative row
	// width keeps a hole that was clipped at one row's edge whole across the seam.
	const SPROCKET_TILE = 18;
	const sprocketShift = (ri: number) => -((ri * (innerW || 1180)) % SPROCKET_TILE);

	// Edge barcode for the whole roll. We generate it across the entire frame
	// sequence (not per-frame) so a single DX block can straddle a frame boundary;
	// each frame except the last in its row carries a trailing `gap` the bars are
	// allowed to bleed into, so the inter-frame margin doesn't slice the code.
	const rollBarcodes = $derived.by(() => {
		const frames: { idx: number; length: number; gap: number }[] = [];
		for (const r of rows) {
			r.items.forEach((it, i) => {
				frames.push({
					idx: it.idx,
					length: Math.max(20, Math.round(frameW(it, r))),
					gap: i < r.items.length - 1 ? GAP : 0
				});
			});
		}
		frames.sort((a, b) => a.idx - b.idx);
		return generateRollBarcodes(brand, frames, 250, 110, 14);
	});
</script>

{#snippet barcode(w: number, idx: number)}
	<!-- The viewBox extends one gap past the frame so bars that bleed into the
	     margin render in the seam (cell overflow is visible), keeping the code
	     continuous across the frame border instead of being clipped by it. -->
	<svg
		class="mark-barcode"
		width={w + GAP}
		height="9"
		viewBox="0 0 {w + GAP} 9"
		preserveAspectRatio="none"
		aria-hidden="true"
	>
		{#each rollBarcodes.get(idx) || [] as r, i (i)}
			<rect x={r.offsetAlong} y={r.offsetAcross} width={r.widthAlong} height={r.heightAcross} fill="currentColor" />
		{/each}
	</svg>
{/snippet}

<!-- frame-marker arrow next to a half-frame "A" number; the shape varies per
     *frame* (chevrons, tailed arrows, …, occasionally none). `down` rotates it to
     point along a vertical roll. -->
{#snippet advArrow()}
	<svg
		width="14"
		height="9"
		viewBox="0 0 14 9"
		class="block"
		fill="none"
		stroke="currentColor"
		stroke-width="1.4"
		stroke-linecap="round"
		stroke-linejoin="round"
		aria-hidden="true"
	>
		<path d="M1 4.5 H11" /><path d="M7.5 1.5 L12 4.5 L7.5 7.5" />
	</svg>
{/snippet}

{#snippet edgeText(te: NonNullable<ReturnType<typeof topEdge>>)}
	<span class="mark-edge" style="left: {te.pos * 100}%">
		{#each te.segments as s, i (i)}{#if s.bold}<b>{s.t}</b>{:else}{s.t}{/if}{/each}
	</span>
{/snippet}

{#snippet filmStrip(row: Row, ri: number, trim: boolean = false)}
	{@const shift = sprocketShift(ri)}
	{@const sprocketStyle = trim
		? `background-position-x: ${shift}px; width: ${Math.round(rowFramesWidth(row))}px; margin-inline: auto;`
		: `background-position-x: ${shift}px;`}
	<div
		class="sheet-strip"
		class:sheet-strip-trim={trim}
		style="color: {brand.color}; {trim ? `transform: rotate(${trimRot}deg);` : ''}"
	>
		<!-- 1 · top markings: frame number + sporadic edge text -->
		<div class="mark-band flex" style="gap: {GAP}px; {trim ? 'justify-content: center;' : ''}">
			{#each row.items as item (item.photo.id)}
				{@const te = topEdge(brand, item.idx, item.photo)}
				<div class="mark-cell" style={basisFor(item, row)}>
					<span class="mark-num">{frameLabel(item.idx)}</span>
					{#if te && frameW(item, row) > 80}{@render edgeText(te)}{/if}
				</div>
			{/each}
		</div>

		<!-- 2 · top sprockets -->
		<div class="film-edge sprocket-band" style={sprocketStyle}></div>

		<!-- 3 · the film images -->
		<div class="flex" style="height: {row.h}px; gap: {GAP}px; {trim ? 'justify-content: center;' : ''}">
			{#each row.items as item (item.photo.id)}
				{@const photo = item.photo}
				{@const ring = ringMap.get(photo.id) ?? null}
				<a href="/photo/{photo.id}{qy}" class="sheet-frame group" style={basisFor(item, row)} aria-label={photo.title} onclick={markMorph}>
					<div use:develop={Math.min((item.idx % 12) * 50, 360)} class="h-full w-full">
						<PhotoTile photo={photo} displayWidth={frameW(item, row)} eager={ri < 2} showTitle />
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
		<div class="mark-band mark-band-b flex" style="gap: {GAP}px; {trim ? 'justify-content: center;' : ''}">
			{#each row.items as item (item.photo.id)}
				<div class="mark-cell mark-cell-b" style={basisFor(item, row)}>
					{@render barcode(Math.max(20, Math.round(frameW(item, row))), item.idx)}
					<span class="mark-num mark-num-b">{frameLabel(item.idx)}</span>
					<span class="mark-adv">
						<span class="mark-adv-label">{frameLabel(item.idx)}A</span>
						{@render advArrow()}
					</span>
				</div>
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
			{#each sheetRows as row, ri (ri)}
				{@render filmStrip(row, ri)}
			{/each}
			<!-- the trimmed tail of the roll stays on the sheet (the off-black base and
			     the ruler carry on past it) but is laid down a touch askew, by hand -->
			{#if trimRow}
				{@render filmStrip(trimRow, sheetRows.length, true)}
			{/if}
		</div>
	</div>
</div>
