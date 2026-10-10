<script lang="ts">
	import { FAVORITE_TAG, type Photo } from '$lib/types';
	import { photoDate, photoDateTime } from '$lib/dates';
	import { markMorph } from '$lib/morph';
	import { photoIntent } from '$lib/predictive-loading';
	import { photoMetaChips } from '$lib/photo-meta';
	import { brandFor, DEFAULT_ROLL_KEY, dxBarsBlock, dxSquaresBlock, topEdge } from '$lib/contactSheet';
	import AdvanceArrow from './film/AdvanceArrow.svelte';
	import Icon from './Icon.svelte';
	import PhotoTile from './PhotoTile.svelte';

	interface Props {
		photos: Photo[];
		albumContext?: string;
		photoQuery?: string;
	}
	let { photos, albumContext = '', photoQuery = '?g=1' }: Props = $props();

	// one continuous roll, seeded per view so its edge ink/markings stay stable
	const brand = $derived(brandFor(albumContext || DEFAULT_ROLL_KEY));

	const isFav = (p: Photo) => p.tags.some((t) => t.toLowerCase() === FAVORITE_TAG);
</script>

<!-- vertical DX block: one short barcode (lines, or a true two-row DX/CAS code),
     transposed so it runs DOWN the edge — the contact-sheet generators in
     (along-edge a → y, depth b → x) space -->
{#snippet dxMark(idx: number)}
	{@const rects = brand.dxKind === 'squares' ? dxSquaresBlock(brand, idx, 84) : dxBarsBlock(brand, idx, 84)}
	<span class="list-dx">
		<svg width="9" height="84" viewBox="0 0 9 84" class="block" aria-hidden="true">
			{#each rects as r, i (i)}
				<rect x={r.offsetAcross} y={r.offsetAlong} width={r.heightAcross} height={r.widthAlong} fill="currentColor" />
			{/each}
		</svg>
	</span>
{/snippet}

<div class="mx-auto max-w-[2000px] px-2 sm:px-3">
	<div class="list-roll" style="--film-w: clamp(340px, 52vw, 900px); --mark-w: 26px; --rail-w: 9px">
		{#each photos as photo, i (photo.id)}
		{@const fav = isFav(photo)}
		{@const te = topEdge(brand, i, photo)}
		<a
			href="/photo/{photo.slug}{photoQuery}" use:photoIntent={photo}
			onclick={markMorph}
			class="list-film group"
			style="color: {brand.color}"
			aria-label={photo.title}
		>
			<div class="list-film-row">
				<!-- left marking column = the strip's BOTTOM edge (roll rotated top→right):
				     headline frame number + DX barcode + half-frame "NA" marker -->
				<div class="list-mark">
					<span class="list-num list-num-b">{i + 1}</span>
					{@render dxMark(i)}
					<span class="list-adv"><span class="list-adv-label">{i + 1}A</span><AdvanceArrow /></span>
				</div>

				<div class="list-photo" style="aspect-ratio: {photo.width} / {photo.height}">
					<PhotoTile {photo} eager={i < 2} showTitle />
					{#if fav}
						<span class="absolute top-2 left-2 text-amber-300">
							<Icon name="star" size={16} />
						</span>
					{/if}
				</div>

				<!-- right marking column = the strip's TOP edge: edge print + frame number -->
				<div class="list-mark">
					{#if te}
						<span class="list-edge"
							>{#each te.segments as s, si (si)}{#if s.bold}<b>{s.t}</b>{:else}{s.t}{/if}{/each}</span
						>
					{:else}<span></span>{/if}
					<span class="list-num">{i + 1}</span>
				</div>
			</div>
		</a>

		<!-- metadata on plain paper, pinned beside its frame; the inner div is the
		     sticky element so it releases at the next photo (the cell bounds it) -->
		<div class="list-meta-cell">
			<div class="list-meta min-w-0 sm:py-2">
				<div class="flex items-start justify-between gap-4">
					<a href="/photo/{photo.slug}{photoQuery}" use:photoIntent={photo} onclick={markMorph} class="min-w-0">
						<h2 class="type-display text-2xl leading-tight hover:text-accent sm:text-3xl">{photo.title}</h2>
					</a>
				</div>

			{#if photo.takenAt}
				<p class="type-label mt-2 w-fit text-ink-soft" data-tip={photoDateTime(photo.takenAt)}>
					{photoDate(photo.takenAt)}
				</p>
			{/if}
			{#if photo.description}
				<p class="mt-3 hidden max-w-prose text-sm leading-relaxed text-ink-soft lg:block">{photo.description}</p>
			{/if}

			<div class="mt-4 flex flex-wrap gap-x-6 gap-y-2">
				{#each photoMetaChips(photo) as m (m.key + m.href)}
					<a
						href={m.href}
						class="type-mono inline-flex items-center gap-1.5 whitespace-nowrap text-ink-soft transition-colors hover:text-accent"
					>
						<Icon name={m.icon} size={14} />{m.label}
					</a>
				{/each}
			</div>

			{#if photo.albums.length || photo.tags.length || fav}
				<div class="mt-4 hidden flex-wrap items-center gap-x-4 gap-y-2 border-t border-hairline pt-4 lg:flex">
					{#if fav}
						<a
							href="/?favorite=1"
							class="type-label inline-flex items-center gap-1.5 text-amber-700 transition-colors hover:text-amber-700"
						>
							<Icon name="star" size={14} />Favorite
						</a>
					{/if}
					{#each photo.albums as album (album)}
						<a
							href="/?album={encodeURIComponent(album)}"
							class="type-label inline-flex items-center gap-1.5 text-accent transition-colors hover:underline"
						>
							<Icon name="album" size={14} />{album}
						</a>
					{/each}
					{#each photo.tags as tag (tag)}
						{#if tag.toLowerCase() !== FAVORITE_TAG}
							<a
								href="/?tag={encodeURIComponent(tag)}"
								class="type-label inline-flex items-center gap-1.5 text-ink-soft transition-colors hover:text-accent"
							>
								<Icon name="tag" size={14} />{tag}
							</a>
						{/if}
					{/each}
				</div>
			{/if}
		</div>
		</div>
	{/each}

		<!-- continuous sprocket rails the full height of the film column (wide screens) -->
		<span class="list-rail list-rail-l film-edge-v" aria-hidden="true"></span>
		<span class="list-rail list-rail-r film-edge-v" aria-hidden="true"></span>
	</div>
</div>
