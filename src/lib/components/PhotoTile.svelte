<script lang="ts">
	import { IMAGE_SIZES, type Photo } from '$lib/types';

	interface Props {
		photo: Photo;
		/** rendered width in px (used for `sizes` so the browser picks well) */
		displayWidth?: number;
		eager?: boolean;
		/** reveal the title along the bottom edge on hover (needs a `.group` ancestor) */
		showTitle?: boolean;
	}
	let { photo, displayWidth, eager = false, showTitle = false }: Props = $props();

	let loaded = $state(false);
	let img = $state<HTMLImageElement>();

	// onload never fires for images already in cache at hydration time
	$effect(() => {
		if (img?.complete) loaded = true;
	});

	const srcset = $derived(
		Object.entries(IMAGE_SIZES)
			.map(([name, edge]) => {
				const scale = Math.min(1, edge / Math.max(photo.width, photo.height));
				return `/img/${photo.id}/${name} ${Math.round(photo.width * scale)}w`;
			})
			.join(', ')
	);
</script>

<div
	class="relative h-full w-full overflow-hidden bg-cover bg-center"
	style="background-image: url('{photo.blurData}')"
>
	<img
		bind:this={img}
		src="/img/{photo.id}/md"
		{srcset}
		sizes={displayWidth ? `${Math.round(displayWidth)}px` : '(max-width: 640px) 100vw, 33vw'}
		alt={photo.title}
		width={photo.width}
		height={photo.height}
		loading={eager ? 'eager' : 'lazy'}
		decoding="async"
		onload={() => (loaded = true)}
		class="absolute inset-0 h-full w-full object-cover transition-opacity duration-700 ease-out {loaded
			? 'opacity-100'
			: 'opacity-0'}"
	/>
	{#if showTitle}
		<div
			class="pointer-events-none absolute inset-x-0 bottom-0 translate-y-1.5 bg-gradient-to-t from-black/60 via-black/25 to-transparent px-3 pt-9 pb-2.5 opacity-0 transition-all duration-300 ease-out group-hover:translate-y-0 group-hover:opacity-100 group-focus-visible:translate-y-0 group-focus-visible:opacity-100"
		>
			<span class="type-display block truncate text-sm text-white">{photo.title}</span>
		</div>
	{/if}
</div>
