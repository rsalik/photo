<script lang="ts">
	import { scale } from 'svelte/transition';
	import type { FilterPreview } from '$lib/preview';
	import Icon, { type IconName } from './Icon.svelte';

	interface Props {
		preview: FilterPreview | null;
		x: number; // viewport coords (fixed positioning)
		y: number;
		anchor?: 'above' | 'right';
		label?: string;
		icon?: IconName;
		/** identity of the content; changing it crossfades old → new instead of
		    mutating the card mid-fade */
		cacheKey?: string;
	}
	let { preview, x, y, anchor = 'above', label, icon, cacheKey = '' }: Props = $props();

	const CARD_W = 246; // 3 × 82px squares — constant size regardless of content

	const clampedY = $derived.by(() => {
		if (anchor === 'above') return y;
		const vh = typeof window !== 'undefined' ? window.innerHeight : 800;
		return Math.max(8, Math.min(y, vh - CARD_W * (2 / 3) - 16));
	});
</script>

{#if preview}
	{#key cacheKey}
		<div
			class="pop pointer-events-none fixed z-50 overflow-hidden"
			style="width: {CARD_W}px; {anchor === 'above'
				? `left: ${x}px; top: ${y}px; transform-origin: bottom center; translate: -50% calc(-100% - 10px)`
				: `left: ${x + 12}px; top: ${clampedY}px; transform-origin: left center`}"
			transition:scale={{ duration: 170, start: 0.9 }}
		>
			<div class="relative grid grid-cols-3 gap-px bg-hairline">
				{#each Array(6) as _, i (i)}
					{@const p = preview.photos[i]}
					<div class="aspect-square overflow-hidden bg-paper">
						{#if p}
							<div class="h-full w-full bg-cover bg-center" style="background-image: url('{p.blurData}')">
								<img src="/img/{p.id}/sm" alt="" class="h-full w-full object-cover" loading="lazy" />
							</div>
						{/if}
					</div>
				{/each}

				{#if label}
					<div
						class="type-label absolute top-2 left-2 flex max-w-[calc(100%-1rem)] items-center gap-1.5 truncate rounded-pop border border-hairline bg-paper/90 px-2 py-1 text-[0.625rem] backdrop-blur-sm"
					>
						{#if icon}<Icon name={icon} size={11} class="shrink-0 text-ink-soft" />{/if}
						{label}
					</div>
				{/if}
				<div
					class="type-label absolute bottom-2 left-2 rounded-pop border border-hairline bg-paper/90 px-2 py-1 text-[0.625rem] backdrop-blur-sm"
				>
					{preview.count}
					{preview.count === 1 ? 'photo' : 'photos'}
				</div>
			</div>
		</div>
	{/key}
{/if}
