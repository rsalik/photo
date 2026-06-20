<script lang="ts">
	import { page } from '$app/state';
	import type { Snippet } from 'svelte';

	let { children }: { children: Snippet } = $props();

	const links = [
		['/admin', 'Library'],
		['/admin/upload', 'Upload'],
		['/admin/albums', 'Albums'],
		['/admin/settings', 'Settings']
	] as const;
</script>

{#if page.url.pathname === '/admin/login'}
	{@render children()}
{:else}
	<div class="flex min-h-dvh flex-col">
		<nav
			class="sticky top-0 z-30 flex h-14 items-center justify-between border-b border-hairline bg-paper/95 px-4 backdrop-blur sm:px-6"
		>
			<div class="flex items-baseline gap-3">
				<a href="/admin" class="type-display text-base">Admin</a>
				<a href="/" class="type-label hidden text-ink-soft transition-colors hover:text-accent sm:inline"
					>View site ↗</a
				>
			</div>
			<div class="flex items-center gap-4 sm:gap-6">
				{#each links as [href, label] (href)}
					<a
						{href}
						class="type-label transition-colors {page.url.pathname === href
							? 'text-accent'
							: 'text-ink-soft hover:text-ink'}">{label}</a
					>
				{/each}
				<form method="POST" action="/admin/logout">
					<button class="type-label cursor-pointer text-ink-soft transition-colors hover:text-ink"
						>Log out</button
					>
				</form>
			</div>
		</nav>
		<div class="flex-1">
			{@render children()}
		</div>
	</div>
{/if}
