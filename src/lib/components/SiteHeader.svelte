<script lang="ts">
	interface Props {
		siteTitle: string;
		isAdmin?: boolean;
	}
	let { siteTitle, isAdmin = false }: Props = $props();
</script>

<header class="sticky top-0 z-40 bg-paper px-6 pt-8 pb-6 text-center sm:relative sm:pt-14 sm:pb-7">
	<a href="/" class="inline-block">
		<h1 class="type-display text-3xl sm:text-4xl">{siteTitle}</h1>
	</a>
	{#if isAdmin}
		<a
			href="/admin"
			class="type-label absolute top-4 right-4 text-ink-soft transition-colors hover:text-accent sm:top-5 sm:right-6"
			>Admin</a
		>
	{/if}
</header>
