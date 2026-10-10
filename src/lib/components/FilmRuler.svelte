<script lang="ts">
	// A vertical ruler/measure with numbered major ticks, for the film views.
	interface Props {
		length: number; // px (the height to fill)
		color: string;
		width?: number;
	}
	let { length, color, width = 18 }: Props = $props();

	const STEP = 15; // px between ticks
	const ticks = $derived.by(() => {
		const out: { y: number; major: boolean; num: number | null }[] = [];
		const n = Math.floor((length || 0) / STEP);
		for (let i = 0; i <= n; i++) {
			const major = i % 5 === 0;
			out.push({ y: i * STEP, major, num: major ? i / 5 : null });
		}
		return out;
	});
</script>

{#if length > 0}
	<svg class="film-ruler" {width} height={length} viewBox="0 0 {width} {length}" style="color: {color}" aria-hidden="true">
		{#each ticks as t, i (i)}
			<line
				x1={width - (t.major ? 9 : 5)}
				x2={width - 1}
				y1={t.y}
				y2={t.y}
				stroke="currentColor"
				stroke-width="1"
				opacity={t.major ? 0.9 : 0.45}
			/>
			{#if t.num !== null && t.num > 0}
				<text x="1.5" y={t.y + 3} class="film-ruler-num" fill="currentColor">{t.num}</text>
			{/if}
		{/each}
	</svg>
{/if}
