<script lang="ts">
	import { fly } from 'svelte/transition';
	import Icon, { type IconName } from './Icon.svelte';
	import PreviewPopover from './PreviewPopover.svelte';
	import { fetchFilterPreview, type FilterPreview } from '$lib/preview';

	interface Props {
		label: string;
		icon: IconName;
		value: string; // '' = all
		options: string[];
		filterKey: string;
		onselect: (value: string) => void;
		/** override the hover-preview query for an option (e.g. a special entry) */
		previewParamFor?: (option: string) => string;
	}
	let { label, icon, value, options, filterKey, onselect, previewParamFor }: Props = $props();
	const previewParam = (o: string) => previewParamFor?.(o) ?? `${filterKey}=${encodeURIComponent(o)}`;

	let open = $state(false);
	let root = $state<HTMLElement>();
	let panel = $state<HTMLElement>();
	let preview = $state<FilterPreview | null>(null);
	let previewFor = $state('');
	let previewPos = $state({ x: 0, y: 0 });
	let hoverTimer: ReturnType<typeof setTimeout> | undefined;
	let query = $state('');

	const filtered = $derived(
		query.trim() ? options.filter((o) => o.toLowerCase().includes(query.trim().toLowerCase())) : options
	);

	function close() {
		open = false;
		previewFor = '';
		preview = null;
		query = '';
		clearTimeout(hoverTimer);
	}

	function toggle() {
		if (open) close();
		else open = true;
	}

	function pick(option: string) {
		onselect(option === value ? '' : option);
		close();
	}

	function hoverOption(option: string, e: Event) {
		clearTimeout(hoverTimer);
		const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
		const panelRect = panel?.getBoundingClientRect();
		hoverTimer = setTimeout(async () => {
			previewFor = option;
			previewPos = { x: panelRect ? panelRect.right : rect.right, y: rect.top - 8 };
			try {
				const data = await fetchFilterPreview(previewParam(option));
				if (previewFor === option) preview = data;
			} catch {
				/* decorative */
			}
		}, 220);
	}

	function unhover() {
		clearTimeout(hoverTimer);
		previewFor = '';
		preview = null;
	}

	function onWindowPointerdown(e: PointerEvent) {
		if (open && root && !root.contains(e.target as Node)) close();
	}

	function onWindowKeydown(e: KeyboardEvent) {
		if (open && e.key === 'Escape') {
			e.stopPropagation();
			close();
		}
	}
</script>

<svelte:window onpointerdown={onWindowPointerdown} onkeydowncapture={onWindowKeydown} />

<div class="relative" bind:this={root}>
	<button
		type="button"
		onclick={toggle}
		class="group flex cursor-pointer items-center gap-2 border-b pb-1.5 transition-colors {value
			? 'border-accent'
			: 'border-transparent hover:border-hairline'}"
		aria-expanded={open}
	>
		<Icon name={icon} size={14} class={value ? 'text-accent' : 'text-ink-soft'} />
		<span class="type-label text-ink-soft">{label}</span>
		<span class="type-label max-w-44 truncate {value ? 'text-accent' : 'text-ink'}">
			{value || 'All'}
		</span>
		<Icon
			name="chevron"
			size={12}
			class="text-ink-soft transition-transform duration-200 {open ? 'rotate-180' : ''}"
		/>
	</button>

	{#if open}
		<div
			bind:this={panel}
			transition:fly={{ y: 6, duration: 180 }}
			class="pop absolute top-full left-0 z-40 mt-2 max-h-80 w-60 overflow-y-auto py-1.5"
			onmouseleave={unhover}
			role="listbox"
			tabindex="-1"
		>
			{#if options.length > 7}
				<div class="flex items-center gap-2 border-b border-hairline px-3.5 pt-1 pb-2.5">
					<Icon name="search" size={13} class="text-ink-soft" />
					<!-- svelte-ignore a11y_autofocus -->
					<input
						bind:value={query}
						autofocus
						placeholder="Filter {label.toLowerCase()}s…"
						class="w-full bg-transparent text-sm outline-none"
					/>
				</div>
			{/if}
			<button
				type="button"
				class="flex w-full cursor-pointer items-center justify-between px-3.5 py-2 text-left text-sm transition-colors hover:bg-hairline/40"
				onclick={() => pick('')}
				onmouseenter={unhover}
			>
				All {label.toLowerCase()}s
				{#if !value}<Icon name="check" size={13} class="text-accent" />{/if}
			</button>
			{#each filtered as option (option)}
				<button
					type="button"
					class="flex w-full cursor-pointer items-center justify-between gap-3 px-3.5 py-2 text-left text-sm transition-colors hover:bg-hairline/40 {option ===
					value
						? 'text-accent'
						: ''}"
					onclick={() => pick(option)}
					onmouseenter={(e) => hoverOption(option, e)}
				>
					<span class="truncate">{option}</span>
					{#if option === value}<Icon name="check" size={13} class="shrink-0 text-accent" />{/if}
				</button>
			{:else}
				<p class="px-3.5 py-2 text-sm text-ink-soft">No matches</p>
			{/each}
		</div>
	{/if}
</div>

<PreviewPopover {preview} x={previewPos.x} y={previewPos.y} anchor="right" label={previewFor} {icon} cacheKey={previewFor} />
