<script lang="ts">
	import '../app.css';
	import { page } from '$app/state';
	import { onNavigate } from '$app/navigation';
	import SitePalette from '$lib/components/SitePalette.svelte';
	import { palette } from '$lib/palette-state.svelte';
	import type { LayoutServerData } from './$types';
	import type { Snippet } from 'svelte';

	let { data, children }: { data: LayoutServerData; children: Snippet } = $props();

	// the admin portal has its own command palette
	const isAdminRoute = $derived(page.url.pathname.startsWith('/admin'));

	// The gallery lets the root's vertical grid lines show through top-to-bottom;
	// every other page keeps an opaque paper wrapper so the lines stay off them.
	const isHome = $derived(page.url.pathname === '/');

	// preload the faces above-the-fold text renders in (display + body + the
	// film markings' mono) so first paint doesn't flash fallbacks
	const preloadFonts = $derived(
		data.settings.fontTheme === 'editorial'
			? [
					'/fonts/NibPro-Regular.woff2',
					'/fonts/NibPro-Light.woff2',
					'/fonts/OperatorMono-Book.woff2'
				]
			: [
					'/fonts/NibPro-Regular.woff2',
					'/fonts/Alliance-PlattRegular.woff2',
					'/fonts/OperatorMono-Book.woff2'
				]
	);

	// coherent cross-page transitions (gallery ↔ photo, view ↔ view) via the
	// View Transitions API where supported — a smooth crossfade, progressive.
	onNavigate((navigation) => {
		if (
			!document.startViewTransition ||
			window.matchMedia('(prefers-reduced-motion: reduce)').matches
		)
			return;
		return new Promise((resolve) => {
			document.startViewTransition(async () => {
				resolve();
				await navigation.complete;
			});
		});
	});

	// Global tooltip edge clamping: ensures no tooltip bleeds off the side of the window
	$effect(() => {
		const onMouseOver = (e: MouseEvent) => {
			const target = e.target as HTMLElement;
			const tipAnchor = target.closest('[data-tip], .has-tip') as HTMLElement;
			if (!tipAnchor || tipAnchor.dataset.tipMeasured) return;

			let tipW = 0;
			const contentNode = tipAnchor.querySelector('.tip-content') as HTMLElement;
			if (contentNode) {
				tipW = contentNode.offsetWidth;
			} else {
				const style = window.getComputedStyle(tipAnchor, '::after');
				tipW = parseFloat(style.width) || 0;
				if (!tipW) {
					const text = tipAnchor.getAttribute('data-tip') || '';
					tipW = text.length * 7 + 20;
				}
			}

			const rect = tipAnchor.getBoundingClientRect();
			const cx = rect.left + rect.width / 2;
			const vw = window.innerWidth;

			const leftEdge = cx - tipW / 2;
			const rightEdge = cx + tipW / 2;

			let offset = 0;
			const PADDING = 12;
			if (leftEdge < PADDING) {
				offset = PADDING - leftEdge;
			} else if (rightEdge > vw - PADDING) {
				offset = vw - PADDING - rightEdge;
			}

			tipAnchor.style.setProperty('--tip-offset', `${offset}px`);
			tipAnchor.dataset.tipMeasured = '1';
		};

		const onMouseOut = (e: MouseEvent) => {
			const target = e.target as HTMLElement;
			const tipAnchor = target.closest('[data-tip], .has-tip') as HTMLElement;
			if (tipAnchor) delete tipAnchor.dataset.tipMeasured;
		};

		document.addEventListener('mouseover', onMouseOver, { passive: true });
		document.addEventListener('mouseout', onMouseOut, { passive: true });
		return () => {
			document.removeEventListener('mouseover', onMouseOver);
			document.removeEventListener('mouseout', onMouseOut);
		};
	});
</script>

<svelte:head>
	{#each preloadFonts as href (href)}
		<link rel="preload" as="font" type="font/woff2" {href} crossorigin="anonymous" />
	{/each}
</svelte:head>

<div
	class="app-surface min-h-dvh text-ink {isHome ? 'overscroll-grid' : 'bg-paper'}"
	style="--accent: {data.settings.accentColor}"
	data-font-theme={data.settings.fontTheme}
>
	{#if !isAdminRoute}
		<SitePalette />
	{/if}
	<div class="contents" inert={!isAdminRoute && palette.open}>
		{@render children()}
	</div>
</div>

<!-- faint film grain over everything, for analog warmth -->
<div class="paper-grain" aria-hidden="true"></div>
