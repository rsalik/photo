<script lang="ts">
	import { goto } from '$app/navigation';
	import { flip } from 'svelte/animate';
	import Icon from '$lib/components/Icon.svelte';
	import type { PageServerData } from './$types';

	let { data }: { data: PageServerData } = $props();

	type Item = PageServerData['photos'][number];
	let order = $state<Item[]>([]);
	let selected = $state(0);
	let dragIndex = $state(-1);
	let overIndex = $state(-1);
	let status = $state('');
	let saveTimer: ReturnType<typeof setTimeout> | undefined;

	// reset the working order whenever the chosen album changes
	let loadedFor = '';
	$effect(() => {
		if (data.selected !== loadedFor) {
			loadedFor = data.selected;
			order = [...data.photos];
			selected = 0;
		}
	});

	function move(from: number, to: number) {
		if (to < 0 || to >= order.length || from === to || from < 0) return;
		const next = [...order];
		const [item] = next.splice(from, 1);
		next.splice(to, 0, item);
		order = next;
		selected = to;
		scheduleSave();
	}

	function scheduleSave() {
		status = 'Saving…';
		clearTimeout(saveTimer);
		saveTimer = setTimeout(save, 450);
	}

	async function save() {
		try {
			const res = await fetch('/admin/api/albums', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ album: data.selected, photoIds: order.map((p) => p.id) })
			});
			if (!res.ok) throw new Error();
			status = 'Saved ✓';
			setTimeout(() => (status = ''), 1600);
		} catch {
			status = 'Save failed';
		}
	}

	function selectAlbum(name: string) {
		goto(`/admin/albums?album=${encodeURIComponent(name)}`, { noScroll: true });
	}

	function onKeydown(e: KeyboardEvent) {
		const t = e.target as HTMLElement;
		if (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA') return;
		if (!order.length) return;
		switch (e.key) {
			case 'ArrowLeft':
				e.preventDefault();
				selected = Math.max(0, selected - 1);
				break;
			case 'ArrowRight':
				e.preventDefault();
				selected = Math.min(order.length - 1, selected + 1);
				break;
			case '[':
				e.preventDefault();
				move(selected, selected - 1);
				break;
			case ']':
				e.preventDefault();
				move(selected, selected + 1);
				break;
			case 'Home':
				e.preventDefault();
				move(selected, 0);
				break;
			case 'End':
				e.preventDefault();
				move(selected, order.length - 1);
				break;
		}
	}
</script>

<svelte:window onkeydown={onKeydown} />
<svelte:head><title>Admin · Album order</title></svelte:head>

<main class="px-4 py-6 sm:px-6">
	<div class="mb-6 flex flex-wrap items-baseline justify-between gap-4">
		<div class="flex items-baseline gap-4">
			<h1 class="type-display text-2xl">Album order</h1>
			{#if status}<span class="type-mono text-accent">{status}</span>{/if}
		</div>
		<p class="type-label flex flex-wrap items-center gap-x-2 gap-y-1.5 text-[0.625rem] text-ink-soft">
			<span class="flex items-center gap-1">Drag to reorder</span>
			<span class="opacity-40">·</span>
			<span class="flex items-center gap-1"><kbd class="key key-sm">←</kbd> <kbd class="key key-sm">→</kbd> select</span>
			<span class="opacity-40">·</span>
			<span class="flex items-center gap-1"><kbd class="key key-sm">[</kbd> <kbd class="key key-sm">]</kbd> move</span>
			<span class="opacity-40">·</span>
			<span class="flex items-center gap-1"><kbd class="key key-sm">Home</kbd>/<kbd class="key key-sm">End</kbd> to ends</span>
			<span class="opacity-40">·</span>
			<span>saves automatically</span>
		</p>
	</div>

	{#if data.albums.length === 0}
		<p class="type-display py-24 text-center text-xl text-ink-soft">No albums yet</p>
	{:else}
		<div class="flex flex-col gap-6 lg:flex-row">
			<!-- album list -->
			<nav class="flex shrink-0 flex-row flex-wrap gap-2 lg:w-52 lg:flex-col">
				{#each data.albums as a (a.name)}
					<button
						type="button"
						onclick={() => selectAlbum(a.name)}
						class="flex items-center justify-between gap-3 border-b px-1 py-2 text-left transition-colors {a.name ===
						data.selected
							? 'border-accent text-accent'
							: 'border-transparent text-ink-soft hover:text-ink'}"
					>
						<span class="type-label inline-flex items-center gap-2"><Icon name="album" size={13} />{a.name}</span>
						<span class="type-mono text-[0.7rem] text-ink-soft">{a.count}</span>
					</button>
				{/each}
			</nav>

			<!-- reorderable photos -->
			<div class="flex-1">
				<div class="flex flex-wrap gap-2.5">
					{#each order as item, i (item.id)}
						<div animate:flip={{ duration: 240 }}>
							<button
								type="button"
								draggable="true"
								onclick={() => (selected = i)}
								ondragstart={() => ((dragIndex = i), (selected = i))}
								ondragover={(e) => {
									e.preventDefault();
									overIndex = i;
								}}
								ondrop={() => {
									move(dragIndex, i);
									dragIndex = -1;
									overIndex = -1;
								}}
								ondragend={() => {
									dragIndex = -1;
									overIndex = -1;
								}}
								class="group relative block h-28 cursor-grab overflow-hidden bg-cover bg-center outline-offset-2 transition-all active:cursor-grabbing sm:h-32 {i ===
								selected
									? 'ring-2 ring-accent ring-offset-1 ring-offset-paper'
									: 'hover:opacity-90'} {overIndex === i && dragIndex !== i ? 'ring-2 ring-accent/50' : ''} {dragIndex ===
								i
									? 'opacity-40'
									: ''}"
								style="aspect-ratio: {item.width} / {item.height}; background-image: url('{item.blurData}')"
								title={item.title}
							>
								<img src="/img/{item.id}/sm" alt={item.title} loading="lazy" class="h-full w-full object-cover" />
								<span
									class="type-mono absolute top-1 left-1 rounded-pop bg-ink/70 px-1.5 py-0.5 text-[0.65rem] text-paper"
									>{i + 1}</span
								>
								<span
									class="absolute right-1 bottom-1 text-paper opacity-0 drop-shadow-[0_1px_2px_rgba(0,0,0,0.7)] transition-opacity group-hover:opacity-80"
								>
									<Icon name="drag" size={14} />
								</span>
							</button>
						</div>
					{/each}
				</div>
				{#if order.length === 0}
					<p class="type-label py-16 text-center text-ink-soft">This album has no photos</p>
				{/if}
			</div>
		</div>
	{/if}
</main>
