<script lang="ts">
	interface Props {
		siteTitle: string;
		isAdmin?: boolean;
	}
	let { siteTitle, isAdmin = false }: Props = $props();
</script>

<!-- Compact wordmark row. It carries the same paper + grid-line background as the
     page, so the vertical rules run straight through it to the top edge even
     though it's opaque (it stays put over the scrolling gallery on phones). -->
<header class="masthead-header sticky top-0 z-40 flex items-baseline justify-between px-4 pt-5 pb-3 sm:relative sm:px-6 sm:pt-6 sm:pb-3">
	<a href="/" class="inline-block">
		<h1 class="type-display text-xl sm:text-2xl">{siteTitle}</h1>
	</a>
	{#if isAdmin}
		<a href="/admin" class="type-label text-ink-soft transition-colors hover:text-accent">Admin</a>
	{/if}
</header>
