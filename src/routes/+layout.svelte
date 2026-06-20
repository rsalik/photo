<script lang="ts">
	import '../app.css';
	import { page } from '$app/state';
	import { onNavigate } from '$app/navigation';
	import SitePalette from '$lib/components/SitePalette.svelte';
	import type { LayoutServerData } from './$types';
	import type { Snippet } from 'svelte';

	let { data, children }: { data: LayoutServerData; children: Snippet } = $props();

	// the admin portal has its own command palette
	const isAdminRoute = $derived(page.url.pathname.startsWith('/admin'));

	// coherent cross-page transitions (gallery ↔ photo, view ↔ view) via the
	// View Transitions API where supported — a smooth crossfade, progressive.
	onNavigate((navigation) => {
		if (!document.startViewTransition) return;
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
				offset = (vw - PADDING) - rightEdge;
			}

			if (offset !== 0) {
				tipAnchor.style.setProperty('--tip-offset', `${offset}px`);
			}
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

<div
	class="min-h-dvh bg-paper text-ink"
	style="--accent: {data.settings.accentColor}"
	data-font-theme={data.settings.fontTheme}
>
	{#if !isAdminRoute}
		<SitePalette />
	{/if}
	{@render children()}
</div>

<!-- faint film grain over everything, for analog warmth -->
<div class="paper-grain" aria-hidden="true"></div>
