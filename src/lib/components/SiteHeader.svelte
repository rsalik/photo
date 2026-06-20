<script lang="ts">
	interface Props {
		siteTitle: string;
		isAdmin?: boolean;
	}
	let { siteTitle, isAdmin = false }: Props = $props();
</script>

<header class="relative px-6 pt-10 pb-7 text-center sm:pt-14">
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
