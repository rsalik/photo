<script lang="ts">
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import { fade, fly } from 'svelte/transition';
	import Icon, { type IconName } from './Icon.svelte';
	import PreviewPopover from './PreviewPopover.svelte';
	import { fetchFilterPreview, type FilterPreview } from '$lib/preview';
	import { palette } from '$lib/palette-state.svelte';

	interface SearchPhoto {
		id: string;
		title: string;
		location: string | null;
		width: number;
		height: number;
		blurData: string;
	}
	interface SearchContext {
		albums: string[];
		tags: string[];
		cameras: string[];
		locations: string[];
		favorite: boolean;
	}
	interface SearchResult {
		context: SearchContext | null;
		photos: SearchPhoto[];
		albums: string[];
		tags: string[];
		cameras: string[];
		locations: string[];
	}

	type Section = 'context' | 'photo' | 'album' | 'tag' | 'camera' | 'location';
	interface Row {
		section: Section;
		icon: IconName;
		label: string;
		sub?: string;
		href: string;
		thumb?: SearchPhoto;
		previewParams?: string;
	}

	const SECTIONS: Record<Section, string> = {
		context: 'From this photograph',
		photo: 'Photographs',
		album: 'Albums',
		tag: 'Tags',
		camera: 'Cameras',
		location: 'Locations'
	};

	let query = $state('');
	let results = $state<SearchResult | null>(null);
	let highlighted = $state(0);
	let input = $state<HTMLInputElement>();
	let panel = $state<HTMLElement>();
	let preview = $state<FilterPreview | null>(null);
	let previewPos = $state({ x: 0, y: 0 });
	let lastShift = 0;
	let searchTimer: ReturnType<typeof setTimeout> | undefined;
	let previewTimer: ReturnType<typeof setTimeout> | undefined;

	const rows = $derived.by((): Row[] => {
		if (!results) return [];

		const filterRow =
			(section: Section, icon: IconName, key: string, framed?: (n: string) => string) =>
			(name: string): Row => ({
				section,
				icon,
				label: framed ? framed(name) : name,
				href: `/?${key}=${encodeURIComponent(name)}`,
				previewParams: `${key}=${encodeURIComponent(name)}`
			});

		// CONTEXT: the current photo's own facets, framed and surfaced first
		const ctx = results.context;
		const contextRows: Row[] = ctx
			? [
					...(ctx.favorite
						? [
								{
									section: 'context' as const,
									icon: 'star' as IconName,
									label: 'More favorites',
									href: '/?favorite=1',
									previewParams: 'favorite=1'
								}
							]
						: []),
					...ctx.albums.map(filterRow('context', 'album', 'album', (n) => `More from ${n}`)),
					...ctx.tags.map(filterRow('context', 'tag', 'tag', (n) => `More tagged ${n}`)),
					...ctx.cameras.map(filterRow('context', 'camera', 'camera', (n) => `More shot on ${n}`)),
					...ctx.locations.map(filterRow('context', 'location', 'location', (n) => `More from ${n}`))
				]
			: [];

		// GLOBAL: dedupe filter facets already shown in context so they don't repeat
		const seen = {
			album: new Set((ctx?.albums ?? []).map((s) => s.toLowerCase())),
			tag: new Set((ctx?.tags ?? []).map((s) => s.toLowerCase())),
			camera: new Set((ctx?.cameras ?? []).map((s) => s.toLowerCase())),
			location: new Set((ctx?.locations ?? []).map((s) => s.toLowerCase()))
		};
		const fresh = (key: keyof typeof seen, names: string[]) =>
			names.filter((n) => !seen[key].has(n.toLowerCase()));

		return [
			...contextRows,
			...results.photos.map(
				(p): Row => ({
					section: 'photo',
					icon: 'camera',
					label: p.title,
					sub: p.location ?? undefined,
					href: `/photo/${p.id}`,
					thumb: p
				})
			),
			...fresh('album', results.albums).map(filterRow('album', 'album', 'album')),
			...fresh('tag', results.tags).map(filterRow('tag', 'tag', 'tag')),
			...fresh('camera', results.cameras).map(filterRow('camera', 'camera', 'camera')),
			...fresh('location', results.locations).map(filterRow('location', 'location', 'location'))
		];
	});

	async function search(q: string) {
		try {
			// on a photo page, empty-query suggestions relate to that photo
			const contextId = page.url.pathname.match(/^\/photo\/([^/]+)/)?.[1] ?? '';
			const res = await fetch(
				`/api/search?q=${encodeURIComponent(q)}&photo=${encodeURIComponent(contextId)}`
			);
			if (res.ok) {
				results = await res.json();
				highlighted = 0;
			}
		} catch {
			/* palette is best-effort */
		}
	}

	export function show() {
		palette.open = true;
		query = '';
		results = null;
		preview = null;
		search('');
		setTimeout(() => input?.focus(), 10);
	}

	function close() {
		palette.open = false;
		preview = null;
		clearTimeout(previewTimer);
	}

	function run(row: Row) {
		close();
		goto(row.href);
	}

	/* preview card beside the panel for the highlighted filter row */
	$effect(() => {
		const row = rows[highlighted];
		clearTimeout(previewTimer);
		preview = null;
		if (!palette.open || !row?.previewParams) return;
		const params = row.previewParams;
		const index = highlighted;
		previewTimer = setTimeout(async () => {
			try {
				const data = await fetchFilterPreview(params);
				const el = panel?.querySelector(`[data-row="${index}"]`);
				const panelRect = panel?.getBoundingClientRect();
				previewPos = {
					// keep the card inside the viewport on narrow windows
					x: Math.min(panelRect ? panelRect.right : 600, window.innerWidth - 270),
					y: el ? el.getBoundingClientRect().top - 8 : 200
				};
				if (rows[highlighted] === row) preview = data;
			} catch {
				/* decorative */
			}
		}, 180);
	});

	function onWindowKeydown(e: KeyboardEvent) {
		const target = e.target as HTMLElement | null;
		const typing =
			!!target &&
			(target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable) &&
			target !== input;

		// double-Shift opens (quick taps — holding Shift elsewhere is untouched)
		if (e.key === 'Shift' && !e.metaKey && !e.ctrlKey && !e.altKey && !typing) {
			const now = Date.now();
			if (now - lastShift < 350 && !palette.open) {
				show();
				lastShift = 0;
				return;
			}
			lastShift = now;
		} else if (e.key !== 'Shift') {
			lastShift = 0;
		}

		if ((e.metaKey || e.ctrlKey) && e.key === 'k' && !typing) {
			e.preventDefault();
			if (palette.open) close();
			else show();
		}
		if (palette.open && e.key === 'Escape') {
			e.preventDefault();
			close();
		}
	}

	function onInputKeydown(e: KeyboardEvent) {
		if (e.key === 'ArrowDown') {
			e.preventDefault();
			highlighted = Math.min(highlighted + 1, rows.length - 1);
		} else if (e.key === 'ArrowUp') {
			e.preventDefault();
			highlighted = Math.max(highlighted - 1, 0);
		} else if (e.key === 'Enter') {
			e.preventDefault();
			if (rows[highlighted]) run(rows[highlighted]);
		}
	}

	function onQueryInput() {
		highlighted = 0;
		clearTimeout(searchTimer);
		searchTimer = setTimeout(() => search(query.trim()), 180);
	}
</script>

<svelte:window onkeydown={onWindowKeydown} />

{#if palette.open}
	<div
		class="fixed inset-0 z-50 bg-ink/25"
		transition:fade={{ duration: 120 }}
		onpointerdown={close}
		role="presentation"
	></div>
	<div
		bind:this={panel}
		class="pop fixed inset-x-0 top-[14vh] z-50 mx-auto w-[min(34rem,92vw)] overflow-hidden shadow-pop-lg"
		transition:fly={{ y: -10, duration: 160 }}
		role="dialog"
		aria-label="Search"
	>
		<div class="flex items-center gap-2.5 border-b border-hairline px-4 py-3">
			<Icon name="search" size={15} class="text-ink-soft" />
			<input
				bind:this={input}
				bind:value={query}
				oninput={onQueryInput}
				onkeydown={onInputKeydown}
				placeholder="Search photographs, albums, tags…"
				class="w-full bg-transparent text-[0.9375rem] outline-none"
				autocomplete="off"
			/>
		</div>

		<div class="max-h-[46vh] overflow-y-auto py-1.5">
			{#each rows as row, i (row.href)}
				{#if i === 0 || rows[i - 1].section !== row.section}
					<p class="type-label px-4 pt-2.5 pb-1 text-[0.625rem] {row.section === 'context'
						? 'text-accent'
						: 'text-ink-soft'}">{SECTIONS[row.section]}</p>
				{/if}
				<button
					type="button"
					data-row={i}
					class="flex w-full cursor-pointer items-center gap-3 px-4 py-2 text-left text-sm transition-colors {i ===
					highlighted
						? 'bg-hairline/50'
						: 'hover:bg-hairline/30'}"
					onclick={() => run(row)}
					onmouseenter={() => (highlighted = i)}
				>
					{#if row.thumb}
						<span
							class="h-9 w-9 shrink-0 overflow-hidden rounded-pop bg-cover bg-center"
							style="background-image: url('{row.thumb.blurData}')"
						>
							<img src="/img/{row.thumb.id}/sm" alt="" class="h-full w-full object-cover" loading="lazy" />
						</span>
					{:else}
						<Icon name={row.icon} size={14} class="text-ink-soft" />
					{/if}
					<span class="truncate">{row.label}</span>
					{#if row.sub}
						<span class="type-label ml-auto shrink-0 text-[0.625rem] text-ink-soft">{row.sub}</span>
					{/if}
				</button>
			{:else}
				<p class="px-4 py-3 text-sm text-ink-soft">
					{results ? 'Nothing matches' : 'Searching…'}
				</p>
			{/each}
		</div>

		<p class="type-label flex flex-wrap items-center gap-x-2 gap-y-1.5 border-t border-hairline px-4 py-2.5 text-[0.625rem] text-ink-soft">
			<span class="flex items-center gap-1"><kbd class="key key-sm">↑↓</kbd> navigate</span>
			<span class="opacity-40">·</span>
			<span class="flex items-center gap-1"><kbd class="key key-sm">↵</kbd> open</span>
			<span class="opacity-40">·</span>
			<span class="flex items-center gap-1"><kbd class="key key-sm">esc</kbd> close</span>
			<span class="opacity-40">·</span>
			<span class="flex items-center gap-1"><kbd class="key key-sm">shift</kbd> <kbd class="key key-sm">shift</kbd> or <kbd class="key key-sm">⌘K</kbd></span>
		</p>
	</div>

	<PreviewPopover
		{preview}
		x={previewPos.x}
		y={previewPos.y}
		anchor="right"
		label={rows[highlighted]?.label}
		icon={rows[highlighted]?.icon}
		cacheKey={rows[highlighted]?.href}
	/>
{/if}
