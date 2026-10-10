<script lang="ts">
	import { onDestroy, onMount } from 'svelte';
	import { devicePixelRatio } from 'svelte/reactivity/window';
	import { photoLoadPlan, type PhotoSource } from '$lib/image-sources';
	import { createProgressivePhotoLoader } from '$lib/progressive-photo';
	import type { Photo } from '$lib/types';

	interface Props {
		photo: Photo;
		displayWidth: number;
		/** The immersive lightbox always upgrades to the full-resolution image. */
		preferFull?: boolean;
	}
	let { photo, displayWidth, preferFull = false }: Props = $props();

	let ready = $state<{ photoId: string; source: PhotoSource }>();
	const current = $derived(ready?.photoId === photo.id ? ready.source : undefined);
	let img = $state<HTMLImageElement>();
	let loaded = $state(false);
	let pageScale = $state(1);
	const loader = createProgressivePhotoLoader((photoId, source) => {
		ready = { photoId, source };
	});
	onDestroy(() => loader.destroy());
	onMount(() => {
		const viewport = window.visualViewport;
		if (!viewport) return;
		// Native pinch zoom changes the visual viewport, but not devicePixelRatio.
		const updateScale = () => (pageScale = Math.max(1, viewport.scale));
		updateScale();
		viewport.addEventListener('resize', updateScale);
		return () => viewport.removeEventListener('resize', updateScale);
	});

	$effect(() => {
		photo.id;
		loaded = false;
		// Cached images may finish before hydration attaches the load handler.
		if (img?.complete && img.naturalWidth > 0) loaded = true;
	});

	$effect(() => {
		const needsFull = preferFull || pageScale > 1.01;
		loader.load(
			photo.id,
			photoLoadPlan(
				photo,
				displayWidth,
				(devicePixelRatio.current ?? 1) * pageScale,
				needsFull
			),
			needsFull
		);
	});
</script>

<svelte:window ononline={() => loader.retry()} />

<img
	bind:this={img}
	src={current?.url ?? `/img/${photo.id}/md`}
	width={photo.width}
	height={photo.height}
	fetchpriority="high"
	decoding="async"
	alt={photo.title}
	draggable="false"
	onload={() => (loaded = true)}
	class="h-full w-full select-none object-cover [-webkit-user-drag:none] transition-opacity duration-700 {loaded
		? 'opacity-100'
		: 'opacity-0'}"
/>
