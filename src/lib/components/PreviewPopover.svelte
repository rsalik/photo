<script lang="ts">
	import { scale } from 'svelte/transition';
	import type { FilterPreview } from '$lib/preview';
	import Icon, { type IconName } from './Icon.svelte';

	interface Props {
		preview: FilterPreview | null;
		x: number; // viewport coords (fixed positioning)
		y: number;
		anchor?: 'above' | 'right' | 'left';
		label?: string;
		icon?: IconName;
		/** identity of the content; changing it crossfades old → new instead of
		    mutating the card mid-fade */
		cacheKey?: string;
	}
	let { preview, x, y, anchor = 'above', label, icon, cacheKey = '' }: Props = $props();

	const CARD_W = 246; // 3 × 82px squares — constant size regardless of content
	const CARD_H = (CARD_W * 2) / 3; // 3 cols × 2 rows of squares

	// Keep the card fully on-screen: clamp both axes, and for side anchors flip to
	// the other side when the preferred side has no room (right-aligned rail puts
	// the dropdown near the right edge, so previews want to sit to its left).
	const pos = $derived.by(() => {
		const vw = typeof window !== 'undefined' ? window.innerWidth : 1280;
		const vh = typeof window !== 'undefined' ? window.innerHeight : 800;
		const pad = 8;
		const clamp = (v: number, max: number) => Math.max(pad, Math.min(v, max - pad));
		if (anchor === 'above') {
			return {
				left: clamp(x - CARD_W / 2, vw - CARD_W),
				top: y,
				transform: 'translateY(calc(-100% - 10px))',
				origin: 'bottom center'
			};
		}
		const top = clamp(y, vh - CARD_H);
		if (anchor === 'left') {
			let left = x - 12 - CARD_W;
			if (left < pad) left = x + 12; // flip right when the left has no room
			return { left: clamp(left, vw - CARD_W), top, transform: 'none', origin: 'right center' };
		}
		let left = x + 12;
		if (left + CARD_W > vw - pad) left = x - 12 - CARD_W; // flip left when the right has no room
		return { left: clamp(left, vw - CARD_W), top, transform: 'none', origin: 'left center' };
	});
</script>

{#if preview}
	{#key cacheKey}
		<div
			class="pop pointer-events-none fixed z-[60] overflow-hidden"
			style="width: {CARD_W}px; left: {pos.left}px; top: {pos.top}px; transform: {pos.transform}; transform-origin: {pos.origin}"
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
