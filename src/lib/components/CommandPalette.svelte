<script module lang="ts">
	import type { IconName } from './Icon.svelte';

	export interface PaletteAction {
		id: string;
		label: string;
		icon: IconName;
		/** second stage: pick or create a value of this kind */
		valueKind?: 'tag' | 'album' | 'location';
		/** remove-style actions only offer existing values, no creation */
		allowCreate?: boolean;
		needsSelection?: boolean;
		danger?: boolean;
		hint?: string;
	}
</script>

<script lang="ts">
	import { fade, fly } from 'svelte/transition';
	import Icon from './Icon.svelte';

	interface Props {
		actions: PaletteAction[];
		suggestions: Record<'tag' | 'album' | 'location', string[]>;
		selectedCount: number;
		onrun: (actionId: string, value?: string) => void;
	}
	let { actions, suggestions, selectedCount, onrun }: Props = $props();

	let open = $state(false);
	let stage = $state<PaletteAction | null>(null);
	let query = $state('');
	let highlighted = $state(0);
	let input = $state<HTMLInputElement>();
	let lastShift = 0;

	interface Item {
		label: string;
		icon: IconName;
		hint?: string;
		danger?: boolean;
		disabled?: boolean;
		run: () => void;
	}

	const lower = (s: string) => s.trim().toLowerCase();

	const items = $derived.by((): Item[] => {
		const q = lower(query);
		if (!stage) {
			return actions
				.filter((a) => !q || lower(a.label).includes(q))
				.map((a) => ({
					label: a.label,
					icon: a.icon,
					danger: a.danger,
					disabled: a.needsSelection && selectedCount === 0,
					hint: a.needsSelection && selectedCount === 0 ? 'select photos first' : a.hint,
					run: () => {
						if (a.needsSelection && selectedCount === 0) return;
						if (a.valueKind) {
							stage = a;
							query = '';
							highlighted = 0;
						} else {
							close();
							onrun(a.id);
						}
					}
				}));
		}
		const action = stage;
		const kind = action.valueKind!;
		const icon: IconName = kind === 'tag' ? 'tag' : kind === 'album' ? 'album' : 'location';
		const pool = suggestions[kind].filter((s) => !q || lower(s).includes(q));
		const out: Item[] = pool.slice(0, 9).map((s) => ({
			label: s,
			icon,
			run: () => {
				close();
				onrun(action.id, s);
			}
		}));
		if (action.allowCreate && query.trim() && !pool.some((s) => lower(s) === q)) {
			out.push({
				label: `New ${kind}: “${query.trim()}”`,
				icon: 'plus',
				run: () => {
					const value = query.trim();
					close();
					onrun(action.id, value);
				}
			});
		}
		return out;
	});

	export function show() {
		open = true;
		stage = null;
		query = '';
		highlighted = 0;
		setTimeout(() => input?.focus(), 10);
	}

	function close() {
		open = false;
		stage = null;
		query = '';
	}

	function onWindowKeydown(e: KeyboardEvent) {
		// double-Shift (VS Code style) or ⌘K opens the palette
		if (e.key === 'Shift' && !e.metaKey && !e.ctrlKey && !e.altKey) {
			const now = Date.now();
			if (now - lastShift < 350 && !open) {
				show();
				lastShift = 0;
				return;
			}
			lastShift = now;
		} else if (e.key !== 'Shift') {
			lastShift = 0;
		}
		if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
			e.preventDefault();
			if (open) close();
			else show();
		}
		if (!open) return;
		if (e.key === 'Escape') {
			e.preventDefault();
			e.stopPropagation();
			if (stage) {
				stage = null;
				query = '';
				highlighted = 0;
			} else {
				close();
			}
		}
	}

	function onInputKeydown(e: KeyboardEvent) {
		const enabled = items.filter((i) => !i.disabled);
		if (e.key === 'ArrowDown') {
			e.preventDefault();
			highlighted = Math.min(highlighted + 1, items.length - 1);
		} else if (e.key === 'ArrowUp') {
			e.preventDefault();
			highlighted = Math.max(highlighted - 1, 0);
		} else if (e.key === 'Enter') {
			e.preventDefault();
			(items[highlighted] ?? enabled[0])?.run();
		} else if (e.key === 'Backspace' && !query && stage) {
			stage = null;
			highlighted = 0;
		}
	}
</script>

<svelte:window onkeydown={onWindowKeydown} />

{#if open}
	<div
		class="fixed inset-0 z-50 bg-ink/25"
		transition:fade={{ duration: 120 }}
		onpointerdown={close}
		role="presentation"
	></div>
	<div
		class="pop fixed inset-x-0 top-[16vh] z-50 mx-auto w-[min(34rem,92vw)] overflow-hidden shadow-pop-lg"
		transition:fly={{ y: -10, duration: 160 }}
		role="dialog"
		aria-label="Command palette"
	>
		<div class="flex items-center gap-2.5 border-b border-hairline px-4 py-3">
			{#if stage}
				<button
					type="button"
					class="type-label flex cursor-pointer items-center gap-1 text-accent"
					onclick={() => ((stage = null), (query = ''), (highlighted = 0))}
				>
					<Icon name="arrow-left" size={12} />{stage.label.replace(/…$/, '')}
				</button>
			{:else}
				<Icon name="search" size={15} class="text-ink-soft" />
			{/if}
			<input
				bind:this={input}
				bind:value={query}
				oninput={() => (highlighted = 0)}
				onkeydown={onInputKeydown}
				placeholder={stage ? `Search or create…` : 'Type a command…'}
				class="w-full bg-transparent text-[0.9375rem] outline-none"
				autocomplete="off"
			/>
			<span class="type-label shrink-0 text-ink-soft">{selectedCount} selected</span>
		</div>
		<div class="max-h-[40vh] overflow-y-auto py-1.5">
			{#each items as item, ii (item.label)}
				<button
					type="button"
					class="flex w-full items-center gap-3 px-4 py-2.5 text-left text-sm transition-colors {item.disabled
						? 'cursor-default opacity-40'
						: 'cursor-pointer'} {ii === highlighted && !item.disabled
						? 'bg-hairline/50'
						: !item.disabled
							? 'hover:bg-hairline/30'
							: ''} {item.danger ? 'text-red-800' : ''}"
					onclick={item.run}
					onmouseenter={() => (highlighted = ii)}
				>
					<Icon name={item.icon} size={14} class={item.danger ? 'text-red-800' : 'text-ink-soft'} />
					<span class="truncate">{item.label}</span>
					{#if item.hint}<span class="type-label ml-auto shrink-0 text-[0.625rem] text-ink-soft">{item.hint}</span>{/if}
				</button>
			{:else}
				<p class="px-4 py-3 text-sm text-ink-soft">Nothing matches</p>
			{/each}
		</div>
		<p class="type-label flex flex-wrap items-center gap-x-2 gap-y-1.5 border-t border-hairline px-4 py-2.5 text-[0.625rem] text-ink-soft">
			<span class="flex items-center gap-1"><kbd class="key key-sm">↑↓</kbd> navigate</span>
			<span class="opacity-40">·</span>
			<span class="flex items-center gap-1"><kbd class="key key-sm">↵</kbd> run</span>
			<span class="opacity-40">·</span>
			<span class="flex items-center gap-1"><kbd class="key key-sm">esc</kbd> {stage ? 'back' : 'close'}</span>
			<span class="opacity-40">·</span>
			<span class="flex items-center gap-1"><kbd class="key key-sm">shift</kbd> <kbd class="key key-sm">shift</kbd> or <kbd class="key key-sm">⌘K</kbd> to open</span>
		</p>
	</div>
{/if}
