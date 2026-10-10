<script lang="ts">
	import { page } from '$app/state';
	import type { Snippet } from 'svelte';

	let { children }: { children: Snippet } = $props();

	const links = [
		['/admin', 'Library'],
		['/admin/upload', 'Upload'],
		['/admin/albums', 'Albums'],
		['/admin/analytics', 'Analytics'],
		['/admin/settings', 'Settings']
	] as const;
</script>

{#if page.url.pathname === '/admin/login'}
	{@render children()}
{:else}
	<div class="flex min-h-dvh flex-col">
		<nav
			class="sticky top-0 z-30 flex flex-col border-b border-hairline bg-paper/95 backdrop-blur sm:h-14 sm:flex-row sm:items-center sm:justify-between sm:px-6"
		>
			<div class="flex h-12 w-full items-center justify-between px-4 sm:h-auto sm:w-auto sm:justify-start sm:px-0">
				<a href="/admin" class="type-display text-base">Admin</a>
				<a href="/" class="type-label text-ink-soft transition-colors hover:text-accent sm:ml-3"
					>View site ↗</a
				>
			</div>
			<div class="w-full overflow-x-auto border-t border-hairline sm:w-auto sm:overflow-visible sm:border-0">
				<div class="flex min-w-max items-center gap-5 px-4 py-2.5 sm:gap-6 sm:p-0">
					{#each links as [href, label] (href)}
						<a
							{href}
							class="type-label relative transition-colors {page.url.pathname === href
								? 'text-accent after:absolute after:inset-x-0 after:-bottom-[11px] after:h-[2px] after:bg-accent sm:after:-bottom-[19px]'
								: 'text-ink-soft hover:text-ink'}">{label}</a
						>
					{/each}
					<form method="POST" action="/admin/logout">
						<button class="type-label cursor-pointer text-ink-soft transition-colors hover:text-ink"
							>Log out</button
						>
					</form>
				</div>
			</div>
		</nav>
		<div class="flex-1">
			{@render children()}
		</div>
	</div>
{/if}
