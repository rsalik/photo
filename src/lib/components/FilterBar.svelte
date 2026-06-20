<script lang="ts">
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import { fade, fly } from 'svelte/transition';
	import type { GalleryFilters } from '$lib/types';
	import type { IconName } from './Icon.svelte';
	import Icon from './Icon.svelte';
	import FilterSelect from './FilterSelect.svelte';
	import FilmFilter from './FilmFilter.svelte';

	interface Props {
		filters: GalleryFilters;
		options: {
			albums: string[];
			tags: string[];
			cameras: string[];
			lenses: string[];
			locations: string[];
			filmStocks: string[];
			hasAnalog: boolean;
		};
		count: number;
	}
	let { filters, options, count }: Props = $props();

	type SelectKey = 'album' | 'tag' | 'camera' | 'lens' | 'location';
	const selects = $derived(
		(
			[
				['album', 'Album', 'album', options.albums],
				['tag', 'Tag', 'tag', options.tags],
				['camera', 'Camera', 'camera', options.cameras],
				['lens', 'Lens', 'lens', options.lenses],
				['location', 'Location', 'location', options.locations]
			] as [SelectKey, string, IconName, string[]][]
		).filter(([, , , opts]) => opts.length > 0)
	);

	// film: an "analog only" toggle on top, with a specific-stock dropdown below.
	// A specific stock implies analog; turning the toggle off clears the stock too.
	const analogOn = $derived(!!(filters.analog || filters.film));
	function toggleAnalog() {
		if (analogOn) setParams({ analog: '', film: '' });
		else setParams({ analog: '1', film: '' });
	}
	function selectStock(v: string) {
		// picking a stock turns analog on; clearing it keeps "analog only" on
		if (v) setParams({ film: v, analog: '' });
		else setParams({ film: '', analog: '1' });
	}

	// EXIF / search filters arrive via links on photo pages; shown as removable chips
	const chips = $derived(
		(
			[
				['aperture', 'aperture', filters.aperture],
				['shutter', 'shutter', filters.shutter],
				['focal', 'focal', filters.focal],
				['iso', 'iso', filters.iso ? `ISO ${filters.iso}` : undefined],
				['q', 'search', filters.q ? `“${filters.q}”` : undefined]
			] as [string, IconName, string | undefined][]
		).filter((c) => c[2])
	);

	const anyActive = $derived(Object.values(filters).some(Boolean));
	const favActive = $derived(!!filters.favorite);
	const activeCount = $derived(Object.values(filters).filter(Boolean).length);

	// mobile: the whole bar collapses behind a floating button + bottom sheet
	let mobileOpen = $state(false);

	function setParam(key: string, value: string) {
		setParams({ [key]: value });
	}
	function setParams(updates: Record<string, string>) {
		const params = new URLSearchParams(page.url.searchParams);
		for (const [key, value] of Object.entries(updates)) {
			if (value) params.set(key, value);
			else params.delete(key);
		}
		goto(`/?${params}`, { noScroll: true, keepFocus: true });
	}
</script>

<!-- desktop: inline filter bar -->
<nav
	class="relative z-30 mx-auto mb-7 hidden max-w-[1800px] flex-wrap items-center justify-center gap-x-8 gap-y-4 px-6 sm:flex"
	aria-label="Filter photos"
>
	<!-- favorites: a first-class toggle, distinct from the Tag dropdown -->
	<button
		type="button"
		onclick={() => setParam('favorite', favActive ? '' : '1')}
		class="flex cursor-pointer items-center gap-2 border-b pb-1.5 transition-colors {favActive
			? 'border-amber-400 text-amber-600'
			: 'border-transparent text-ink-soft hover:border-hairline hover:text-amber-600'}"
		aria-pressed={favActive}
	>
		<Icon name="star" size={14} class={favActive ? 'text-amber-500' : ''} />
		<span class="type-label">Favorites</span>
	</button>

	{#if options.hasAnalog}
		<!-- one combined Analog filter: analog-only toggle + stock list in a dropdown -->
		<FilmFilter
			{analogOn}
			film={filters.film ?? ''}
			stocks={options.filmStocks}
			onToggle={toggleAnalog}
			onSelectStock={selectStock}
		/>
	{/if}

	{#each selects as [key, label, icon, opts] (key)}
		<FilterSelect
			{label}
			{icon}
			value={filters[key] ?? ''}
			options={opts}
			filterKey={key}
			onselect={(value) => setParam(key, value)}
		/>
	{/each}

	{#each chips as [key, icon, label] (key)}
		<button
			type="button"
			transition:fly={{ y: 4, duration: 180 }}
			class="type-mono inline-flex cursor-pointer items-center gap-2 border border-hairline px-3 py-1.5 text-accent transition-colors hover:border-accent"
			onclick={() => setParam(key, '')}
			title="Remove filter"
		>
			<Icon name={icon} size={13} />
			{label}
			<Icon name="x" size={11} class="text-ink-soft" />
		</button>
	{/each}

	{#if anyActive}
		<span
			class="type-label border-b border-transparent pb-1.5 text-ink-soft"
			transition:fly={{ y: 4, duration: 180 }}
		>
			{count}
			{count === 1 ? 'photo' : 'photos'}
		</span>
		<a
			href="/"
			transition:fly={{ y: 4, duration: 180 }}
			class="type-label inline-flex items-center gap-1.5 border-b border-transparent pb-1.5 text-accent underline decoration-hairline underline-offset-4 hover:decoration-accent"
		>
			<Icon name="x" size={12} />Clear all
		</a>
	{/if}
</nav>

<!-- mobile: a floating action button opens a bottom sheet of tap-to-select filters.
     Pills (rather than dropdowns) keep everything visible and avoid clipping inside
     the scrollable sheet. -->
<button
	type="button"
	onclick={() => (mobileOpen = true)}
	class="fixed right-4 bottom-4 z-40 flex h-14 w-14 cursor-pointer items-center justify-center rounded-full bg-ink text-paper shadow-pop-lg transition-transform active:scale-95 sm:hidden"
	aria-label="Filter photos"
>
	<Icon name="sliders" size={20} />
	{#if activeCount}
		<span class="absolute -top-1 -right-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-accent px-1 text-[0.65rem] font-semibold text-paper ring-2 ring-paper">
			{activeCount}
		</span>
	{/if}
</button>

{#if mobileOpen}
	<div class="fixed inset-0 z-50 sm:hidden" role="dialog" aria-modal="true" aria-label="Filters">
		<button
			class="absolute inset-0 bg-ink/40"
			transition:fade={{ duration: 180 }}
			onclick={() => (mobileOpen = false)}
			aria-label="Close filters"
		></button>
		<div
			class="absolute inset-x-0 bottom-0 max-h-[84vh] overflow-y-auto rounded-t-2xl border-t border-hairline bg-paper px-5 pt-3 pb-[max(1.5rem,env(safe-area-inset-bottom))]"
			transition:fly={{ y: 360, duration: 260 }}
		>
			<div class="sticky top-0 -mx-5 mb-2 flex items-center justify-between bg-paper px-5 py-2">
				<span class="type-label text-ink-soft">Filter photos</span>
				<div class="flex items-center gap-4">
					{#if anyActive}
						<a href="/" class="type-label text-accent" onclick={() => (mobileOpen = false)}>Clear</a>
					{/if}
					<button type="button" onclick={() => (mobileOpen = false)} aria-label="Close"><Icon name="x" size={20} /></button>
				</div>
			</div>

			<div class="flex flex-col gap-5 pb-2">
				<!-- favorites -->
				<button
					type="button"
					onclick={() => setParam('favorite', favActive ? '' : '1')}
					class="filter-pill self-start {favActive ? 'filter-pill-amber' : ''}"
					aria-pressed={favActive}
				>
					<Icon name="star" size={14} />Favorites
				</button>

				{#if options.hasAnalog}
					{@render pillGroup('Film', 'film', 'film', options.filmStocks, filters.film ?? '', selectStock, {
						allLabel: analogOn ? 'Any film' : 'Off',
						allActive: analogOn && !filters.film,
						onAll: toggleAnalog
					})}
				{/if}

				{#each selects as [key, label, icon, opts] (key)}
					{@render pillGroup(label, icon, key, opts, filters[key] ?? '', (v) => setParam(key, v))}
				{/each}
			</div>
		</div>
	</div>
{/if}

{#snippet pillGroup(
	label: string,
	icon: IconName,
	key: string,
	opts: string[],
	active: string,
	onPick: (v: string) => void,
	special?: { allLabel: string; allActive: boolean; onAll: () => void }
)}
	<div>
		<div class="type-label mb-2 flex items-center gap-2 text-ink-soft">
			<Icon name={icon} size={14} />{label}
		</div>
		<div class="flex flex-wrap gap-2">
			{#if special}
				<button type="button" class="filter-pill {special.allActive ? 'filter-pill-on' : ''}" onclick={special.onAll}>
					{special.allLabel}
				</button>
			{/if}
			{#each opts as o (o)}
				<button
					type="button"
					class="filter-pill {active === o ? 'filter-pill-on' : ''}"
					onclick={() => onPick(active === o ? '' : o)}
				>
					{o}
				</button>
			{/each}
		</div>
	</div>
{/snippet}
