<script lang="ts">
	import { onDestroy } from 'svelte';
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
		slug?: string;
		uploadId: string;
	}
	const MAX_UPLOAD_BYTES = 75 * 1024 * 1024;
	const SUPPORTED = /\.(jpe?g|png|webp|heic|heif|tiff?)$/i;

	let queue = $state<QueueItem[]>([]);
	let dragging = $state(0);
	let uploading = $state(false);
	let rejected = $state('');

	// metadata applied to every photo in the batch
	let common = $state({
		tags: [] as string[],
		albums: [] as string[],
		location: '',
		description: '',
		analog: false,
		filmStock: ''
	});

	function addFiles(files: FileList | File[]) {
		if (uploading || !data.localProcessing) return;
		let skipped = 0;
		for (const file of files) {
			const duplicate = queue.some(
				(q) =>
					q.file.name === file.name &&
					q.file.size === file.size &&
					q.file.lastModified === file.lastModified
			);
			if (duplicate || !SUPPORTED.test(file.name) || file.size > MAX_UPLOAD_BYTES) {
				skipped++;
				continue;
			}
			queue.push({
				file,
				title: titleFromFilename(file.name),
				preview: URL.createObjectURL(file),
				status: 'queued',
				uploadId: crypto.randomUUID()
			});
		}
		rejected = skipped
			? `${skipped} file${skipped === 1 ? ' was' : 's were'} skipped (duplicate, unsupported, or over 75 MB)`
			: '';
	}

	function onDrop(e: DragEvent) {
		e.preventDefault();
		dragging = 0;
		if (e.dataTransfer?.files) addFiles(e.dataTransfer.files);
	}

	type BatchMetadata = {
		tags: string[];
		albums: string[];
		location: string;
		description: string;
		analog: boolean;
		filmStock: string;
	};

	async function uploadOne(item: QueueItem, batch: BatchMetadata) {
		item.status = 'uploading';
		const form = new FormData();
		form.set('file', item.file);
		form.set('uploadId', item.uploadId);
		form.set('title', item.title);
		form.set('tags', batch.tags.join(','));
		form.set('albums', batch.albums.join(','));
		form.set('location', batch.location);
		form.set('description', batch.description);
		form.set('analog', batch.analog ? '1' : '');
		form.set('filmStock', batch.analog ? batch.filmStock : '');
		form.set('lastModified', String(item.file.lastModified));
		try {
			const res = await fetch('/admin/api/upload', { method: 'POST', body: form });
			if (!res.ok) throw new Error((await res.json()).message ?? `HTTP ${res.status}`);
			const photo = await res.json();
			item.id = photo.id;
			item.slug = photo.slug;
			item.title = photo.title;
			item.status = 'done';
		} catch (err) {
			item.status = 'error';
			item.error = err instanceof Error ? err.message : 'Upload failed';
		}
	}

	async function uploadAll() {
		if (!data.localProcessing) return;
		uploading = true;
		// One immutable snapshot for the entire batch: editing common fields while
		// workers run can no longer give later files different metadata.
		const batch: BatchMetadata = {
			tags: [...common.tags],
			albums: [...common.albums],
			location: common.location,
			description: common.description,
			analog: common.analog,
			filmStock: common.filmStock
		};
		for (const q of queue) if (q.status === 'error') q.status = 'queued';
		// two at a time: image processing is CPU-bound on the local machine
		const workers = Array.from({ length: 2 }, async () => {
			let item: QueueItem | undefined;
			while ((item = queue.find((q) => q.status === 'queued'))) {
				await uploadOne(item, batch);
			}
		});
		await Promise.all(workers);
		uploading = false;
	}

	function removeItem(index: number) {
		URL.revokeObjectURL(queue[index].preview);
		queue.splice(index, 1);
	}

	onDestroy(() => {
		for (const item of queue) URL.revokeObjectURL(item.preview);
	});

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
	{#if !data.localProcessing}
		<div class="mb-6 border border-amber-600/40 bg-amber-600/5 p-4" role="status">
			<p class="type-label text-amber-700">Local ingest required</p>
			<p class="mt-1 text-sm text-ink-soft">
				Open this admin portal from the local development server to process photographs with
				Sharp and exiftool. The hosted gallery keeps native image processing disabled by design.
			</p>
		</div>
	{/if}

	<!-- dropzone -->
	<label
		class="flex min-h-44 flex-col items-center justify-center gap-3 border-2 border-dashed px-6 py-10 text-center transition-colors {data.localProcessing
			? 'cursor-pointer'
			: 'cursor-not-allowed opacity-50'} {dragging
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
			accept=".jpg,.jpeg,.png,.webp,.heic,.heif,.tif,.tiff"
			multiple
			disabled={uploading || !data.localProcessing}
			class="hidden"
			onchange={(e) => {
				const input = e.currentTarget;
				if (input.files) addFiles(input.files);
				input.value = '';
			}}
		/>
	</label>
	{#if rejected}<p class="type-mono mt-2 text-amber-700" role="alert">{rejected}</p>{/if}

	<!-- batch metadata -->
	<fieldset disabled={uploading || !data.localProcessing} class="mt-6 border border-hairline p-4 disabled:opacity-60 sm:p-5">
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
				<div class="mt-3" transition:slide={{ duration: 180 }}>
					<label class="flex flex-col gap-1">
						<span class="type-label text-ink-soft">Film stock</span>
						<input bind:value={common.filmStock} placeholder="Kodak Portra 400" class="field" />
					</label>
				</div>
			{/if}
		</div>
	</fieldset>

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
						disabled={!data.localProcessing || uploading || (counts.queued === 0 && counts.error === 0)}
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
							<button class="type-label cursor-pointer text-ink-soft hover:text-red-800" onclick={() => removeItem(i)}>Remove</button>
						{:else if item.status === 'uploading'}
							<span class="type-label animate-pulse text-accent">Processing…</span>
						{:else if item.status === 'done'}
							<a href="/photo/{item.slug}" target="_blank" class="type-label text-accent hover:underline">View ↗</a>
						{:else}
							<span class="max-w-48 truncate text-xs text-red-800" title={item.error}>{item.error ?? 'Failed'}</span>
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
