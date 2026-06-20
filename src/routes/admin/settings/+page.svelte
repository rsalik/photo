<script lang="ts">
	import { invalidateAll } from '$app/navigation';
	import type { FontTheme, ScrimMode, ScrimStrength } from '$lib/types';
	import type { PageData } from './$types';

	const SCRIM_OPTIONS: ScrimStrength[] = ['off', 'subtle', 'standard', 'strong'];
	const SCRIM_MODES: { value: ScrimMode; name: string; blurb: string }[] = [
		{ value: 'blanket', name: 'Blanket', blurb: 'Even wash over the whole photo' },
		{ value: 'ellipse', name: 'Ellipse', blurb: 'Soft glow behind the title only' }
	];

	let { data }: { data: PageData } = $props();

	let form = $state({ ...data.settings });
	let busy = $state(false);
	let notice = $state('');

	const ACCENT_PRESETS: [string, string][] = [
		['#1f4633', 'Masters green'],
		['#5d1725', 'Bordeaux'],
		['#1e3a5f', 'Navy'],
		['#7a5c2e', 'Brass'],
		['#3f3f46', 'Graphite'],
		['#6e4632', 'Saddle']
	];

	const FONT_THEMES: { value: FontTheme; name: string; blurb: string }[] = [
		{ value: 'heritage', name: 'Heritage', blurb: 'Nib Pro serif display with Circular body — classic, warm' },
		{ value: 'modern', name: 'Modern', blurb: 'Alliance Platt caps with wide tracking — gallery placard' },
		{ value: 'editorial', name: 'Editorial', blurb: 'Light serif throughout — quiet, literary' }
	];

	async function save() {
		busy = true;
		notice = '';
		try {
			const res = await fetch('/admin/api/settings', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify(form)
			});
			if (!res.ok) throw new Error((await res.json()).message);
			notice = 'Saved — changes are live';
			await invalidateAll();
		} catch (err) {
			notice = err instanceof Error ? err.message : 'Save failed';
		} finally {
			busy = false;
			setTimeout(() => (notice = ''), 3000);
		}
	}
</script>

<svelte:head><title>Admin · Settings</title></svelte:head>

<main class="mx-auto max-w-2xl px-4 py-6 sm:px-6">
	<h1 class="type-display mb-8 text-2xl">Site settings</h1>

	<div class="flex flex-col gap-8">
		<section class="grid gap-4 sm:grid-cols-2">
			<label class="flex flex-col gap-1">
				<span class="type-label text-ink-soft">Site title</span>
				<input bind:value={form.siteTitle} class="field" />
			</label>
			<label class="flex flex-col gap-1">
				<span class="type-label text-ink-soft">Subtitle</span>
				<input bind:value={form.siteSubtitle} class="field" />
			</label>
		</section>

		<section>
			<h2 class="type-label mb-3 text-ink-soft">Accent color</h2>
			<div class="flex flex-wrap items-center gap-2.5">
				{#each ACCENT_PRESETS as [hex, name] (hex)}
					<button
						type="button"
						title={name}
						class="h-8 w-8 cursor-pointer rounded-full transition-transform hover:scale-110 {form.accentColor === hex ? 'ring-2 ring-ink ring-offset-2 ring-offset-paper' : ''}"
						style="background: {hex}"
						onclick={() => (form.accentColor = hex)}
					></button>
				{/each}
				<input type="color" bind:value={form.accentColor} class="h-8 w-12 cursor-pointer border border-hairline bg-transparent" title="Custom accent" />
				<span class="type-mono text-ink-soft">{form.accentColor}</span>
			</div>
		</section>

		<section>
			<h2 class="type-label mb-3 text-ink-soft">Typography</h2>
			<div class="grid gap-3 sm:grid-cols-3">
				{#each FONT_THEMES as theme (theme.value)}
					<button
						type="button"
						data-font-theme={theme.value}
						class="cursor-pointer border p-4 text-left transition-colors {form.fontTheme === theme.value ? 'border-accent' : 'border-hairline hover:border-ink-soft'}"
						onclick={() => (form.fontTheme = theme.value)}
					>
						<span class="type-display block text-lg">{theme.name}</span>
						<span class="mt-2 block text-xs text-ink-soft">{theme.blurb}</span>
					</button>
				{/each}
			</div>
		</section>

		<section class="grid gap-6 sm:grid-cols-2">
			<label class="flex flex-col gap-2">
				<span class="type-label text-ink-soft">Gallery row height · {form.galleryRowHeight}px</span>
				<input type="range" min="160" max="520" step="20" bind:value={form.galleryRowHeight} class="accent-(--accent)" />
			</label>
			<label class="flex flex-col gap-2">
				<span class="type-label text-ink-soft">Postcard title hold · {(form.postcardHoldMs / 1000).toFixed(1)}s</span>
				<input type="range" min="500" max="6000" step="250" bind:value={form.postcardHoldMs} class="accent-(--accent)" />
			</label>
		</section>

		<section>
			<h2 class="type-label mb-1 text-ink-soft">Postcard title shadow</h2>
			<p class="mb-3 text-xs text-ink-soft">
				The glow behind the title during the opening animation — helps legibility on photos with mixed bright and dark areas.
			</p>
			<div class="flex flex-wrap gap-2">
				{#each SCRIM_OPTIONS as strength (strength)}
					<button
						type="button"
						class="btn {form.scrimStrength === strength ? 'border border-accent text-accent' : 'btn-quiet'}"
						onclick={() => (form.scrimStrength = strength)}
					>
						{strength}
					</button>
				{/each}
			</div>

			{#if form.scrimStrength !== 'off'}
				<h3 class="type-label mt-5 mb-2 text-ink-soft">Scrim shape</h3>
				<div class="grid gap-3 sm:grid-cols-2">
					{#each SCRIM_MODES as mode (mode.value)}
						<button
							type="button"
							class="cursor-pointer border p-4 text-left transition-colors {form.scrimMode === mode.value ? 'border-accent' : 'border-hairline hover:border-ink-soft'}"
							onclick={() => (form.scrimMode = mode.value)}
						>
							<span class="type-display block text-lg">{mode.name}</span>
							<span class="mt-1 block text-xs text-ink-soft">{mode.blurb}</span>
						</button>
					{/each}
				</div>
			{/if}
		</section>

		<div class="flex items-center gap-4">
			<button
				class="btn btn-outline px-6 py-3"
				disabled={busy}
				onclick={save}
			>
				{busy ? 'Saving…' : 'Save settings'}
			</button>
			{#if notice}<span class="type-mono text-accent">{notice}</span>{/if}
		</div>
	</div>
</main>
