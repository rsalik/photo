<script lang="ts">
	import type { PageData } from './$types';
	import Icon from '$lib/components/Icon.svelte';

	let { data }: { data: PageData } = $props();

	const max = $derived(Math.max(1, ...data.series.map((d) => d.count)));
	const deviceTotal = $derived(Math.max(1, data.devices.reduce((n, d) => n + d.count, 0)));
	const topPhotoMax = $derived(Math.max(1, ...data.photos.map((p) => p.count)));

	const dayLabel = (day: string) =>
		new Date(`${day}T00:00:00Z`).toLocaleDateString('en-US', {
			month: 'short',
			day: 'numeric',
			timeZone: 'UTC'
		});

	/** 'album:Iceland' → { kind: 'album', value: 'Iceland' } */
	const splitFilter = (key: string) => {
		const i = key.indexOf(':');
		return i < 0 ? { kind: key, value: '' } : { kind: key.slice(0, i), value: key.slice(i + 1) };
	};

	const kpis = $derived([
		['Today', data.summary.today],
		['Past 7 days', data.summary.week],
		['Past 30 days', data.summary.month],
		['All time', data.summary.allTime]
	] as const);
</script>

<svelte:head><title>Analytics — Admin</title></svelte:head>

<main class="mx-auto max-w-5xl px-4 py-6 sm:px-6">
	<div class="mb-6 flex flex-wrap items-baseline justify-between gap-4">
		<div class="flex items-baseline gap-3">
			<h1 class="type-display text-2xl">Analytics</h1>
			{#if data.summary.since}
				<span class="type-label text-ink-soft">since {dayLabel(data.summary.since)}</span>
			{/if}
		</div>
		<!-- trailing-window picker -->
		<div class="inline-flex items-center gap-0.5 rounded-pop border border-hairline p-0.5">
			{#each data.ranges as r (r)}
				<a
					href="?days={r}"
					aria-current={data.days === r ? 'page' : undefined}
					class="type-label rounded-[0.25rem] px-3 py-1.5 transition-colors {data.days === r
						? 'bg-ink text-paper'
						: 'text-ink-soft hover:text-ink'}"
				>
					{r}d
				</a>
			{/each}
		</div>
	</div>

	{#if data.summary.allTime === 0}
		<div class="mb-6 border border-hairline p-4">
			<p class="text-sm text-ink-soft">
				No traffic recorded yet — public page views are counted from now on. Views from your own
				admin session and known crawlers are excluded.
			</p>
		</div>
	{/if}

	<!-- headline counts -->
	<div class="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
		{#each kpis as [label, value] (label)}
			<div class="border border-hairline p-4">
				<p class="type-mono text-2xl">{value.toLocaleString('en-US')}</p>
				<p class="type-label mt-1 text-ink-soft">{label}</p>
			</div>
		{/each}
	</div>

	<!-- daily views -->
	<div class="mb-6 border border-hairline p-4 sm:p-5">
		<div class="mb-4 flex items-baseline justify-between">
			<span class="type-label text-ink-soft">Views · past {data.days} days</span>
			<span class="type-mono text-xs text-ink-soft">peak {max.toLocaleString('en-US')}/day</span>
		</div>
		<div class="flex h-36 items-end gap-0 sm:gap-px">
			{#each data.series as d (d.day)}
				<div
					class="group relative min-w-0 flex-1"
					style="height: {Math.max(2, (d.count / max) * 100)}%"
					title="{dayLabel(d.day)}: {d.count} {d.count === 1 ? 'view' : 'views'}"
				>
					<div
						class="h-full w-full transition-colors {d.count
							? 'bg-accent/75 group-hover:bg-accent'
							: 'bg-hairline group-hover:bg-ink-soft/40'}"
					></div>
				</div>
			{/each}
		</div>
		<div class="mt-2 flex justify-between border-t border-hairline pt-1.5">
			<span class="type-mono text-[10px] text-ink-soft">{dayLabel(data.series[0].day)}</span>
			<span class="type-mono text-[10px] text-ink-soft">{dayLabel(data.series[data.series.length - 1].day)}</span>
		</div>
	</div>

	<div class="grid gap-6 lg:grid-cols-5">
		<!-- most-viewed photos -->
		<section class="border border-hairline lg:col-span-3">
			<h2 class="type-label border-b border-hairline px-4 py-3 text-ink-soft">Top photos</h2>
			{#if data.photos.length === 0}
				<p class="px-4 py-6 text-sm text-ink-soft">No photo views in this window.</p>
			{:else}
				<ol class="divide-y divide-hairline">
					{#each data.photos as p, i (p.id)}
						<li>
							<a
								href="/photo/{p.slug}"
								class="flex items-center gap-3 px-4 py-2.5 transition-colors hover:bg-hairline/30"
							>
								<span class="type-mono w-5 shrink-0 text-right text-xs text-ink-soft">{i + 1}</span>
								<img
									src="/img/{p.id}/sm"
									alt=""
									loading="lazy"
									class="h-10 w-14 shrink-0 object-cover"
								/>
								<span class="min-w-0 flex-1">
									<span class="block truncate text-sm">{p.title}</span>
									<span class="mt-1 block h-1 bg-hairline">
										<span class="block h-full bg-accent" style="width: {(p.count / topPhotoMax) * 100}%"
										></span>
									</span>
								</span>
								<span class="type-mono shrink-0 text-sm">{p.count.toLocaleString('en-US')}</span>
							</a>
						</li>
					{/each}
				</ol>
			{/if}
		</section>

		<div class="flex flex-col gap-6 lg:col-span-2">
			<!-- device split -->
			<section class="border border-hairline">
				<h2 class="type-label border-b border-hairline px-4 py-3 text-ink-soft">Devices</h2>
				{#if data.devices.length === 0}
					<p class="px-4 py-6 text-sm text-ink-soft">Nothing yet.</p>
				{:else}
					<div class="flex flex-col gap-3 px-4 py-4">
						{#each data.devices as d (d.key)}
							<div>
								<div class="mb-1 flex items-baseline justify-between">
									<span class="text-sm capitalize">{d.key || 'unknown'}</span>
									<span class="type-mono text-xs text-ink-soft"
										>{Math.round((d.count / deviceTotal) * 100)}%</span
									>
								</div>
								<div class="h-1 bg-hairline">
									<div class="h-full bg-accent" style="width: {(d.count / deviceTotal) * 100}%"></div>
								</div>
							</div>
						{/each}
					</div>
				{/if}
			</section>

			<!-- external referrers -->
			<section class="border border-hairline">
				<h2 class="type-label border-b border-hairline px-4 py-3 text-ink-soft">Referrers</h2>
				{#if data.referrers.length === 0}
					<p class="px-4 py-6 text-sm text-ink-soft">No external referrers yet.</p>
				{:else}
					<ul class="divide-y divide-hairline">
						{#each data.referrers as r (r.key)}
							<li class="flex items-baseline justify-between gap-3 px-4 py-2">
								<span class="truncate text-sm">{r.key}</span>
								<span class="type-mono shrink-0 text-sm">{r.count.toLocaleString('en-US')}</span>
							</li>
						{/each}
					</ul>
				{/if}
			</section>

			<!-- filter usage -->
			<section class="border border-hairline">
				<h2 class="type-label border-b border-hairline px-4 py-3 text-ink-soft">Filter usage</h2>
				{#if data.filters.length === 0 && data.summary.searches === 0}
					<p class="px-4 py-6 text-sm text-ink-soft">No filters used yet.</p>
				{:else}
					<ul class="divide-y divide-hairline">
						{#each data.filters as f (f.key)}
							{@const parts = splitFilter(f.key)}
							<li class="flex items-baseline justify-between gap-3 px-4 py-2">
								<span class="flex min-w-0 items-baseline gap-2">
									<span class="type-label shrink-0 text-ink-soft">{parts.kind}</span>
									<span class="truncate text-sm">{parts.value}</span>
								</span>
								<span class="type-mono shrink-0 text-sm">{f.count.toLocaleString('en-US')}</span>
							</li>
						{/each}
						{#if data.summary.searches > 0}
							<li class="flex items-baseline justify-between gap-3 px-4 py-2">
								<span class="flex items-baseline gap-2">
									<Icon name="search" size={12} class="text-ink-soft" />
									<span class="text-sm">Free-text searches</span>
								</span>
								<span class="type-mono shrink-0 text-sm">{data.summary.searches.toLocaleString('en-US')}</span>
							</li>
						{/if}
					</ul>
				{/if}
			</section>
		</div>
	</div>
</main>
