<script module lang="ts">
	export type GalleryView = 'film' | 'grid' | 'list';
</script>

<script lang="ts">
	import Icon from './Icon.svelte';

	/** Segmented control switching the gallery between its three presentations. */
	let { view = $bindable() }: { view: GalleryView } = $props();

	const OPTIONS = [
		['film', 'film', 'Contact sheet'],
		['grid', 'grid', 'Grid'],
		['list', 'list', 'List']
	] as const;
</script>

<div class="inline-flex items-center gap-0.5 rounded-pop border border-hairline bg-paper p-0.5">
	{#each OPTIONS as [key, icon, label] (key)}
		<button
			type="button"
			onclick={() => (view = key)}
			aria-pressed={view === key}
			data-tip={label}
			class="tip-below flex cursor-pointer items-center rounded-[0.25rem] px-2.5 py-1.5 transition-colors {view === key
				? 'bg-ink text-paper'
				: 'text-ink-soft hover:text-ink'}"
		>
			<Icon name={icon} size={15} />
			<span class="sr-only">{label}</span>
		</button>
	{/each}
</div>
