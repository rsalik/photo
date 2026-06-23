<script lang="ts">
	import { onMount } from 'svelte';
	import { fade, fly } from 'svelte/transition';
	import { FAVORITE_TAG } from '$lib/types';
	import type { PageData } from './$types';
	import SiteHeader from '$lib/components/SiteHeader.svelte';
	import FilterBar from '$lib/components/FilterBar.svelte';
	import ContactSheet from '$lib/components/ContactSheet.svelte';
	import MasonryGallery from '$lib/components/MasonryGallery.svelte';
	import ListView from '$lib/components/ListView.svelte';
	import ListViewMobile from '$lib/components/ListViewMobile.svelte';
	import Icon from '$lib/components/Icon.svelte';

	let { data }: { data: PageData } = $props();

	let vw = $state(0);
	const listMobile = $derived(vw > 0 && vw < 640);

	type View = 'film' | 'grid' | 'list';
	let view = $state<View>('film');
	let ready = false;
	onMount(() => {
		const v = localStorage.getItem('gallery-view');
		if (v === 'grid' || v === 'film' || v === 'list') view = v;
		// the scroll-choreographed List view is the default on phones
		else if (window.matchMedia('(max-width: 639px)').matches) view = 'list';
		ready = true;
	});
	$effect(() => {
		const v = view;
		if (ready) localStorage.setItem('gallery-view', v);
	});

	const filterSignature = $derived(JSON.stringify(data.filters));

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
		if (f.tag && f.tag.toLowerCase() !== FAVORITE_TAG) out.push({ key: 'tag', label: 'Tag', text: f.tag });
		if (f.location) out.push({ key: 'location', label: 'Location', text: f.location });
		if (f.camera) out.push({ key: 'camera', label: 'Camera', text: f.camera });
		if (f.lens) out.push({ key: 'lens', label: 'Lens', text: f.lens });
		if (f.aperture) out.push({ key: 'aperture', label: 'Aperture', text: f.aperture });
		if (f.shutter) out.push({ key: 'shutter', label: 'Shutter', text: f.shutter });
		if (f.focal) out.push({ key: 'focal', label: 'Focal length', text: f.focal });
		if (f.iso) out.push({ key: 'iso', label: 'ISO', text: `ISO ${f.iso}` });
		if (f.q) out.push({ key: 'q', label: 'Search', text: `“${f.q}”` });
		return out;
	});
	const sheet = $derived(
		activeFilters[0]
			? { label: activeFilters[0].label, title: activeFilters[0].text }
			: { label: '', title: 'Gallery' }
	);
	const notes = $derived(activeFilters.slice(1).map((a) => a.text));

	const dateRange = $derived.by(() => {
		const years = data.photos
			.map((p) => new Date(p.takenAt ?? p.uploadedAt).getFullYear())
			.filter((y) => Number.isFinite(y) && y > 1900);
		if (!years.length) return '';
		const lo = Math.min(...years);
		const hi = Math.max(...years);
		return lo === hi ? `${lo}` : `${lo}–${hi}`;
	});

	const frameLine = $derived(
		`${data.photos.length} ${data.photos.length === 1 ? 'photo' : 'photos'}${dateRange ? ` · ${dateRange}` : ''}`
	);
	// stable seed per view so a sheet always looks the same but albums/tags differ
	const viewKey = $derived(`${sheet.label}++${sheet.title}`);
</script>

<svelte:window bind:innerWidth={vw} />

<svelte:head>
	<title>{data.settings.siteTitle} — {data.settings.siteSubtitle}</title>
	<meta name="description" content="{data.settings.siteTitle} — a photography portfolio" />
	<meta property="og:type" content="website" />
	<meta property="og:title" content={sheet.title === 'Gallery' ? data.settings.siteTitle : `${sheet.title} — ${data.settings.siteTitle}`} />
	<meta property="og:description" content={frameLine} />
	{#if data.ogImage}
		<meta property="og:image" content={data.ogImage} />
		<meta property="og:image:width" content="1200" />
		<meta property="og:image:height" content="630" />
		<meta name="twitter:card" content="summary_large_image" />
		<meta name="twitter:image" content={data.ogImage} />
	{/if}
</svelte:head>

<SiteHeader siteTitle={data.settings.siteTitle} isAdmin={data.isAdmin} />

<FilterBar filters={data.filters} options={data.options} count={data.photos.length} />

<!-- view toggle -->
{#if data.photos.length > 0}
	<div class="mb-7 flex justify-center">
		<div class="inline-flex items-center gap-0.5 rounded-pop border border-hairline p-0.5">
			{#each [['film', 'film', 'Contact sheet'], ['grid', 'grid', 'Grid'], ['list', 'list', 'List']] as const as [key, icon, label] (key)}
				<button
					type="button"
					onclick={() => (view = key)}
					aria-pressed={view === key}
					class="flex cursor-pointer items-center gap-2 rounded-[0.25rem] px-3 py-1.5 transition-colors {view ===
					key
						? 'bg-ink text-paper'
						: 'text-ink-soft hover:text-ink'}"
				>
					<Icon name={icon} size={15} />
					<span class="type-label">{label}</span>
				</button>
			{/each}
		</div>
	</div>
{/if}

<main class="mx-auto max-w-[1800px] px-2 pb-16 sm:px-3">
	{#key filterSignature}
		<div in:fade={{ duration: 300, delay: 60 }}>
			{#if data.photos.length === 0}
				<div class="flex flex-col items-center gap-4 py-32 text-center">
					<p class="type-display text-2xl text-ink-soft">No photographs yet</p>
					{#if data.isAdmin}
						<a href="/admin/upload" class="type-label text-accent underline underline-offset-4">Upload your first photos</a>
					{:else}
						<p class="type-label text-ink-soft">Check back soon</p>
					{/if}
				</div>
			{:else}
				{#key view}
					<div in:fade={{ duration: 260 }}>
						<!-- One masthead for every view: the active filter becomes the title,
						     with the frame line and any additional filters beneath it. -->
						<section class="px-2 pb-8 text-center" in:fly={{ y: 8, duration: 400 }}>
							{#if sheet.label}<p class="type-label mb-3 text-ink-soft">{sheet.label}</p>{/if}
							<h2 class="type-display mx-auto max-w-5xl text-[clamp(2.25rem,6vw,4.5rem)] leading-[1.05] break-words">
								{sheet.title}
							</h2>
							<div class="mx-auto mt-5 flex items-center justify-center gap-3">
								<span class="h-px w-12 bg-hairline"></span>
								<span class="type-label text-ink-soft">{frameLine}</span>
								<span class="h-px w-12 bg-hairline"></span>
							</div>
							{#if notes.length}
								<div class="mt-4 flex flex-wrap justify-center gap-2">
									{#each notes as note (note)}
										<span class="type-label inline-flex items-center rounded-pop border border-hairline px-2.5 py-1 text-ink-soft">
											{note}
										</span>
									{/each}
								</div>
							{/if}
						</section>

						{#if view === 'film'}
							<ContactSheet
								photos={data.photos}
								rowHeight={data.settings.galleryRowHeight}
								albumContext={data.filters.album ?? ''}
								{viewKey}
							/>
						{:else if view === 'list'}
							{#if listMobile}
								<ListViewMobile photos={data.photos} albumContext={data.filters.album ?? ''} />
							{:else}
								<ListView photos={data.photos} albumContext={data.filters.album ?? ''} />
							{/if}
						{:else}
							<MasonryGallery photos={data.photos} rowHeight={data.settings.galleryRowHeight} albumContext={data.filters.album ?? ''} />
						{/if}
					</div>
				{/key}
			{/if}
		</div>
	{/key}
</main>

<footer class="mt-10 border-t border-hairline px-6 py-10 text-center">
	<p class="type-label text-ink-soft">
		© {new Date().getFullYear()} {data.settings.siteTitle} · All photographs reserved
	</p>
</footer>
