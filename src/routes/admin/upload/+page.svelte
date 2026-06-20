<script lang="ts">
	import { slide } from 'svelte/transition';
	import { titleFromFilename } from '$lib/slug';
	import TagInput from '$lib/components/TagInput.svelte';
	import Icon from '$lib/components/Icon.svelte';
	import type { PageServerData } from './$types';

	let { data }: { data: PageServerData } = $props();

	type Status = 'queued' | 'uploading' | 'done' | 'error';
	interface QueueItem {
		file: File;
		title: string;
		preview: string;
		status: Status;
		error?: string;
		id?: string; // photo id once uploaded
	}

	let queue = $state<QueueItem[]>([]);
	let dragging = $state(0);
	let uploading = $state(false);

	// metadata applied to every photo in the batch
	let common = $state({
		tags: [] as string[],
		albums: [] as string[],
		location: '',
		description: '',
		analog: false,
		filmStock: '',
		filmIso: '',
		filmFormat: ''
	});

	function addFiles(files: FileList | File[]) {
		for (const file of files) {
			if (!file.type.startsWith('image/')) continue;
			queue.push({
				file,
				title: titleFromFilename(file.name),
				preview: URL.createObjectURL(file),
				status: 'queued'
			});
		}
	}

	function onDrop(e: DragEvent) {
		e.preventDefault();
		dragging = 0;
		if (e.dataTransfer?.files) addFiles(e.dataTransfer.files);
	}

	async function uploadOne(item: QueueItem) {
		item.status = 'uploading';
		const form = new FormData();
		form.set('file', item.file);
		form.set('title', item.title);
		form.set('tags', common.tags.join(','));
		form.set('albums', common.albums.join(','));
		form.set('location', common.location);
		form.set('description', common.description);
		form.set('analog', common.analog ? '1' : '');
		form.set('filmStock', common.analog ? common.filmStock : '');
		form.set('filmIso', common.analog ? common.filmIso : '');
		form.set('filmFormat', common.analog ? common.filmFormat : '');
		form.set('lastModified', String(item.file.lastModified));
		try {
			const res = await fetch('/admin/api/upload', { method: 'POST', body: form });
			if (!res.ok) throw new Error((await res.json()).message ?? `HTTP ${res.status}`);
			const photo = await res.json();
			item.id = photo.id;
			item.title = photo.title;
			item.status = 'done';
		} catch (err) {
			item.status = 'error';
			item.error = err instanceof Error ? err.message : 'Upload failed';
		}
	}

	async function uploadAll() {
		uploading = true;
		for (const q of queue) if (q.status === 'error') q.status = 'queued';
		// two at a time: image processing is CPU-bound on the local machine
		const workers = Array.from({ length: 2 }, async () => {
			let item: QueueItem | undefined;
			while ((item = queue.find((q) => q.status === 'queued'))) {
				await uploadOne(item);
			}
		});
		await Promise.all(workers);
		uploading = false;
	}

	const counts = $derived({
		queued: queue.filter((q) => q.status === 'queued').length,
		done: queue.filter((q) => q.status === 'done').length,
		error: queue.filter((q) => q.status === 'error').length
	});

	function onKeydown(e: KeyboardEvent) {
		if ((e.metaKey || e.ctrlKey) && e.key === 'Enter' && counts.queued > 0 && !uploading) {
			e.preventDefault();
			uploadAll();
		}
	}
</script>

<svelte:window
	ondragover={(e) => e.preventDefault()}
	ondrop={(e) => e.preventDefault()}
	onkeydown={onKeydown}
/>
<svelte:head><title>Admin · Upload</title></svelte:head>

<main class="mx-auto max-w-5xl px-4 py-6 sm:px-6">
	<h1 class="type-display mb-6 text-2xl">Upload photos</h1>

	<!-- dropzone -->
	<label
		class="flex min-h-44 cursor-pointer flex-col items-center justify-center gap-3 border-2 border-dashed px-6 py-10 text-center transition-colors {dragging
			? 'border-accent bg-accent/5'
			: 'border-hairline hover:border-ink-soft'}"
		ondragenter={(e) => {
			e.preventDefault();
			dragging++;
		}}
		ondragleave={() => dragging--}
		ondragover={(e) => e.preventDefault()}
		ondrop={onDrop}
	>
		<span class="type-display text-xl">Drop photographs here</span>
		<span class="type-label text-ink-soft">or click to browse · EXIF, sizes & title color are processed locally</span>
		<input
			type="file"
			accept="image/*"
			multiple
			class="hidden"
			onchange={(e) => {
				const input = e.currentTarget;
				if (input.files) addFiles(input.files);
				input.value = '';
			}}
		/>
	</label>

	<!-- batch metadata -->
	<section class="mt-6 border border-hairline p-4 sm:p-5">
		<h2 class="type-label mb-4 text-ink-soft">Applied to every photo in this batch</h2>
		<div class="grid gap-4 sm:grid-cols-2">
			<div class="flex flex-col gap-1">
				<span class="type-label text-ink-soft">Tags</span>
				<TagInput bind:values={common.tags} suggestions={data.options.tags} placeholder="travel, golden hour…" icon="tag" />
			</div>
			<div class="flex flex-col gap-1">
				<span class="type-label text-ink-soft">Albums</span>
				<TagInput bind:values={common.albums} suggestions={data.options.albums} placeholder="Italy 2026…" icon="album" />
			</div>
			<label class="flex flex-col gap-1">
				<span class="type-label text-ink-soft">Location</span>
				<input bind:value={common.location} list="locations" placeholder="Florence, Italy" class="field" />
			</label>
			<label class="flex flex-col gap-1">
				<span class="type-label text-ink-soft">Description</span>
				<input bind:value={common.description} class="field" />
			</label>
		</div>

		<!-- analog / film for the whole batch -->
		<div class="mt-4 border-t border-hairline pt-4">
			<label class="flex cursor-pointer items-center gap-2.5">
				<input type="checkbox" bind:checked={common.analog} class="h-4 w-4 accent-(--accent)" />
				<Icon name="film" size={14} class={common.analog ? 'text-accent' : 'text-ink-soft'} />
				<span class="type-label {common.analog ? 'text-accent' : 'text-ink-soft'}">Shot on film (analog)</span>
			</label>
			{#if common.analog}
				<div class="mt-3 grid gap-4 sm:grid-cols-4" transition:slide={{ duration: 180 }}>
					<label class="flex flex-col gap-1 sm:col-span-2">
						<span class="type-label text-ink-soft">Film stock</span>
						<input bind:value={common.filmStock} placeholder="Kodak Portra 400" class="field" />
					</label>
					<label class="flex flex-col gap-1">
						<span class="type-label text-ink-soft">Film ISO</span>
						<input bind:value={common.filmIso} placeholder="400" class="field" />
					</label>
					<label class="flex flex-col gap-1">
						<span class="type-label text-ink-soft">Format</span>
						<input bind:value={common.filmFormat} list="film-formats" placeholder="35mm" class="field" />
					</label>
				</div>
			{/if}
		</div>
	</section>

	<!-- queue -->
	{#if queue.length}
		<section class="mt-6">
			<div class="mb-3 flex flex-wrap items-center justify-between gap-3">
				<p class="type-label text-ink-soft">
					{queue.length} photo{queue.length > 1 ? 's' : ''}
					{#if counts.done}· <span class="text-accent">{counts.done} uploaded</span>{/if}
					{#if counts.error}· <span class="text-red-800">{counts.error} failed</span>{/if}
				</p>
				<div class="flex items-center gap-3">
					{#if counts.done > 0}
						<a href="/admin" class="type-label text-ink-soft hover:text-accent">Edit in library →</a>
					{/if}
					<button
						class="btn btn-outline px-5 py-2.5"
						disabled={uploading || (counts.queued === 0 && counts.error === 0)}
						onclick={uploadAll}
					>
						{uploading ? 'Uploading…' : counts.error > 0 && counts.queued === 0 ? 'Retry failed (⌘↵)' : `Upload ${counts.queued || ''} (⌘↵)`}
					</button>
				</div>
			</div>

			<ul class="divide-y divide-hairline border border-hairline">
				{#each queue as item, i (item.preview)}
					<li class="flex items-center gap-4 px-3 py-2.5">
						<img src={item.preview} alt="" class="h-14 w-20 shrink-0 bg-hairline object-contain" />
						<input
							bind:value={item.title}
							disabled={item.status === 'done' || item.status === 'uploading'}
							class="min-w-0 flex-1 border-b border-transparent bg-transparent py-1 text-sm outline-none focus:border-accent disabled:text-ink-soft"
							aria-label="Title"
						/>
						<span class="type-mono hidden text-ink-soft sm:inline">{(item.file.size / 1024 / 1024).toFixed(1)} MB</span>
						{#if item.status === 'queued'}
							<button class="type-label cursor-pointer text-ink-soft hover:text-red-800" onclick={() => queue.splice(i, 1)}>Remove</button>
						{:else if item.status === 'uploading'}
							<span class="type-label animate-pulse text-accent">Processing…</span>
						{:else if item.status === 'done'}
							<a href="/photo/{item.id}" target="_blank" class="type-label text-accent hover:underline">View ↗</a>
						{:else}
							<span class="type-label text-red-800" title={item.error}>Failed</span>
						{/if}
					</li>
				{/each}
			</ul>
		</section>
	{/if}
</main>

<datalist id="locations">
	{#each data.options.locations as location (location)}<option value={location}></option>{/each}
</datalist>
<datalist id="film-formats">
	<option value="35mm"></option>
	<option value="120"></option>
	<option value="110"></option>
	<option value="4×5"></option>
	<option value="APS"></option>
</datalist>
