<script lang="ts">
	import type { TopEdge } from '$lib/contactSheet';

	/** An edge-print text run placed at a px offset along a marking band —
	 *  brand words and lens specs bold, everything in its natural casing. */
	interface Props {
		te: TopEdge;
		x: number;
	}
	let { te, x }: Props = $props();
</script>

<span class="mark-edge" style="left: {x}px">
	{#each te.segments as s, i (i)}{#if s.bold}<b>{s.t}</b>{:else}{s.t}{/if}{/each}
</span>
