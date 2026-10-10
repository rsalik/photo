<script lang="ts">
	import type { DxRect } from '$lib/contactSheet';

	/**
	 * One frame's slice of the roll-wide DX barcode, placed in the bottom
	 * marking band. The viewBox extends `gap` px past the frame so bars that
	 * bleed into the inter-frame margin render in the seam, keeping a code
	 * that crosses the frame border continuous instead of sliced.
	 */
	interface Props {
		/** left edge of the frame within the band, px (strip coordinates) */
		x: number;
		/** frame width, px */
		w: number;
		/** inter-frame margin the bars may bleed into, px */
		gap: number;
		rects: DxRect[];
	}
	let { x, w, gap, rects }: Props = $props();
</script>

<svg
	class="mark-barcode"
	style="left: {x}px"
	width={w + gap}
	height="9"
	viewBox="0 0 {w + gap} 9"
	preserveAspectRatio="none"
	aria-hidden="true"
>
	{#each rects as r, i (i)}
		<rect x={r.offsetAlong} y={r.offsetAcross} width={r.widthAlong} height={r.heightAcross} fill="currentColor" />
	{/each}
</svg>
