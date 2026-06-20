<script lang="ts">
	// Spotify-style title ticker: if the text overflows its box, it gently scrolls
	// to reveal the end and back, pausing at the left edge. Otherwise it sits still.
	interface Props {
		text: string;
		class?: string;
	}
	let { text, class: cls = '' }: Props = $props();

	let outer = $state<HTMLElement>();
	let inner = $state<HTMLElement>();
	let shift = $state(0); // px of overflow (0 = fits, no animation)

	function measure() {
		if (!outer || !inner) return;
		const over = inner.scrollWidth - outer.clientWidth;
		shift = over > 0 ? over : 0;
	}

	$effect(() => {
		text; // remeasure when the title changes
		measure();
	});

	$effect(() => {
		if (!outer) return;
		const ro = new ResizeObserver(measure);
		ro.observe(outer);
		return () => ro.disconnect();
	});
</script>

<span
	bind:this={outer}
	class="ticker {cls}"
	class:ticker-on={shift > 0}
	style="--ticker-shift: {shift}px; --ticker-dur: {Math.max(7, shift / 35 + 5)}s"
>
	<span bind:this={inner} class="ticker-inner">{text}</span>
</span>
