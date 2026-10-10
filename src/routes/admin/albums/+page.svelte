<script lang="ts">
	import { goto } from '$app/navigation';
	import { flip } from 'svelte/animate';
	import Icon from '$lib/components/Icon.svelte';
	import type { PageServerData } from './$types';

	let { data }: { data: PageServerData } = $props();

	type Item = PageServerData['photos'][number];
	let order = $state<Item[]>([]);
	let selected = $state(0);
	let status = $state('');
	let saveTimer: ReturnType<typeof setTimeout> | undefined;
	let grid = $state<HTMLElement>();

	// reset the working order whenever the chosen album changes; a pending save
	// for the previous album must not fire against the new one
	let loadedFor = '';
	$effect(() => {
		if (data.selected !== loadedFor) {
			loadedFor = data.selected;
			order = [...data.photos];
			selected = 0;
			clearTimeout(saveTimer);
			status = '';
		}
	});

	function move(from: number, to: number, opts: { save?: boolean } = {}) {
		if (to < 0 || to >= order.length || from === to || from < 0) return;
		const next = [...order];
		const [item] = next.splice(from, 1);
		next.splice(to, 0, item);
		order = next;
		selected = to;
		if (opts.save !== false) scheduleSave();
	}

	function scheduleSave() {
		status = 'Saving…';
		clearTimeout(saveTimer);
		saveTimer = setTimeout(save, 450);
	}

	async function save() {
		const album = data.selected;
		try {
			const res = await fetch('/admin/api/albums', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ album, photoIds: order.map((p) => p.id) })
			});
			if (!res.ok) throw new Error();
			// the album may have changed while the request was in flight
			if (album === data.selected) {
				status = 'Saved ✓';
				setTimeout(() => (status = ''), 1600);
			}
		} catch {
			status = 'Save failed';
		}
	}

	function selectAlbum(name: string) {
		goto(`/admin/albums?album=${encodeURIComponent(name)}`, { noScroll: true });
	}

	/* --------------------------------------------------------------- dragging
	   Pointer-based (works for mouse and touch alike — no HTML5 DnD, which
	   never fires on mobile). The list reorders live under the pointer while a
	   "lifted print" ghost follows it; drop just commits what you already see.
	   Mouse drags start anywhere on a tile after a small movement threshold so
	   plain clicks still select; touch drags start from the handle, leaving the
	   rest of the tile free for scrolling. */
	interface Drag {
		idx: number;
		item: Item;
		x: number;
		y: number;
		/** grab offset inside the tile + the tile's rendered size, for the ghost */
		ox: number;
		oy: number;
		w: number;
		h: number;
		snapshot: Item[];
	}
	let drag = $state<Drag | null>(null);
	let pending: { idx: number; x: number; y: number; ox: number; oy: number; w: number; h: number } | null = null;
	let scrollRaf = 0;
	let pointerY = 0;

	function onTilePointerDown(e: PointerEvent, i: number) {
		if (e.button !== 0 || drag) return;
		const onHandle = !!(e.target as HTMLElement).closest('[data-drag-handle]');
		if (e.pointerType !== 'mouse' && !onHandle) return;
		const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
		pending = {
			idx: i,
			x: e.clientX,
			y: e.clientY,
			ox: e.clientX - rect.left,
			oy: e.clientY - rect.top,
			w: rect.width,
			h: rect.height
		};
		(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
		// from the handle there's no click to preserve — lift immediately
		if (onHandle) beginDrag(e);
	}

	function beginDrag(e: PointerEvent) {
		if (!pending) return;
		drag = {
			idx: pending.idx,
			item: order[pending.idx],
			x: e.clientX,
			y: e.clientY,
			ox: pending.ox,
			oy: pending.oy,
			w: pending.w,
			h: pending.h,
			snapshot: [...order]
		};
		selected = pending.idx;
		pending = null;
		autoScrollLoop();
	}

	function onTilePointerMove(e: PointerEvent) {
		if (pending && !drag && Math.hypot(e.clientX - pending.x, e.clientY - pending.y) > 6) {
			beginDrag(e);
		}
		if (!drag) return;
		e.preventDefault();
		drag.x = e.clientX;
		drag.y = e.clientY;
		pointerY = e.clientY;
		retarget(e.clientX, e.clientY);
	}

	/** live-reorder: whichever tile the pointer is over becomes the drop slot.
	 *  After the splice the tile under the pointer is the dragged one itself,
	 *  so the arrangement is stable until the pointer crosses another tile. */
	function retarget(x: number, y: number) {
		if (!drag || !grid) return;
		const el = document.elementFromPoint(x, y)?.closest<HTMLElement>('[data-tile-idx]');
		let target = el ? Number(el.dataset.tileIdx) : nearestTile(x, y);
		if (target != null && target !== drag.idx) {
			move(drag.idx, target, { save: false });
			drag.idx = target;
		}
	}

	/** fallback for pointers in the gaps or past the last tile: nearest center */
	function nearestTile(x: number, y: number): number | null {
		if (!grid) return null;
		let best: number | null = null;
		let bestD = Infinity;
		for (const el of grid.querySelectorAll<HTMLElement>('[data-tile-idx]')) {
			const r = el.getBoundingClientRect();
			const d = Math.hypot(x - (r.left + r.width / 2), y - (r.top + r.height / 2));
			if (d < bestD) {
				bestD = d;
				best = Number(el.dataset.tileIdx);
			}
		}
		return best;
	}

	function onTilePointerUp() {
		if (drag) {
			drag = null;
			scheduleSave();
		}
		pending = null;
	}

	function cancelDrag() {
		if (!drag) return;
		order = drag.snapshot;
		selected = drag.snapshot.findIndex((p) => p.id === drag!.item.id);
		drag = null;
	}

	/** keep the window scrolling while the pointer hovers near its edges */
	function autoScrollLoop() {
		cancelAnimationFrame(scrollRaf);
		const tick = () => {
			if (!drag) return;
			const EDGE = 72;
			const vh = window.innerHeight;
			if (pointerY < EDGE) window.scrollBy(0, -Math.ceil((EDGE - pointerY) / 6));
			else if (pointerY > vh - EDGE) window.scrollBy(0, Math.ceil((pointerY - (vh - EDGE)) / 6));
			scrollRaf = requestAnimationFrame(tick);
		};
		scrollRaf = requestAnimationFrame(tick);
	}

	function onKeydown(e: KeyboardEvent) {
		if (e.key === 'Escape' && drag) {
			e.preventDefault();
			cancelDrag();
			return;
		}
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

			<!-- reorderable photos: the grid reorders live under the pointer -->
			<div class="flex-1">
				<div class="flex flex-wrap gap-2.5" bind:this={grid}>
					{#each order as item, i (item.id)}
						<div animate:flip={{ duration: 220 }}>
							<button
								type="button"
								data-tile-idx={i}
								onclick={() => (selected = i)}
								onpointerdown={(e) => onTilePointerDown(e, i)}
								onpointermove={onTilePointerMove}
								onpointerup={onTilePointerUp}
								onpointercancel={onTilePointerUp}
								class="group relative block h-28 overflow-hidden bg-cover bg-center outline-offset-2 transition-shadow sm:h-32 {drag
									? 'cursor-grabbing'
									: 'cursor-grab'} {i === selected && !drag
									? 'ring-2 ring-accent ring-offset-1 ring-offset-paper'
									: 'hover:opacity-90'} {drag?.item.id === item.id
									? 'opacity-30 ring-2 ring-accent ring-offset-1 ring-offset-paper'
									: ''}"
								style="aspect-ratio: {item.width} / {item.height}; background-image: url('{item.blurData}'); touch-action: pan-y"
								title={item.title}
							>
								<img
									src="/img/{item.id}/sm"
									alt={item.title}
									loading="lazy"
									draggable="false"
									class="h-full w-full object-cover"
								/>
								<span
									class="type-mono absolute top-1 left-1 rounded-pop bg-ink/70 px-1.5 py-0.5 text-[0.65rem] text-paper"
									>{i + 1}</span
								>
								<!-- touch drags start here; mouse can grab anywhere -->
								<span
									data-drag-handle
									class="absolute right-1 bottom-1 p-1 text-paper opacity-0 drop-shadow-[0_1px_2px_rgba(0,0,0,0.7)] transition-opacity group-hover:opacity-80 pointer-coarse:opacity-70"
									style="touch-action: none"
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

	<!-- the lifted print: a ghost of the dragged photo following the pointer -->
	{#if drag}
		<div
			class="pointer-events-none fixed z-50 overflow-hidden shadow-pop-lg"
			style="left: {drag.x - drag.ox}px; top: {drag.y - drag.oy}px; width: {drag.w}px; height: {drag.h}px; transform: rotate(1.5deg) scale(1.04)"
		>
			<img src="/img/{drag.item.id}/sm" alt="" class="h-full w-full object-cover" />
		</div>
	{/if}
</main>
