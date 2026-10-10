<script lang="ts">
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import { fade, fly } from 'svelte/transition';
	import type { Snippet } from 'svelte';
	import type { FilterOptions, GalleryFilters } from '$lib/types';
	import { focalRangeText } from '$lib/filters';
	import type { IconName } from './Icon.svelte';
	import Icon from './Icon.svelte';
	import FilterSelect from './FilterSelect.svelte';
	import FilmFilter from './FilmFilter.svelte';
	import FocalRangeFilter from './FocalRangeFilter.svelte';

	interface Props {
		filters: GalleryFilters;
		options: FilterOptions;
		count: number;
		/** extra controls rendered at the end of the desktop bar (view switch) */
		trailing?: Snippet;
		/** 'center': the classic centred chrome row · 'rail': a right-anchored
		 *  control panel that sits in the masthead grid beside the big title */
		align?: 'center' | 'rail';
	}
	let { filters, options, count, trailing, align = 'center' }: Props = $props();

	// the range control only earns its place when the library spans focal lengths
	const focalRange = $derived(
		options.focalRange && options.focalRange.max > options.focalRange.min ? options.focalRange : null
	);

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

	// Every active filter renders as one removable chip — the triggers stay
	// fixed-size labels, so the value lives here and only here.
	interface Chip {
		key: string;
		icon: IconName;
		label: string;
		clear: Record<string, string>;
	}
	const chips = $derived.by((): Chip[] => {
		const f = filters;
		const out: Chip[] = [];
		const add = (key: string, icon: IconName, label: string | undefined, clear?: Record<string, string>) => {
			if (label) out.push({ key, icon, label, clear: clear ?? { [key]: '' } });
		};
		if (f.film) add('film', 'film', f.film, { film: '', analog: '' });
		else if (f.analog) add('analog', 'film', 'Film only', { analog: '' });
		add('album', 'album', f.album);
		add('tag', 'tag', f.tag);
		add('camera', 'camera', f.camera);
		add('lens', 'lens', f.lens);
		add('location', 'location', f.location);
		if (f.focalMin || f.focalMax)
			add('focalRange', 'focal', focalRangeText(f.focalMin, f.focalMax), { focalMin: '', focalMax: '' });
		add('aperture', 'aperture', f.aperture);
		add('shutter', 'shutter', f.shutter);
		add('focal', 'focal', f.focal);
		add('iso', 'iso', f.iso ? `ISO ${f.iso}` : undefined);
		add('q', 'search', f.q ? `“${f.q}”` : undefined);
		return out;
	});

	const anyActive = $derived(Object.values(filters).some(Boolean));
	const favActive = $derived(!!filters.favorite);
	const activeCount = $derived(Object.values(filters).filter(Boolean).length);

	// mobile: the whole bar collapses behind a floating button + bottom sheet
	let mobileOpen = $state(false);
	let mobileTrigger = $state<HTMLButtonElement>();
	let mobilePanel = $state<HTMLElement>();
	let mobileClose = $state<HTMLButtonElement>();

	function openMobile() {
		mobileOpen = true;
		setTimeout(() => mobileClose?.focus(), 0);
	}

	function closeMobile() {
		if (!mobileOpen) return;
		mobileOpen = false;
		setTimeout(() => mobileTrigger?.focus(), 0);
	}

	function onWindowKeydown(event: KeyboardEvent) {
		if (!mobileOpen) return;
		if (event.key === 'Escape') {
			event.preventDefault();
			closeMobile();
			return;
		}
		if (event.key !== 'Tab' || !mobilePanel) return;
		const focusable = [...mobilePanel.querySelectorAll<HTMLElement>(
			'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])'
		)].filter((element) => element.offsetParent !== null);
		if (!focusable.length) return;
		const first = focusable[0];
		const last = focusable[focusable.length - 1];
		if (event.shiftKey && document.activeElement === first) {
			event.preventDefault();
			last.focus();
		} else if (!event.shiftKey && document.activeElement === last) {
			event.preventDefault();
			first.focus();
		}
	}

	function setParam(key: string, value: string) {
		setParams({ [key]: value });
	}
	function setParams(updates: Record<string, string>) {
		const params = new URLSearchParams(page.url.searchParams);
		for (const [key, value] of Object.entries(updates)) {
			if (value) params.set(key, value);
			else params.delete(key);
		}
		goto(params.size ? `/?${params}` : '/', { keepFocus: true });
	}
</script>

<svelte:window onkeydown={onWindowKeydown} />

<!-- desktop: label triggers, active-value chips, count, view switch. Two shapes:
     'center' is the classic centred row; 'rail' hugs the right so it can ride
     the masthead grid beside the oversized title. -->
<nav
	class="relative z-30 hidden flex-wrap items-center gap-x-3 gap-y-2.5 sm:flex {align === 'rail'
		? 'max-w-[34rem] justify-end'
		: 'mx-auto mb-5 max-w-[1800px] justify-center gap-x-5 gap-y-3 px-6'}"
	aria-label="Filter photos"
>
	<!-- favorites: a first-class toggle, distinct from the Tag dropdown -->
	<button
		type="button"
		onclick={() => setParam('favorite', favActive ? '' : '1')}
		class="filter-trigger"
		data-active={favActive}
		data-tone="amber"
		aria-pressed={favActive}
	>
		<Icon name="star" size={13} class={favActive ? 'text-amber-500' : ''} />
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

	{#if focalRange}
		<FocalRangeFilter
			min={focalRange.min}
			max={focalRange.max}
			valueMin={filters.focalMin ?? ''}
			valueMax={filters.focalMax ?? ''}
			onchange={(focalMin, focalMax) => setParams({ focalMin, focalMax })}
		/>
	{/if}

	<!-- status slot: always rendered so activating a filter never inserts new
	     siblings (which would reflow the row) — the count just changes and
	     "Clear" fades in place -->
	<span class="type-label ml-1 whitespace-nowrap text-ink-soft {align === 'rail' ? '' : 'w-24 border-b border-transparent pb-1 text-center'}">
		{count}
		{count === 1 ? 'photo' : 'photos'}
	</span>
	<a
		href="/"
		aria-hidden={!anyActive}
		tabindex={anyActive ? undefined : -1}
		class="type-label inline-flex items-center gap-1 text-accent underline decoration-hairline underline-offset-4 transition-opacity duration-200 hover:decoration-accent {align === 'rail'
			? ''
			: 'border-b border-transparent pb-1'} {anyActive ? 'opacity-100' : 'pointer-events-none opacity-0'}"
	>
		<Icon name="x" size={11} />Clear
	</a>

	{#if trailing}<div class="ml-1">{@render trailing()}</div>{/if}

	<!-- active values, each removable in place; a full-width row keeps chip
	     churn from nudging the trigger row above -->
	{#if chips.length}
		<div
			class="flex w-full flex-wrap items-center gap-2 {align === 'rail' ? 'justify-end' : 'justify-center'}"
			transition:fly={{ y: 4, duration: 180 }}
		>
			{#each chips as c (c.key)}
				<button
					type="button"
					class="type-label inline-flex cursor-pointer items-center gap-1.5 rounded-pop border border-hairline bg-paper px-2 py-1 text-accent transition-colors hover:border-accent"
					onclick={() => setParams(c.clear)}
					title="Remove filter"
				>
					<Icon name={c.icon} size={12} />
					{c.label}
					<Icon name="x" size={10} class="text-ink-soft" />
				</button>
			{/each}
		</div>
	{/if}
</nav>

<!-- mobile: a floating action button opens a bottom sheet of tap-to-select filters.
     Pills (rather than dropdowns) keep everything visible and avoid clipping inside
     the scrollable sheet. -->
<button
	bind:this={mobileTrigger}
	type="button"
	onclick={openMobile}
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
			onclick={closeMobile}
			aria-label="Close filters"
		></button>
		<div
			bind:this={mobilePanel}
			class="absolute inset-x-0 bottom-0 max-h-[84vh] overflow-y-auto rounded-t-2xl border-t border-hairline bg-paper px-5 pt-3 pb-[max(1.5rem,env(safe-area-inset-bottom))]"
			transition:fly={{ y: 360, duration: 260 }}
		>
			<div class="sticky top-0 -mx-5 mb-2 flex items-center justify-between bg-paper px-5 py-2">
				<span class="type-label text-ink-soft">Filter photos</span>
				<div class="flex items-center gap-4">
					{#if anyActive}
						<a href="/" class="type-label text-accent" onclick={closeMobile}>Clear</a>
					{/if}
					<button bind:this={mobileClose} type="button" onclick={closeMobile} aria-label="Close"><Icon name="x" size={20} /></button>
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

				{#if focalRange}
					{@const fMin = filters.focalMin ?? ''}
					{@const fMax = filters.focalMax ?? ''}
					<div>
						<div class="type-label mb-2 flex items-center gap-2 text-ink-soft">
							<Icon name="focal" size={14} />Focal length
						</div>
						<div class="flex flex-wrap gap-2">
							<button
								type="button"
								class="filter-pill {!fMin && !fMax ? 'filter-pill-on' : ''}"
								onclick={() => setParams({ focalMin: '', focalMax: '' })}
							>
								All
							</button>
							{#each [['Wide', '', '35'], ['Standard', '35', '85'], ['Tele', '85', '']] as const as [name, mn, mx] (name)}
								<button
									type="button"
									class="filter-pill {fMin === mn && fMax === mx ? 'filter-pill-on' : ''}"
									onclick={() => setParams(fMin === mn && fMax === mx ? { focalMin: '', focalMax: '' } : { focalMin: mn, focalMax: mx })}
								>
									{name}
								</button>
							{/each}
						</div>
					</div>
				{/if}
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
