<script lang="ts">
	let {
		location,
		takenAt,
		size = 104,
		class: className = ''
	}: {
		location: string;
		takenAt: string | null;
		size?: number;
		class?: string;
	} = $props();

	const id = $props.id();
	const arcId = `${id}-arc`;
	const label = $derived(location.slice(0, 26).toUpperCase());
	// Reserve space at both ends of the arc. Natural monospace glyphs avoid
	// Safari's inconsistent textLength adjustment on curved text.
	const labelSize = $derived(Math.min(8.5, 96 / (Math.max(1, label.length) * 0.65)));
	const date = $derived(takenAt ? new Date(takenAt) : null);
	const day = $derived(
		date
			?.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' })
			.toUpperCase() ?? 'POST'
	);
</script>

<svg
	viewBox="0 0 120 120"
	width={size}
	height={size}
	class="postmark shrink-0 text-ink-soft/70 {className}"
	style="--kd: 1.05s; width: {size}px; height: {size}px"
	aria-hidden="true"
>
	<circle cx="60" cy="60" r="52" fill="none" stroke="currentColor" stroke-width="1.4" />
	<!-- The cancellation ring leaves a gap for the curved location label. -->
	<path
		d="M 101.54 48.87 A 43 43 0 1 1 18.46 48.87"
		fill="none"
		stroke="currentColor"
		stroke-width="0.8"
		stroke-linecap="round"
		stroke-dasharray="2.5 4.5"
	/>
	<defs>
		<path id={arcId} d="M 18.46 48.87 A 43 43 0 0 1 101.54 48.87" fill="none" />
	</defs>
	<text font-size={labelSize} text-anchor="middle" fill="currentColor">
		<textPath href="#{arcId}" startOffset="50%">{label}</textPath>
	</text>
	<text x="60" y="58" text-anchor="middle" font-size="11" fill="currentColor">{day}</text>
	<text x="60" y="72" text-anchor="middle" font-size="11" fill="currentColor"
		>{date?.getUTCFullYear() ?? 'CARD'}</text
	>
</svg>

<style>
	svg {
		font-family: var(--font-mono);
		/* Keep this decorative mark's lettering proportional on mobile. */
		-webkit-text-size-adjust: none;
		text-size-adjust: none;
	}
</style>
