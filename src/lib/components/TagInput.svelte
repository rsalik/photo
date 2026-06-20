<script lang="ts">
	import { fly } from 'svelte/transition';
	import { FAVORITE_TAG } from '$lib/types';
	import Icon, { type IconName } from './Icon.svelte';

	interface Props {
		values: string[];
		suggestions: string[];
		placeholder?: string;
		icon?: IconName;
		id?: string;
		/** open the suggestion list upward (for inputs in bottom-fixed bars) */
		direction?: 'down' | 'up';
	}
	let {
		values = $bindable(),
		suggestions,
		placeholder = 'Add…',
		icon = 'tag',
		id,
		direction = 'down'
	}: Props = $props();

	let query = $state('');
	let focused = $state(false);
	let highlighted = $state(0);
	let input = $state<HTMLInputElement>();

	const lower = (s: string) => s.trim().toLowerCase();

	const matches = $derived.by(() => {
		const q = lower(query);
		const taken = new Set(values.map(lower));
		const pool = suggestions.filter((s) => !taken.has(lower(s)));
		return (q ? pool.filter((s) => lower(s).includes(q)) : pool).slice(0, 8);
	});

	const canCreate = $derived(
		query.trim().length > 0 &&
			!values.some((v) => lower(v) === lower(query)) &&
			!matches.some((m) => lower(m) === lower(query))
	);

	const open = $derived(focused && (matches.length > 0 || canCreate));

	function add(value: string) {
		const v = value.trim();
		if (v && !values.some((x) => lower(x) === lower(v))) values = [...values, v];
		query = '';
		highlighted = 0;
		input?.focus();
	}

	function remove(value: string) {
		values = values.filter((v) => v !== value);
	}

	function onKeydown(e: KeyboardEvent) {
		const items = [...matches, ...(canCreate ? [query.trim()] : [])];
		if (e.key === 'Enter' || e.key === ',') {
			e.preventDefault();
			if (items.length) add(items[Math.min(highlighted, items.length - 1)]);
			else if (query.trim()) add(query);
		} else if (e.key === 'Backspace' && !query && values.length) {
			values = values.slice(0, -1);
		} else if (e.key === 'ArrowDown') {
			e.preventDefault();
			highlighted = Math.min(highlighted + 1, items.length - 1);
		} else if (e.key === 'ArrowUp') {
			e.preventDefault();
			highlighted = Math.max(highlighted - 1, 0);
		} else if (e.key === 'Escape') {
			e.stopPropagation();
			input?.blur();
		}
	}
</script>

<div class="relative">
	<div
		class="flex min-h-9 flex-wrap items-center gap-1.5 border-b py-1 transition-colors {focused
			? 'border-accent'
			: 'border-hairline'}"
	>
		{#each values as value (value)}
			{@const fav = icon === 'tag' && value.toLowerCase() === FAVORITE_TAG}
			<span
				transition:fly={{ y: 3, duration: 140 }}
				class="type-label inline-flex items-center gap-1.5 border py-1 pr-1.5 pl-2 {fav
					? 'border-amber-300 text-amber-600'
					: 'border-hairline text-ink'}"
			>
				<Icon name={fav ? 'star' : icon} size={11} class={fav ? 'text-amber-500' : 'text-ink-soft'} />{value}
				<button
					type="button"
					class="cursor-pointer text-ink-soft transition-colors hover:text-red-800"
					onclick={() => remove(value)}
					aria-label="Remove {value}"
				>
					<Icon name="x" size={11} />
				</button>
			</span>
		{/each}
		<input
			{id}
			bind:this={input}
			bind:value={query}
			onfocus={() => (focused = true)}
			onblur={() => setTimeout(() => (focused = false), 120)}
			onkeydown={onKeydown}
			oninput={() => (highlighted = 0)}
			placeholder={values.length ? '' : placeholder}
			class="min-w-24 flex-1 bg-transparent py-0.5 text-sm outline-none"
			autocomplete="off"
		/>
	</div>

	{#if open}
		<div
			transition:fly={{ y: direction === 'up' ? -4 : 4, duration: 140 }}
			class="pop absolute right-0 left-0 z-40 max-h-56 overflow-y-auto py-1 {direction === 'up'
				? 'bottom-full mb-1'
				: 'top-full mt-1'}"
		>
			{#each matches as match, mi (match)}
				<button
					type="button"
					class="flex w-full cursor-pointer items-center gap-2 px-3 py-1.5 text-left text-sm transition-colors {mi ===
					highlighted
						? 'bg-hairline/50'
						: 'hover:bg-hairline/30'}"
					onmousedown={(e) => {
						e.preventDefault();
						add(match);
					}}
					onmouseenter={() => (highlighted = mi)}
				>
					<Icon name={icon} size={12} class="text-ink-soft" />{match}
				</button>
			{/each}
			{#if canCreate}
				<button
					type="button"
					class="flex w-full cursor-pointer items-center gap-2 px-3 py-1.5 text-left text-sm text-accent transition-colors {highlighted ===
					matches.length
						? 'bg-hairline/50'
						: 'hover:bg-hairline/30'}"
					onmousedown={(e) => {
						e.preventDefault();
						add(query);
					}}
					onmouseenter={() => (highlighted = matches.length)}
				>
					<Icon name="plus" size={12} />Create “{query.trim()}”
				</button>
			{/if}
		</div>
	{/if}
</div>
