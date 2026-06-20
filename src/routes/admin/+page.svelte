<script lang="ts">
	import { invalidateAll } from '$app/navigation';
	import { page } from '$app/state';
	import { SvelteSet } from 'svelte/reactivity';
	import { fly, slide } from 'svelte/transition';
	import { FAVORITE_TAG, TITLE_COLOR_PRESETS, type Photo } from '$lib/types';
	import Icon from '$lib/components/Icon.svelte';
	import TagInput from '$lib/components/TagInput.svelte';
	import CommandPalette, { type PaletteAction } from '$lib/components/CommandPalette.svelte';
	import type { PageServerData } from './$types';

	let { data }: { data: PageServerData } = $props();

	/* ------------------------------------------------------------- selection */
	let query = $state('');
	let selected = new SvelteSet<string>();
	let lastClicked = $state<number | null>(null);
	let busy = $state(false);
	let notice = $state('');
	let palette = $state<ReturnType<typeof CommandPalette>>();

	const visible = $derived.by(() => {
		const q = query.trim().toLowerCase();
		if (!q) return data.photos;
		return data.photos.filter(
			(p) =>
				p.title.toLowerCase().includes(q) ||
				p.location?.toLowerCase().includes(q) ||
				p.tags.some((t) => t.toLowerCase().includes(q)) ||
				p.albums.some((a) => a.toLowerCase().includes(q))
		);
	});

	const selectedPhotos = $derived(data.photos.filter((p) => selected.has(p.id)));

	function clickPhoto(e: MouseEvent, photo: Photo, index: number) {
		if (e.shiftKey && lastClicked !== null) {
			const [from, to] = [Math.min(lastClicked, index), Math.max(lastClicked, index)];
			for (let i = from; i <= to; i++) selected.add(visible[i].id);
		} else if (e.metaKey || e.ctrlKey) {
			if (selected.has(photo.id)) selected.delete(photo.id);
			else selected.add(photo.id);
		} else if (selected.size === 1 && selected.has(photo.id)) {
			openEditor(photo);
			return;
		} else {
			selected.clear();
			selected.add(photo.id);
		}
		lastClicked = index;
	}

	function flash(message: string) {
		notice = message;
		setTimeout(() => (notice = ''), 2500);
	}

	/* ------------------------------------------------------------- bulk ops */
	const lower = (s: string) => s.trim().toLowerCase();

	/* Quick-edit "palette": the tags/albums already on the selection surface as
	   removable chips. A chip every selected photo shares is solid; one only some
	   carry is amber (partial). Clicking a chip strips that tag/album. */
	interface Facet {
		value: string;
		count: number;
		all: boolean;
	}
	function buildFacets(pick: (p: Photo) => string[]): Facet[] {
		const map = new Map<string, { value: string; count: number }>();
		for (const p of selectedPhotos)
			for (const v of pick(p)) {
				if (lower(v) === FAVORITE_TAG) continue; // favorite has its own toggle
				const e = map.get(lower(v));
				if (e) e.count++;
				else map.set(lower(v), { value: v, count: 1 });
			}
		const n = selectedPhotos.length;
		return [...map.values()]
			.map((e) => ({ ...e, all: e.count === n }))
			.sort((a, b) => b.count - a.count || a.value.localeCompare(b.value));
	}
	const tagFacets = $derived(buildFacets((p) => p.tags));
	const albumFacets = $derived(buildFacets((p) => p.albums));

	let tagAdd = $state('');
	let albumAdd = $state('');

	function addFacet(kind: 'tag' | 'album', raw: string) {
		if (!raw.trim()) return;
		bulkOp(kind === 'tag' ? 'addTags' : 'addAlbums', [raw.trim()]);
		if (kind === 'tag') tagAdd = '';
		else albumAdd = '';
	}
	function removeFacet(kind: 'tag' | 'album', value: string) {
		bulkOp(kind === 'tag' ? 'removeTags' : 'removeAlbums', [value]);
	}

	let locOpen = $state(false);
	let locValue = $state('');
	let locInput = $state<HTMLInputElement>();
	let locRoot = $state<HTMLElement>();
	let filmOpen = $state(false);
	let filmRoot = $state<HTMLElement>();
	let filmForm = $state({ stock: '', iso: '', format: '' });
	let exifOpen = $state(false);
	let exifRoot = $state<HTMLElement>();
	let exifForm = $state({ cameraModel: '', lens: '', focalLength: '', aperture: '', shutterSpeed: '', iso: '' });

	const allAnalog = $derived(selectedPhotos.length > 0 && selectedPhotos.every((p) => p.analog));

	function toggleExifPopover() {
		exifOpen = !exifOpen;
		if (exifOpen) {
			// prefill from the first selected photo so shared values carry over
			const f = selectedPhotos[0];
			exifForm = {
				cameraModel: f?.cameraModel ?? '',
				lens: f?.lens ?? '',
				focalLength: f?.focalLength ?? '',
				aperture: f?.aperture ?? '',
				shutterSpeed: f?.shutterSpeed ?? '',
				iso: f?.iso != null ? String(f.iso) : ''
			};
		}
	}

	async function applyExif() {
		exifOpen = false;
		const isoNum = exifForm.iso.trim() ? Number(exifForm.iso.trim()) : null;
		await bulkOp('setExif', [], null, {
			exif: {
				cameraModel: exifForm.cameraModel.trim() || null,
				lens: exifForm.lens.trim() || null,
				focalLength: exifForm.focalLength.trim() || null,
				aperture: exifForm.aperture.trim() || null,
				shutterSpeed: exifForm.shutterSpeed.trim() || null,
				iso: isoNum != null && Number.isFinite(isoNum) ? isoNum : null
			}
		});
	}

	function toggleFilmPopover() {
		filmOpen = !filmOpen;
		if (filmOpen) {
			// prefill from the selection if they share film details
			const first = selectedPhotos[0];
			filmForm = {
				stock: first?.filmStock ?? '',
				iso: first?.filmIso ?? '',
				format: first?.filmFormat ?? ''
			};
		}
	}

	async function applyFilm() {
		filmOpen = false;
		await bulkOp('setFilm', [], null, {
			filmStock: filmForm.stock.trim() || null,
			filmIso: filmForm.iso.trim() || null,
			filmFormat: filmForm.format.trim() || null
		});
	}

	async function clearAnalog() {
		filmOpen = false;
		await bulkOp('setAnalog', [], null, { analog: false });
	}

	/* hovering/focusing a facet chip lights up (amber rings) exactly the selected
	   photos that carry it — so it's clear what a "remove" would touch */
	let hoverFacet = $state<{ kind: 'tag' | 'album'; value: string } | null>(null);
	const flagged = $derived.by(() => {
		if (!hoverFacet) return new Set<string>();
		const v = lower(hoverFacet.value);
		const pick = hoverFacet.kind === 'tag' ? (p: Photo) => p.tags : (p: Photo) => p.albums;
		return new Set(selectedPhotos.filter((p) => pick(p).some((x) => lower(x) === v)).map((p) => p.id));
	});

	async function bulkOp(
		op: string,
		values: string[] = [],
		value: string | null = null,
		extra: Record<string, unknown> = {}
	) {
		if (selected.size === 0) return;
		busy = true;
		try {
			const res = await fetch('/admin/api/photos', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ ids: [...selected], op, values, value, ...extra })
			});
			if (!res.ok) throw new Error((await res.json()).message);
			flash(`${op === 'delete' ? 'Deleted' : 'Updated'} ${selected.size} photo${selected.size > 1 ? 's' : ''}`);
			if (op === 'delete') selected.clear();
			await invalidateAll();
		} catch (err) {
			flash(err instanceof Error ? err.message : 'Operation failed');
		} finally {
			busy = false;
		}
	}

	const isFavorite = (p: Photo) => p.tags.some((t) => t.toLowerCase() === FAVORITE_TAG);
	const allFavorited = $derived(selectedPhotos.length > 0 && selectedPhotos.every(isFavorite));

	/** Favorite is a reserved tag — add to all selected, or remove if all have it. */
	function toggleFavorite() {
		if (selected.size === 0) return;
		bulkOp(allFavorited ? 'removeTags' : 'addTags', [FAVORITE_TAG]);
	}

	async function bulkDelete() {
		if (selected.size === 0) return;
		if (!confirm(`Delete ${selected.size} photo${selected.size > 1 ? 's' : ''}? This cannot be undone.`)) return;
		await bulkOp('delete');
		editing = null;
	}

	async function bulkLocation(value: string) {
		locOpen = false;
		locValue = '';
		await bulkOp('setLocation', [], value);
	}

	function toggleLocPopover() {
		locOpen = !locOpen;
		if (locOpen) setTimeout(() => locInput?.focus(), 10);
	}

	/* ------------------------------------------------------------- command palette */
	const PALETTE_ACTIONS: PaletteAction[] = [
		{ id: 'addTags', label: 'Add Tag…', icon: 'tag', valueKind: 'tag', allowCreate: true, needsSelection: true },
		{ id: 'removeTags', label: 'Remove Tag…', icon: 'tag', valueKind: 'tag', needsSelection: true },
		{ id: 'addAlbums', label: 'Add to Album…', icon: 'album', valueKind: 'album', allowCreate: true, needsSelection: true },
		{ id: 'removeAlbums', label: 'Remove from Album…', icon: 'album', valueKind: 'album', needsSelection: true },
		{ id: 'setLocation', label: 'Set Location…', icon: 'location', valueKind: 'location', allowCreate: true, needsSelection: true },
		{ id: 'favorite', label: 'Toggle Favorite', icon: 'star', needsSelection: true },
		{ id: 'edit', label: 'Edit Photo', icon: 'camera', needsSelection: true, hint: 'first selected' },
		{ id: 'delete', label: 'Delete Selected', icon: 'x', needsSelection: true, danger: true },
		{ id: 'selectAll', label: 'Select All', icon: 'check', hint: '⌘A' },
		{ id: 'clearSelection', label: 'Clear Selection', icon: 'x', hint: 'esc' },
		{ id: 'upload', label: 'Go to Upload', icon: 'plus' },
		{ id: 'settings', label: 'Go to Settings', icon: 'focal' },
		{ id: 'viewSite', label: 'View Site', icon: 'lens' }
	];

	function runPaletteAction(id: string, value?: string) {
		switch (id) {
			case 'addTags':
			case 'removeTags':
			case 'addAlbums':
			case 'removeAlbums':
				if (value) bulkOp(id, [value]);
				break;
			case 'setLocation':
				if (value !== undefined) bulkOp('setLocation', [], value);
				break;
			case 'favorite':
				toggleFavorite();
				break;
			case 'edit':
				if (selectedPhotos[0]) openEditor(selectedPhotos[0]);
				break;
			case 'delete':
				bulkDelete();
				break;
			case 'selectAll':
				for (const p of visible) selected.add(p.id);
				break;
			case 'clearSelection':
				selected.clear();
				break;
			case 'upload':
				location.href = '/admin/upload';
				break;
			case 'settings':
				location.href = '/admin/settings';
				break;
			case 'viewSite':
				window.open('/', '_blank');
				break;
		}
	}

	/* ------------------------------------------------------------- editor */
	let editing = $state<Photo | null>(null);
	let edit = $state({
		title: '',
		description: '',
		location: '',
		tags: [] as string[],
		albums: [] as string[],
		titleColor: '#ffffff',
		takenAt: '',
		cameraModel: '',
		lens: '',
		focalLength: '',
		aperture: '',
		shutterSpeed: '',
		iso: '',
		analog: false,
		filmStock: '',
		filmIso: '',
		filmFormat: ''
	});
	/* autosave bookkeeping: baseline is the last-persisted snapshot of `edit` */
	let saveState = $state<'idle' | 'saving' | 'saved' | 'error'>('idle');
	let baseline = '';
	let saveTimer: ReturnType<typeof setTimeout>;
	/* EXIF section open/closed — kept in state (not a reactive `open={}` attribute) so
	   an autosave re-render doesn't snap it shut while you're typing in it */
	let exifSectionOpen = $state(false);
	const editFavorited = $derived(edit.tags.some((t) => t.toLowerCase() === FAVORITE_TAG));

	const swatches = $derived.by(() => {
		const seen = new Set<string>();
		const out: string[] = [];
		for (const c of [...(editing?.palette ?? []), ...TITLE_COLOR_PRESETS.map((p) => p.hex)]) {
			const hex = c.toLowerCase();
			if (!seen.has(hex)) {
				seen.add(hex);
				out.push(hex);
			}
		}
		return out;
	});

	/* deep link from the public photo page: /admin?photo=<id> opens the editor */
	let deepLinked = '';
	$effect(() => {
		const id = page.url.searchParams.get('photo');
		if (id && id !== deepLinked) {
			deepLinked = id;
			const photo = data.photos.find((p) => p.id === id);
			if (photo) {
				selected.clear();
				selected.add(id);
				openEditor(photo);
			}
		}
	});

	function openEditor(photo: Photo) {
		editing = photo;
		edit = {
			title: photo.title,
			description: photo.description ?? '',
			location: photo.location ?? '',
			tags: [...photo.tags],
			albums: [...photo.albums],
			titleColor: photo.titleColor.toLowerCase(),
			takenAt: photo.takenAt?.slice(0, 10) ?? '',
			cameraModel: photo.cameraModel ?? '',
			lens: photo.lens ?? '',
			focalLength: photo.focalLength ?? '',
			aperture: photo.aperture ?? '',
			shutterSpeed: photo.shutterSpeed ?? '',
			iso: photo.iso != null ? String(photo.iso) : '',
			analog: photo.analog,
			filmStock: photo.filmStock ?? '',
			filmIso: photo.filmIso ?? '',
			filmFormat: photo.filmFormat ?? ''
		};
		// remember the freshly-loaded state so the autosave effect doesn't fire on open
		saveState = 'idle';
		baseline = JSON.stringify(edit);
		// default the EXIF section open only when there's nothing in it yet
		exifSectionOpen = !photo.cameraModel && !photo.lens;
	}

	function editPayload() {
		const isoNum = edit.iso.trim() ? Number(edit.iso.trim()) : null;
		return {
			title: edit.title,
			description: edit.description || null,
			location: edit.location || null,
			titleColor: edit.titleColor,
			takenAt: edit.takenAt ? `${edit.takenAt}T12:00:00` : null,
			cameraModel: edit.cameraModel || null,
			lens: edit.lens || null,
			focalLength: edit.focalLength || null,
			aperture: edit.aperture || null,
			shutterSpeed: edit.shutterSpeed || null,
			iso: isoNum != null && Number.isFinite(isoNum) ? isoNum : null,
			analog: edit.analog,
			filmStock: edit.analog ? edit.filmStock || null : null,
			filmIso: edit.analog ? edit.filmIso || null : null,
			filmFormat: edit.analog ? edit.filmFormat || null : null,
			tags: edit.tags,
			albums: edit.albums
		};
	}

	/* debounced autosave: persist the editor whenever `edit` drifts from baseline */
	$effect(() => {
		if (!editing) return;
		const snapshot = JSON.stringify(edit); // reactive read of every field
		if (snapshot === baseline) return;
		saveState = 'saving';
		clearTimeout(saveTimer);
		saveTimer = setTimeout(() => persistEdit(snapshot), 650);
		return () => clearTimeout(saveTimer);
	});

	async function persistEdit(snapshot: string) {
		if (!editing) return;
		try {
			const res = await fetch(`/admin/api/photos/${editing.id}`, {
				method: 'PATCH',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify(editPayload())
			});
			if (!res.ok) throw new Error((await res.json()).message);
			baseline = snapshot;
			saveState = 'saved';
			await invalidateAll();
		} catch (err) {
			saveState = 'error';
			flash(err instanceof Error ? err.message : 'Save failed');
		}
	}

	function closeEditor() {
		clearTimeout(saveTimer);
		const snapshot = JSON.stringify(edit);
		if (editing && snapshot !== baseline) persistEdit(snapshot); // flush pending change
		editing = null;
	}

	/* ------------------------------------------------------------- keyboard */
	function onKeydown(e: KeyboardEvent) {
		const target = e.target as HTMLElement;
		const typing =
			target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT';
		if (e.key === 'Escape') {
			if (locOpen) locOpen = false;
			else if (filmOpen) filmOpen = false;
			else if (exifOpen) exifOpen = false;
			else if (editing) closeEditor();
			else if (typing) target.blur();
			else selected.clear();
			return;
		}
		if (typing) return;
		if ((e.metaKey || e.ctrlKey) && e.key === 'a') {
			e.preventDefault();
			for (const p of visible) selected.add(p.id);
		} else if (e.key === 'Backspace' || e.key === 'Delete') {
			e.preventDefault();
			bulkDelete();
		} else if (e.key === 'e' && selectedPhotos.length === 1) {
			openEditor(selectedPhotos[0]);
		} else if (e.key === '/') {
			e.preventDefault();
			document.getElementById('library-search')?.focus();
		}
	}
</script>

<svelte:window
	onkeydown={onKeydown}
	onpointerdown={(e) => {
		if (locOpen && locRoot && !locRoot.contains(e.target as Node)) locOpen = false;
		if (filmOpen && filmRoot && !filmRoot.contains(e.target as Node)) filmOpen = false;
		if (exifOpen && exifRoot && !exifRoot.contains(e.target as Node)) exifOpen = false;
	}}
/>
<svelte:head><title>Admin · Library</title></svelte:head>

<CommandPalette
	bind:this={palette}
	actions={PALETTE_ACTIONS}
	suggestions={{ tag: data.options.tags, album: data.options.albums, location: data.options.locations }}
	selectedCount={selected.size}
	onrun={runPaletteAction}
/>

<main class="px-4 py-6 sm:px-6 {selected.size > 0 ? 'pb-40' : 'pb-16'}">
	<div class="mb-6 flex flex-wrap items-baseline justify-between gap-4">
		<div class="flex items-baseline gap-4">
			<h1 class="type-display text-2xl">Library</h1>
			<span class="type-mono text-ink-soft">{data.photos.length} photos</span>
		</div>
		<div class="flex items-center gap-4">
			<button
				type="button"
				class="type-label hidden cursor-pointer items-center gap-1.5 text-ink-soft transition-colors hover:text-accent sm:flex"
				onclick={() => palette?.show()}
			>
				<Icon name="search" size={13} />Commands
				<kbd class="type-mono text-[0.625rem]">⇧⇧</kbd>
			</button>
			<input
				id="library-search"
				type="search"
				placeholder="Search ( / )"
				bind:value={query}
				class="field w-44 text-sm"
			/>
			<a href="/admin/upload" class="btn btn-outline">Upload</a>
		</div>
	</div>

	{#if data.photos.length === 0}
		<div class="flex flex-col items-center gap-3 py-24 text-center">
			<p class="type-display text-xl text-ink-soft">Your library is empty</p>
			<a href="/admin/upload" class="type-label text-accent underline underline-offset-4">Upload photos</a>
		</div>
	{:else}
		<p class="type-label mb-4 text-ink-soft">
			Click to select · shift-click range · ⌘-click toggle · click again to edit · ⇧⇧ commands · ⌘A all · ⌫ delete
		</p>
		<div class="flex flex-wrap gap-2.5">
			{#each visible as photo, i (photo.id)}
				<button
					type="button"
					onclick={(e) => clickPhoto(e, photo, i)}
					class="group relative block h-28 cursor-pointer overflow-hidden bg-cover bg-center outline-offset-2 transition-shadow sm:h-36 {selected.has(
						photo.id
					)
						? flagged.has(photo.id)
							? 'ring-2 ring-amber-600 ring-offset-1 ring-offset-paper'
							: 'ring-2 ring-accent ring-offset-1 ring-offset-paper'
						: 'hover:opacity-90'}"
					style="aspect-ratio: {photo.width} / {photo.height}; background-image: url('{photo.blurData}')"
					title={photo.title}
				>
					<img src="/img/{photo.id}/sm" alt={photo.title} loading="lazy" class="h-full w-full object-cover" />
					{#if isFavorite(photo)}
						<span class="absolute top-1.5 left-1.5 text-amber-400 drop-shadow-[0_1px_2px_rgba(0,0,0,0.5)]">
							<Icon name="star" size={14} />
						</span>
					{/if}
					{#if selected.has(photo.id)}
						<span
							class="absolute top-1.5 right-1.5 flex h-5 w-5 items-center justify-center rounded-full text-paper {flagged.has(
								photo.id
							)
								? 'bg-amber-600'
								: 'bg-accent'}"
						>
							<Icon name="check" size={11} />
						</span>
					{/if}
					<span
						class="absolute inset-x-0 bottom-0 truncate bg-gradient-to-t from-black/60 to-transparent px-2 pt-4 pb-1 text-left text-xs text-white opacity-0 transition-opacity group-hover:opacity-100"
					>
						{photo.title}
					</span>
				</button>
			{/each}
		</div>
	{/if}
</main>

<!-- bulk action bar -->
{#if selected.size > 0}
	<div
		transition:fly={{ y: 16, duration: 200 }}
		class="fixed inset-x-0 bottom-0 z-30 border-t border-hairline bg-paper px-4 py-3 shadow-[0_-4px_24px_rgba(0,0,0,0.06)] sm:px-6"
	>
		<div class="flex flex-wrap items-center gap-x-5 gap-y-3">
			<span class="type-label text-accent">{selected.size} selected</span>

			<div class="facet-row">
				<Icon name="tag" size={13} class="shrink-0 text-ink-soft" />
				{@render facetChips('tag', tagFacets)}
				<input
					class="facet-add"
					list="tags-all"
					placeholder="add tag"
					bind:value={tagAdd}
					disabled={busy}
					onkeydown={(e) => {
						if (e.key === 'Enter') addFacet('tag', tagAdd);
					}}
				/>
			</div>

			<div class="facet-row">
				<Icon name="album" size={13} class="shrink-0 text-ink-soft" />
				{@render facetChips('album', albumFacets)}
				<input
					class="facet-add"
					list="albums-all"
					placeholder="add album"
					bind:value={albumAdd}
					disabled={busy}
					onkeydown={(e) => {
						if (e.key === 'Enter') addFacet('album', albumAdd);
					}}
				/>
			</div>

			<div class="flex items-center gap-2">
				<button
					data-tip={allFavorited ? 'Remove favorite' : 'Mark as favorite'}
					class="btn btn-icon {allFavorited
						? 'border border-amber-400 text-amber-600 hover:border-amber-600'
						: 'btn-quiet hover:border-amber-500 hover:text-amber-600'}"
					disabled={busy}
					onclick={toggleFavorite}
				>
					<Icon name="star" size={13} class={allFavorited ? 'text-amber-500' : ''} />
				</button>
				<div class="relative" bind:this={locRoot}>
					<button
						class="btn {locOpen ? 'border border-accent text-accent' : 'btn-quiet'}"
						disabled={busy}
						onclick={toggleLocPopover}><Icon name="location" size={12} /> Location…</button
					>
					{#if locOpen}
						<div
							transition:fly={{ y: 6, duration: 150 }}
							class="pop absolute bottom-full left-0 z-40 mb-2 w-72 p-3"
						>
							<span class="type-label text-ink-soft">Set location for {selected.size} photo{selected.size > 1 ? 's' : ''}</span>
							<input
								bind:this={locInput}
								bind:value={locValue}
								list="locations"
								placeholder="Florence, Italy…"
								onkeydown={(e) => {
									if (e.key === 'Enter') bulkLocation(locValue);
									if (e.key === 'Escape') {
										e.stopPropagation();
										locOpen = false;
									}
								}}
								class="field mt-2 text-sm"
							/>
							<div class="mt-3 flex items-center gap-2">
								<button class="btn btn-outline" disabled={busy || !locValue.trim()} onclick={() => bulkLocation(locValue)}>
									Set
								</button>
								<button class="btn btn-ghost hover:text-red-800" disabled={busy} onclick={() => bulkLocation('')}>
									Clear location
								</button>
							</div>
						</div>
					{/if}
				</div>
				<div class="relative" bind:this={filmRoot}>
					<button
						data-tip="Mark as film / set film stock"
						class="btn {filmOpen || allAnalog ? 'border border-accent text-accent' : 'btn-quiet'}"
						disabled={busy}
						onclick={toggleFilmPopover}><Icon name="film" size={12} /> Film…</button
					>
					{#if filmOpen}
						<div transition:fly={{ y: 6, duration: 150 }} class="pop absolute bottom-full left-0 z-40 mb-2 w-72 p-3">
							<span class="type-label text-ink-soft"
								>Mark {selected.size} photo{selected.size > 1 ? 's' : ''} as film</span
							>
							<input
								bind:value={filmForm.stock}
								list="film-stocks"
								placeholder="Film stock — Kodak Portra 400"
								class="field mt-2 text-sm"
							/>
							<div class="mt-2 flex gap-2">
								<input bind:value={filmForm.iso} placeholder="ISO 400" class="field text-sm" />
								<input bind:value={filmForm.format} list="film-formats" placeholder="35mm" class="field text-sm" />
							</div>
							<div class="mt-3 flex items-center gap-2">
								<button class="btn btn-outline" disabled={busy} onclick={applyFilm}>Apply</button>
								<button class="btn btn-ghost hover:text-red-800" disabled={busy} onclick={clearAnalog}>Mark digital</button>
							</div>
						</div>
					{/if}
				</div>
				<div class="relative" bind:this={exifRoot}>
					<button
						data-tip="Set camera & exposure for the selection"
						class="btn {exifOpen ? 'border border-accent text-accent' : 'btn-quiet'}"
						disabled={busy}
						onclick={toggleExifPopover}><Icon name="camera" size={12} /> Camera…</button
					>
					{#if exifOpen}
						<div transition:fly={{ y: 6, duration: 150 }} class="pop absolute bottom-full left-0 z-40 mb-2 w-80 p-3">
							<span class="type-label text-ink-soft"
								>Camera &amp; exposure for {selected.size} photo{selected.size > 1 ? 's' : ''}</span
							>
							<input bind:value={exifForm.cameraModel} placeholder="Camera — Canon EOS R6" class="field mt-2 text-sm" />
							<input bind:value={exifForm.lens} placeholder="Lens — RF 35mm F1.8" class="field mt-2 text-sm" />
							<div class="mt-2 grid grid-cols-2 gap-2">
								<input bind:value={exifForm.focalLength} placeholder="Focal — 35mm" class="field text-sm" />
								<input bind:value={exifForm.aperture} placeholder="Aperture — f/2.8" class="field text-sm" />
								<input bind:value={exifForm.shutterSpeed} placeholder="Shutter — 1/250s" class="field text-sm" />
								<input bind:value={exifForm.iso} inputmode="numeric" placeholder="ISO — 400" class="field text-sm" />
							</div>
							<div class="mt-3 flex items-center gap-2">
								<button class="btn btn-outline" disabled={busy} onclick={applyExif}>Apply to all</button>
								<span class="type-label text-ink-soft">blank clears that field</span>
							</div>
						</div>
					{/if}
				</div>
				<button class="btn btn-danger" disabled={busy} onclick={bulkDelete}>Delete</button>
				<button class="btn btn-ghost" onclick={() => selected.clear()}>Clear</button>
			</div>
			{#if hoverFacet && flagged.size}
				<span class="facet-hint" transition:fly={{ y: 4, duration: 160 }}>
					<span class="facet-hint-dot"></span>
					Remove “{hoverFacet.value}” from {flagged.size} of {selected.size}
				</span>
			{/if}
			{#if notice}<span class="type-mono pb-2 text-accent">{notice}</span>{/if}
		</div>
	</div>
{/if}

{#snippet facetChips(kind: 'tag' | 'album', facets: Facet[])}
	{#each facets as f (f.value)}
		<button
			type="button"
			class="facet-chip {f.all ? '' : 'facet-chip-partial'}"
			disabled={busy}
			data-tip={f.all ? 'Remove from all selected' : `On ${f.count} of ${selected.size} — click to remove`}
			onmouseenter={() => (hoverFacet = { kind, value: f.value })}
			onmouseleave={() => (hoverFacet = null)}
			onfocus={() => (hoverFacet = { kind, value: f.value })}
			onblur={() => (hoverFacet = null)}
			onclick={() => removeFacet(kind, f.value)}
		>
			{f.value}
			{#if !f.all}<span class="facet-count">{f.count}</span>{/if}
			<Icon name="x" size={10} />
		</button>
	{/each}
{/snippet}

<!-- single photo editor -->
{#if editing}
	{@const photo = editing}
	<div class="fixed inset-0 z-40 flex justify-end bg-ink/20">
		<button type="button" class="flex-1" aria-label="Close editor" onclick={closeEditor}></button>
		<div
			transition:fly={{ x: 24, duration: 200 }}
			class="flex h-full w-full max-w-md flex-col overflow-y-auto border-l border-hairline bg-paper px-6 py-5"
		>
			<div class="mb-4 flex items-center justify-between">
				<div class="flex items-baseline gap-3">
					<h2 class="type-display text-xl">Edit photo</h2>
					<span
						class="type-label transition-colors {saveState === 'error'
							? 'text-red-800'
							: saveState === 'saving'
								? 'text-ink-soft'
								: 'text-accent'}"
					>
						{#if saveState === 'saving'}<span class="save-dot"></span>Saving…
						{:else if saveState === 'saved'}<Icon name="check" size={12} /> Saved
						{:else if saveState === 'error'}Save failed{/if}
					</span>
				</div>
				<button class="type-label cursor-pointer text-ink-soft hover:text-ink" onclick={closeEditor}
					>Close (Esc)</button
				>
			</div>

			<img src="/img/{photo.id}/md" alt={photo.title} class="mb-4 max-h-56 w-full bg-hairline object-contain" />

			<div class="flex flex-col gap-4">
				<div class="flex items-end gap-3">
					<label class="flex min-w-0 flex-1 flex-col gap-1">
						<span class="type-label text-ink-soft">Title</span>
						<input bind:value={edit.title} class="field" />
					</label>
					<button
						type="button"
						data-tip={editFavorited ? 'Remove favorite' : 'Mark as favorite'}
						class="btn mb-0.5 {editFavorited
							? 'border border-amber-400 text-amber-600'
							: 'btn-quiet hover:border-amber-500 hover:text-amber-600'}"
						onclick={() =>
							(edit.tags = editFavorited
								? edit.tags.filter((t) => t.toLowerCase() !== FAVORITE_TAG)
								: [...edit.tags, FAVORITE_TAG])}
					>
						<Icon name="star" size={13} class={editFavorited ? 'text-amber-500' : ''} />
					</button>
				</div>
				<label class="flex flex-col gap-1">
					<span class="type-label text-ink-soft">Description</span>
					<textarea
						bind:value={edit.description}
						rows="2"
						class="resize-none border-b border-hairline bg-transparent py-1.5 outline-none focus:border-accent"
					></textarea>
				</label>
				<div class="grid grid-cols-2 gap-4">
					<label class="flex flex-col gap-1">
						<span class="type-label text-ink-soft">Location</span>
						<input
							bind:value={edit.location}
							list="locations"
							class="field"
						/>
					</label>
					<label class="flex flex-col gap-1">
						<span class="type-label text-ink-soft">Date taken</span>
						<input
							type="date"
							bind:value={edit.takenAt}
							class="field"
						/>
					</label>
				</div>
				<div class="flex flex-col gap-1">
					<span class="type-label text-ink-soft">Tags</span>
					<TagInput bind:values={edit.tags} suggestions={data.options.tags} placeholder="Add tags…" icon="tag" />
				</div>
				<div class="flex flex-col gap-1">
					<span class="type-label text-ink-soft">Albums</span>
					<TagInput bind:values={edit.albums} suggestions={data.options.albums} placeholder="Add to albums…" icon="album" />
				</div>

				<!-- camera & exposure (EXIF) — now editable -->
				<details class="border-y border-hairline py-1" bind:open={exifSectionOpen}>
					<summary class="type-label flex cursor-pointer items-center gap-2 py-2 text-ink-soft marker:content-none">
						<Icon name="camera" size={14} />Camera &amp; exposure
					</summary>
					<div class="grid grid-cols-2 gap-3 pt-1 pb-2">
						<label class="col-span-2 flex flex-col gap-1">
							<span class="type-label text-ink-soft">Camera</span>
							<input bind:value={edit.cameraModel} placeholder="Canon EOS R6" class="field" />
						</label>
						<label class="col-span-2 flex flex-col gap-1">
							<span class="type-label text-ink-soft">Lens</span>
							<input bind:value={edit.lens} placeholder="RF 35mm F1.8" class="field" />
						</label>
						<label class="flex flex-col gap-1">
							<span class="type-label text-ink-soft">Focal length</span>
							<input bind:value={edit.focalLength} placeholder="35mm" class="field" />
						</label>
						<label class="flex flex-col gap-1">
							<span class="type-label text-ink-soft">Aperture</span>
							<input bind:value={edit.aperture} placeholder="f/2.8" class="field" />
						</label>
						<label class="flex flex-col gap-1">
							<span class="type-label text-ink-soft">Shutter</span>
							<input bind:value={edit.shutterSpeed} placeholder="1/250s" class="field" />
						</label>
						<label class="flex flex-col gap-1">
							<span class="type-label text-ink-soft">ISO</span>
							<input bind:value={edit.iso} inputmode="numeric" placeholder="400" class="field" />
						</label>
					</div>
				</details>

				<!-- analog / film -->
				<div class="flex flex-col gap-3 border-y border-hairline py-3">
					<label class="flex cursor-pointer items-center gap-2.5">
						<input type="checkbox" bind:checked={edit.analog} class="h-4 w-4 accent-(--accent)" />
						<Icon name="film" size={14} class={edit.analog ? 'text-accent' : 'text-ink-soft'} />
						<span class="type-label {edit.analog ? 'text-accent' : 'text-ink-soft'}">Shot on film (analog)</span>
					</label>
					{#if edit.analog}
						<div class="grid grid-cols-2 gap-3" transition:slide={{ duration: 180 }}>
							<label class="col-span-2 flex flex-col gap-1">
								<span class="type-label text-ink-soft">Film stock</span>
								<input bind:value={edit.filmStock} list="film-stocks" placeholder="Kodak Portra 400" class="field" />
							</label>
							<label class="flex flex-col gap-1">
								<span class="type-label text-ink-soft">Film ISO</span>
								<input bind:value={edit.filmIso} placeholder="400" class="field" />
							</label>
							<label class="flex flex-col gap-1">
								<span class="type-label text-ink-soft">Format</span>
								<input bind:value={edit.filmFormat} list="film-formats" placeholder="35mm" class="field" />
							</label>
						</div>
					{/if}
				</div>

				<div class="flex flex-col gap-2">
					<span class="type-label text-ink-soft">Postcard title color</span>
					<div class="flex flex-wrap items-center gap-2">
						{#each swatches as swatch (swatch)}
							<button
								type="button"
								aria-label="Use {swatch}"
								data-tip={TITLE_COLOR_PRESETS.find((p) => p.hex === swatch)?.name ?? 'Detected from photo'}
								class="h-7 w-7 cursor-pointer rounded-full border border-hairline transition-transform hover:scale-110 {edit.titleColor ===
								swatch
									? 'ring-2 ring-accent ring-offset-2 ring-offset-paper'
									: ''}"
								style="background: {swatch}"
								onclick={() => (edit.titleColor = swatch)}
							></button>
						{/each}
						<input
							type="color"
							bind:value={edit.titleColor}
							class="h-7 w-10 cursor-pointer border border-hairline bg-transparent"
							title="Custom color"
						/>
						<span class="type-mono text-ink-soft">{edit.titleColor}</span>
					</div>
					<div
						class="relative mt-1 flex h-20 items-center justify-center overflow-hidden bg-cover bg-center"
						style="background-image: url('/img/{photo.id}/sm')"
					>
						<span class="type-display text-xl" style="color: {edit.titleColor}; text-shadow: 0 1px 24px rgba(0,0,0,0.22)"
							>{edit.title || photo.title}</span
						>
					</div>
				</div>

				<div class="mt-2 flex items-center gap-3">
					<a href="/photo/{photo.id}" target="_blank" class="type-label text-ink-soft hover:text-accent">Preview postcard ↗</a>
				</div>
			</div>
		</div>
	</div>
{/if}

<datalist id="locations">
	{#each data.options.locations as location (location)}<option value={location}></option>{/each}
</datalist>
<datalist id="tags-all">
	{#each data.options.tags as tag (tag)}<option value={tag}></option>{/each}
</datalist>
<datalist id="albums-all">
	{#each data.options.albums as album (album)}<option value={album}></option>{/each}
</datalist>
<datalist id="film-stocks">
	{#each data.options.filmStocks as stock (stock)}<option value={stock}></option>{/each}
</datalist>
<datalist id="film-formats">
	<option value="35mm"></option>
	<option value="120"></option>
	<option value="110"></option>
	<option value="4×5"></option>
	<option value="APS"></option>
</datalist>
