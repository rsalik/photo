<script lang="ts">
	import { FAVORITE_TAG, type Photo } from '$lib/types';
	import { reveal } from '$lib/actions';
	import { markMorph } from '$lib/morph';
	import Icon from './Icon.svelte';
	import PhotoTile from './PhotoTile.svelte';

	interface Props {
		photos: Photo[];
		rowHeight?: number; // target row height on desktop
		gap?: number; // constant margin between photos, px
		albumContext?: string;
	}
	let { photos, rowHeight = 300, gap = 8, albumContext = '' }: Props = $props();
	const q = $derived(albumContext ? `?album=${encodeURIComponent(albumContext)}` : '');

	let containerWidth = $state(0);

	interface LaidOutItem {
		photo: Photo;
		width: number;
		height: number;
	}
	type Segment =
		| { kind: 'row'; items: LaidOutItem[] }
		| { kind: 'tall'; tall: LaidOutItem; rows: [LaidOutItem[], LaidOutItem[]]; tallRight: boolean };

	/**
	 * Justified masonry: photos keep their exact aspect ratios (never cropped),
	 * rows fill the container width exactly, and on wide screens portrait photos
	 * break the grid by spanning two stacked rows so verticals always read large.
	 */
	const segments = $derived.by((): Segment[] => {
		const W = containerWidth || 1280;
		const target = W < 480 ? Math.max(150, rowHeight * 0.6) : W < 1024 ? rowHeight * 0.78 : rowHeight;
		const seq = [...photos];

		const out: Segment[] = [];
		let row: Photo[] = [];
		let arSum = 0;
		let tallToggle = 0;

		const ar = (p: Photo) => p.width / p.height;
		const isPortrait = (p: Photo) => ar(p) <= 0.85;
		const isPano = (p: Photo) => ar(p) >= 2.2;
		const lay = (list: Photo[], h: number): LaidOutItem[] =>
			list.map((p) => ({ photo: p, width: ar(p) * h, height: h }));
		const rowCap = () => (row.some(isPortrait) ? target * 1.42 : target);

		const flush = (justify: boolean) => {
			if (!row.length) return;
			const inner = W - gap * (row.length - 1);
			const h = justify ? inner / arSum : Math.min(rowCap(), inner / arSum);
			out.push({ kind: 'row', items: lay(row, h) });
			row = [];
			arSum = 0;
		};

		/** Two-row group anchored by a portrait pulled forward up to 4 slots. */
		const tryTall = (start: number, tallIdx: number): number => {
			const tall = seq[tallIdx];
			const tar = ar(tall);
			const wrEst = W - gap - tar * (2 * target + gap);
			if (wrEst < W * 0.42) return start;
			const need = wrEst / target;
			const rows: [Photo[], Photo[]] = [[], []];
			const sums = [0, 0];
			let j = start === tallIdx ? start + 1 : start;
			for (const r of [0, 1]) {
				while (j < seq.length && sums[r] < need) {
					rows[r].push(seq[j]);
					sums[r] += ar(seq[j]);
					j++;
					if (j === tallIdx) j++;
				}
			}
			if (j < tallIdx || !rows[0].length || !rows[1].length || sums[1] < need * 0.5) return start;
			const g1 = gap * (rows[0].length - 1);
			const g2 = gap * (rows[1].length - 1);
			const wr =
				(W - gap - tar * gap + tar * (g1 / sums[0] + g2 / sums[1])) /
				(1 + tar * (1 / sums[0] + 1 / sums[1]));
			const h1 = (wr - g1) / sums[0];
			const h2 = (wr - g2) / sums[1];
			const tallH = h1 + h2 + gap;
			if (h1 <= 0 || h2 <= 0 || tallH < target * 1.35 || tallH > target * 3.4) return start;
			out.push({
				kind: 'tall',
				tall: { photo: tall, width: tar * tallH, height: tallH },
				rows: [lay(rows[0], h1), lay(rows[1], h2)],
				tallRight: tallToggle++ % 2 === 1
			});
			return Math.max(j, tallIdx + 1);
		};

		let i = 0;
		while (i < seq.length) {
			if (W >= 900 && row.length === 0 && seq.length - i >= 4) {
				const tallIdx = seq.slice(i, i + 4).findIndex(isPortrait);
				if (tallIdx >= 0) {
					const next = tryTall(i, i + tallIdx);
					if (next > i) {
						i = next;
						continue;
					}
				}
			}
			// keep a portrait out of a panorama's row (it would shrink the row)
			const clashes = (c: Photo) =>
				(isPortrait(c) && row.some(isPano)) || (isPano(c) && row.some(isPortrait));
			if (row.length && clashes(seq[i])) {
				let swapped = false;
				for (let k = i + 1; k < Math.min(i + 5, seq.length); k++) {
					if (!clashes(seq[k])) {
						[seq[i], seq[k]] = [seq[k], seq[i]];
						swapped = true;
						break;
					}
				}
				if (!swapped) flush(true);
			}
			row.push(seq[i]);
			arSum += ar(seq[i]);
			i++;
			const h = (W - gap * (row.length - 1)) / arSum;
			const cap = rowCap();
			if (h <= cap) {
				const hWithout = row.length > 1 ? (W - gap * (row.length - 2)) / (arSum - ar(seq[i - 1])) : Infinity;
				if (row.length > 1 && hWithout - cap < (cap - h) * 0.9) {
					const last = row.pop()!;
					arSum -= ar(last);
					flush(true);
					row.push(last);
					arSum = ar(last);
				} else flush(true);
			}
		}
		flush(false);
		return out;
	});

	const isFav = (p: Photo) => p.tags.some((t) => t.toLowerCase() === FAVORITE_TAG);
</script>

{#snippet tile(item: LaidOutItem, eager: boolean, delay: number)}
	<a
		href="/photo/{item.photo.id}{q}"
		use:reveal={delay}
		onclick={markMorph}
		class="group relative block focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-accent"
		style="width: {item.width}px; height: {item.height}px; flex: none"
		aria-label={item.photo.title}
	>
		<PhotoTile photo={item.photo} displayWidth={item.width} {eager} showTitle />
		{#if isFav(item.photo)}
			<span class="pointer-events-none absolute top-2 left-2 text-amber-300">
				<Icon name="star" size={15} />
			</span>
		{/if}
	</a>
{/snippet}

<div bind:clientWidth={containerWidth} class="gallery-spotlight">
	{#each segments as seg, si (si)}
		{@const eager = si < 2}
		{#if seg.kind === 'row'}
			<div class="flex" style="gap: {gap}px; margin-bottom: {gap}px">
				{#each seg.items as item, ii (item.photo.id)}
					{@render tile(item, eager, ii * 55)}
				{/each}
			</div>
		{:else}
			<div class="flex" style="gap: {gap}px; margin-bottom: {gap}px">
				{#if !seg.tallRight}{@render tile(seg.tall, eager, 0)}{/if}
				<div class="flex min-w-0 flex-col" style="gap: {gap}px">
					{#each seg.rows as subRow, ri (ri)}
						<div class="flex" style="gap: {gap}px">
							{#each subRow as item, ii (item.photo.id)}
								{@render tile(item, eager, 60 + ri * 40 + ii * 55)}
							{/each}
						</div>
					{/each}
				</div>
				{#if seg.tallRight}{@render tile(seg.tall, eager, 0)}{/if}
			</div>
		{/if}
	{/each}
</div>
