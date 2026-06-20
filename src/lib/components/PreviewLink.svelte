<script lang="ts">
	import type { Snippet } from 'svelte';
	import { fetchFilterPreview, type FilterPreview } from '$lib/preview';
	import PreviewPopover from './PreviewPopover.svelte';
	import type { IconName } from './Icon.svelte';

	interface Props {
		href: string;
		/** query string for /api/filter-preview, e.g. "album=Italy%202025" */
		previewParams: string;
		tip?: string;
		/** header shown on the preview card (defaults to the filter value) */
		label?: string;
		icon?: IconName;
		class?: string;
		children: Snippet;
	}
	let { href, previewParams, tip, label, icon, class: className = '', children }: Props = $props();

	const cardLabel = $derived(
		label ?? decodeURIComponent(previewParams.split('=')[1] ?? '').trim()
	);

	let preview = $state<FilterPreview | null>(null);
	let pos = $state({ x: 0, y: 0 });
	let timer: ReturnType<typeof setTimeout> | undefined;

	function enter(e: MouseEvent) {
		const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
		pos = { x: rect.left + rect.width / 2, y: rect.top };
		timer = setTimeout(async () => {
			try {
				const data = await fetchFilterPreview(previewParams);
				if (timer) preview = data;
			} catch {
				/* preview is decorative */
			}
		}, 250);
	}

	function leave() {
		clearTimeout(timer);
		timer = undefined;
		preview = null;
	}
</script>

<a
	{href}
	data-tip={preview ? undefined : tip}
	class={className}
	onmouseenter={enter}
	onmouseleave={leave}
	onclick={leave}
>
	{@render children()}
</a>

<PreviewPopover {preview} x={pos.x} y={pos.y} anchor="above" label={cardLabel} {icon} cacheKey={previewParams} />
