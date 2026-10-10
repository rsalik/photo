<script lang="ts">
	import { onMount } from 'svelte';
	import { fade, fly } from 'svelte/transition';
	import { FAVORITE_TAG } from '$lib/types';
	import { focalRangeText, galleryPhotoQuery } from '$lib/filters';
	import type { PageData } from './$types';
	import SiteHeader from '$lib/components/SiteHeader.svelte';
	import FilterBar from '$lib/components/FilterBar.svelte';
	import ViewToggle from '$lib/components/ViewToggle.svelte';
	import ContactSheet from '$lib/components/ContactSheet.svelte';
	import MasonryGallery from '$lib/components/MasonryGallery.svelte';
	import ListView from '$lib/components/ListView.svelte';
	import ListViewMobile from '$lib/components/ListViewMobile.svelte';

	let { data }: { data: PageData } = $props();

	let vw = $state(0);
	let vh = $state(0);
	// The scrolling film strip needs a tall stage; landscape phones use rows.
	const listMobile = $derived(vw > 0 && vw < 640 && vh >= vw);

	let view = $state<import('$lib/components/ViewToggle.svelte').GalleryView>('film');
	let ready = $state(false);
	onMount(() => {
		try {
			const v = localStorage.getItem('gallery-view');
			if (v === 'grid' || v === 'film' || v === 'list') view = v;
		} catch {
			// Browsing still works when storage is disabled.
		}
		// Contact sheet is the default everywhere (on phones it renders the
		// scroll-choreographed film strip; on desktop the classic contact sheet)
		ready = true;
	});
	$effect(() => {
		const v = view;
		if (ready) {
			try {
				localStorage.setItem('gallery-view', v);
			} catch {
				// The preference lasts for this visit when it cannot be persisted.
			}
		}
	});

	const filterSignature = $derived(JSON.stringify(data.filters));
	const photoQuery = $derived(galleryPhotoQuery(data.filters));

	// Convert active filters into an ordered array for the contact sheet leader frame.
	// The primary filter is used as the title, while remaining filters append as additional context.
	const activeFilters = $derived.by((): { key: string; label: string; text: string }[] => {
		const f = data.filters;
		const out: { key: string; label: string; text: string }[] = [];
		if (f.album) out.push({ key: 'album', label: 'Album', text: f.album });
		if (f.favorite || f.tag?.toLowerCase() === FAVORITE_TAG)
			out.push({ key: 'favorite', label: 'Marked', text: 'Favorites' });
		if (f.film) out.push({ key: 'film', label: 'Film stock', text: f.film });
		else if (f.analog) out.push({ key: 'analog', label: 'Shot on film', text: 'Film' });
		if (f.tag && f.tag.toLowerCase() !== FAVORITE_TAG)
			out.push({ key: 'tag', label: 'Tag', text: f.tag });
		if (f.location) out.push({ key: 'location', label: 'Location', text: f.location });
		if (f.camera) out.push({ key: 'camera', label: 'Camera', text: f.camera });
		if (f.lens) out.push({ key: 'lens', label: 'Lens', text: f.lens });
		if (f.aperture) out.push({ key: 'aperture', label: 'Aperture', text: f.aperture });
		if (f.shutter) out.push({ key: 'shutter', label: 'Shutter', text: f.shutter });
		if (f.focal) out.push({ key: 'focal', label: 'Focal length', text: f.focal });
		if (f.focalMin || f.focalMax)
			out.push({
				key: 'focalRange',
				label: 'Focal length',
				text: focalRangeText(f.focalMin, f.focalMax)
			});
		if (f.iso) out.push({ key: 'iso', label: 'ISO', text: `ISO ${f.iso}` });
		if (f.q) out.push({ key: 'q', label: 'Search', text: `“${f.q}”` });
		return out;
	});
	const sheet = $derived(
		activeFilters[0]
			? { label: activeFilters[0].label, title: activeFilters[0].text }
			: { label: '', title: 'Gallery' }
	);

	const exposures = $derived(
		`${data.photos.length} ${data.photos.length === 1 ? 'exposure' : 'exposures'}`
	);
	// stable seed per view so a sheet always looks the same but albums/tags differ
	const viewKey = $derived(`${sheet.label}++${sheet.title}`);
</script>

<svelte:window bind:innerWidth={vw} bind:innerHeight={vh} />

<svelte:head>
	<title>{data.settings.siteTitle} — {data.settings.siteSubtitle}</title>
	<meta name="description" content="{data.settings.siteTitle} — a photography portfolio" />
	<meta property="og:type" content="website" />
	<meta
		property="og:title"
		content={sheet.title === 'Gallery'
			? data.settings.siteTitle
			: `${sheet.title} — ${data.settings.siteTitle}`}
	/>
	<meta property="og:description" content={exposures} />
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

<!-- Hero: wordmark + masthead share one zone. Its stacking context sits above
     the gallery, so the rail's filter dropdowns and hover-preview cards paint
     over the contact sheet. The vertical grid comes from the root background
     (full page + overscroll); the opaque controls hold it behind them. -->
<div class="hero">
	<SiteHeader siteTitle={data.settings.siteTitle} isAdmin={data.isAdmin} />

	<!-- Masthead: the active view's title is the page's one piece of oversized
	     type, set on the left; the filter control rail rides the right. On phones
	     the rail collapses to a floating button + sheet (both rendered by
	     FilterBar itself, so it stays in the tree even when its desktop row is
	     hidden). -->
	<section
		class="mx-auto flex max-w-[2400px] flex-col gap-4 px-4 pt-1 pb-5 sm:flex-row sm:items-end sm:gap-8 sm:px-6 sm:pt-2 sm:pb-7"
	>
		<div class="min-w-0 text-center sm:flex-1 sm:text-left">
			{#key sheet.title}
				<div in:fly={{ y: 8, duration: 400 }}>
					{#if sheet.label}<p class="type-label mb-1.5 text-ink-soft">
							{sheet.label}
						</p>{/if}
					<h2
						class="type-display text-[clamp(2.25rem,5.5vw,4.75rem)] leading-[0.98] tracking-[-0.01em] break-words"
					>
						{sheet.title}
					</h2>
				</div>
			{/key}
		</div>

		<FilterBar
			align="rail"
			filters={data.filters}
			options={data.options}
			count={data.photos.length}
		>
			{#snippet trailing()}
				{#if data.photos.length > 0}<ViewToggle bind:view />{/if}
			{/snippet}
		</FilterBar>
	</section>
</div>

{#if data.photos.length > 0}
	<div class="mb-5 flex justify-center sm:hidden">
		<ViewToggle bind:view />
	</div>
{/if}

<main class="mx-auto w-full px-2 sm:px-3">
	{#key filterSignature}
		<div in:fade={{ duration: 300, delay: 60 }}>
			{#if data.photos.length === 0}
				<div class="flex flex-col items-center gap-4 py-32 text-center">
					<p class="type-display text-2xl text-ink-soft">No photographs yet</p>
					{#if data.isAdmin}
						<a
							href="/admin/upload"
							class="type-label text-accent underline underline-offset-4"
							>Upload your first photos</a
						>
					{:else}
						<p class="type-label text-ink-soft">Check back soon</p>
					{/if}
				</div>
			{:else}
				{#key view}
					<div in:fade={{ duration: 260 }}>
						{#if view === 'film'}
							{#if listMobile}
								<ListViewMobile
									photos={data.photos}
									albumContext={data.filters.album ?? ''}
									{photoQuery}
								/>
							{:else}
								<ContactSheet
									photos={data.photos}
									rowHeight={data.settings.galleryRowHeight}
									{photoQuery}
									{viewKey}
								/>
							{/if}
						{:else if view === 'list'}
							<ListView
								photos={data.photos}
								albumContext={data.filters.album ?? ''}
								{photoQuery}
							/>
						{:else}
							<MasonryGallery
								photos={data.photos}
								rowHeight={data.settings.galleryRowHeight}
								{photoQuery}
							/>
						{/if}
					</div>
				{/key}
			{/if}
		</div>
	{/key}
</main>

<footer class="px-6 py-8 text-center">
	<p class="type-display text-xl text-ink-soft">
		© {new Date().getFullYear()}
		{data.settings.siteTitle} · All Rights Reserved.
	</p>
</footer>
