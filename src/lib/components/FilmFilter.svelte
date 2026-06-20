<script lang="ts">
	import { fly } from 'svelte/transition';
	import Icon from './Icon.svelte';

	// One combined "Analog" filter: a boolean analog-only toggle at the top of the
	// dropdown, with the specific film stocks listed below. Turning analog off
	// clears any specific stock; picking a stock turns analog on.
	interface Props {
		analogOn: boolean;
		film: string; // '' = no specific stock
		stocks: string[];
		onToggle: () => void;
		onSelectStock: (value: string) => void;
	}
	let { analogOn, film, stocks, onToggle, onSelectStock }: Props = $props();

	let open = $state(false);
	let root = $state<HTMLElement>();

	const valueLabel = $derived(film || (analogOn ? 'Only' : 'All'));

	function close() {
		open = false;
	}
	function pickStock(stock: string) {
		onSelectStock(stock === film ? '' : stock);
		close();
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
		onclick={() => (open = !open)}
		class="group flex cursor-pointer items-center gap-2 border-b pb-1.5 transition-colors {analogOn
			? 'border-accent'
			: 'border-transparent hover:border-hairline'}"
		aria-expanded={open}
	>
		<Icon name="film" size={14} class={analogOn ? 'text-accent' : 'text-ink-soft'} />
		<span class="type-label text-ink-soft">Analog</span>
		<span class="type-label max-w-44 truncate {analogOn ? 'text-accent' : 'text-ink'}">{valueLabel}</span>
		<Icon name="chevron" size={12} class="text-ink-soft transition-transform duration-200 {open ? 'rotate-180' : ''}" />
	</button>

	{#if open}
		<div
			transition:fly={{ y: 6, duration: 180 }}
			class="pop absolute top-full left-0 z-40 mt-2 max-h-80 w-60 overflow-y-auto py-1.5"
			role="listbox"
			tabindex="-1"
		>
			<!-- the analog-only toggle: header of the dropdown -->
			<button
				type="button"
				role="switch"
				aria-checked={analogOn}
				onclick={onToggle}
				class="flex w-full cursor-pointer items-center justify-between gap-3 px-3.5 py-2.5 text-left text-sm transition-colors hover:bg-hairline/40"
			>
				<span class="flex items-center gap-2">
					<Icon name="film" size={14} class={analogOn ? 'text-accent' : 'text-ink-soft'} />
					Analog only
				</span>
				<span
					class="relative h-[18px] w-8 shrink-0 rounded-full border transition-colors {analogOn
						? 'border-accent bg-accent/20'
						: 'border-hairline'}"
				>
					<span
						class="absolute top-1/2 h-3 w-3 -translate-y-1/2 rounded-full transition-all duration-200 {analogOn
							? 'left-[15px] bg-accent'
							: 'left-[2px] bg-ink-soft'}"
					></span>
				</span>
			</button>

			{#if stocks.length}
				<div class="my-1 border-t border-hairline"></div>
				<button
					type="button"
					class="flex w-full cursor-pointer items-center justify-between px-3.5 py-2 text-left text-sm transition-colors hover:bg-hairline/40"
					onclick={() => pickStock('')}
				>
					All stocks
					{#if analogOn && !film}<Icon name="check" size={13} class="text-accent" />{/if}
				</button>
				{#each stocks as stock (stock)}
					<button
						type="button"
						class="flex w-full cursor-pointer items-center justify-between gap-3 px-3.5 py-2 text-left text-sm transition-colors hover:bg-hairline/40 {stock ===
						film
							? 'text-accent'
							: ''}"
						onclick={() => pickStock(stock)}
					>
						<span class="truncate">{stock}</span>
						{#if stock === film}<Icon name="check" size={13} class="shrink-0 text-accent" />{/if}
					</button>
				{/each}
			{/if}
		</div>
	{/if}
</div>
