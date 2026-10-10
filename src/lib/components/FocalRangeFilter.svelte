<script lang="ts">
	import { fly } from 'svelte/transition';
	import Icon from './Icon.svelte';

	/**
	 * Focal-length range filter, styled as a lens barrel's focal scale: a track
	 * with mm ticks and two draggable index marks. The scale is logarithmic —
	 * focal lengths are perceptually multiplicative (24→35 reads like 85→135),
	 * so thumbs travel evenly across the whole zoom range.
	 */
	interface Props {
		/** span of focal lengths present in the library, mm */
		min: number;
		max: number;
		/** current URL bounds ('' = unset) */
		valueMin: string;
		valueMax: string;
		/** commits new bounds; '' means "unbounded on this side" */
		onchange: (min: string, max: string) => void;
	}
	let { min, max, valueMin, valueMax, onchange }: Props = $props();

	let open = $state(false);
	let root = $state<HTMLElement>();
	let track = $state<HTMLElement>();

	const lo = $derived(Math.log(Math.max(1, min)));
	const hi = $derived(Math.log(Math.max(min * 1.01 + 1, max)));
	const toT = (mm: number) => Math.min(1, Math.max(0, (Math.log(mm) - lo) / (hi - lo)));
	const toMm = (t: number) => Math.round(Math.exp(lo + Math.min(1, Math.max(0, t)) * (hi - lo)));

	// Local thumb positions in mm while dragging; re-synced whenever the URL
	// (props) or the library range changes.
	let a = $state(0);
	let b = $state(0);
	$effect(() => {
		a = valueMin ? +valueMin : Math.floor(min);
		b = valueMax ? +valueMax : Math.ceil(max);
	});

	const active = $derived(!!(valueMin || valueMax));

	/** standard focal stops that fall inside the library's range, for the scale */
	const STOPS = [8, 12, 16, 20, 24, 28, 35, 50, 70, 85, 105, 135, 200, 300, 400, 500, 600, 800];
	const ticks = $derived(STOPS.filter((s) => s >= min * 0.95 && s <= max * 1.05));
	// label only ticks that won't crowd each other on the log scale (≥ ~8% apart)
	const labeled = $derived.by(() => {
		const out = new Set<number>();
		let lastT = -1;
		for (const mm of ticks) {
			const t = toT(mm);
			if (t - lastT >= 0.09) {
				out.add(mm);
				lastT = t;
			}
		}
		return out;
	});

	function commit() {
		const loMm = Math.min(a, b);
		const hiMm = Math.max(a, b);
		onchange(loMm <= Math.floor(min) ? '' : String(loMm), hiMm >= Math.ceil(max) ? '' : String(hiMm));
	}

	function clear() {
		a = Math.floor(min);
		b = Math.ceil(max);
		onchange('', '');
	}

	/* -------------------------------------------------- pointer interaction */
	let dragging: 'a' | 'b' | null = null;

	function nearestThumb(t: number): 'a' | 'b' {
		return Math.abs(t - toT(a)) <= Math.abs(t - toT(b)) ? 'a' : 'b';
	}

	function trackT(e: PointerEvent): number {
		const r = track!.getBoundingClientRect();
		return (e.clientX - r.left) / r.width;
	}

	function onTrackDown(e: PointerEvent) {
		if (!track) return;
		const t = trackT(e);
		dragging = nearestThumb(t);
		setThumb(dragging, toMm(t));
		(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
	}
	function onTrackMove(e: PointerEvent) {
		if (dragging) setThumb(dragging, toMm(trackT(e)));
	}
	function onTrackUp() {
		if (!dragging) return;
		dragging = null;
		commit();
	}
	function setThumb(which: 'a' | 'b', mm: number) {
		const clamped = Math.min(Math.ceil(max), Math.max(Math.floor(min), mm));
		if (which === 'a') a = clamped;
		else b = clamped;
	}

	/** keyboard: arrows nudge a thumb one perceptual step (≈5% of the log range) */
	function onThumbKey(which: 'a' | 'b', e: KeyboardEvent) {
		const dir = e.key === 'ArrowRight' || e.key === 'ArrowUp' ? 1 : e.key === 'ArrowLeft' || e.key === 'ArrowDown' ? -1 : 0;
		if (!dir) return;
		e.preventDefault();
		const cur = which === 'a' ? a : b;
		setThumb(which, toMm(toT(cur) + dir * 0.05));
		commit();
	}

	/* quick ranges: the three classic lens families, clipped to the library */
	const presets = $derived(
		(
			[
				['Wide', '', '35'],
				['Standard', '35', '85'],
				['Tele', '85', '']
			] as const
		).filter(([, pMin, pMax]) => (!pMax || +pMax > min) && (!pMin || +pMin < max))
	);
	const presetActive = (pMin: string, pMax: string) => valueMin === pMin && valueMax === pMax;

	function close() {
		open = false;
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
	<!-- compact trigger — the active range appears in the bar's chip row -->
	<button
		type="button"
		onclick={() => (open = !open)}
		class="filter-trigger"
		data-active={active}
		aria-expanded={open}
	>
		<Icon name="focal" size={13} />
		<span class="type-label">Focal</span>
		<Icon name="chevron" size={10} class="opacity-70 transition-transform duration-200 {open ? 'rotate-180' : ''}" />
	</button>

	{#if open}
		<div
			transition:fly={{ y: 6, duration: 180 }}
			class="pop absolute top-full right-0 z-50 mt-2 w-80 px-4 pt-5 pb-3"
			role="group"
			aria-label="Focal length range"
		>
			<!-- readout: the committed-to-be range, mono like a lens barrel window -->
			<div class="mb-4 flex items-baseline justify-between">
				<span class="type-mono text-sm text-ink tabular-nums">{Math.min(a, b)}mm – {Math.max(a, b)}mm</span>
				<button
					type="button"
					onclick={clear}
					class="type-label cursor-pointer text-ink-soft transition-opacity hover:text-accent {active
						? 'opacity-100'
						: 'pointer-events-none opacity-0'}"
				>
					Reset
				</button>
			</div>

			<!-- the focal scale: log track, standard-stop ticks, two index marks -->
			<!-- svelte-ignore a11y_no_static_element_interactions -->
			<div
				bind:this={track}
				class="relative h-11 cursor-pointer touch-none select-none"
				onpointerdown={onTrackDown}
				onpointermove={onTrackMove}
				onpointerup={onTrackUp}
				onpointercancel={onTrackUp}
			>
				<!-- track + active segment -->
				<div class="absolute top-2.5 right-0 left-0 h-px bg-hairline"></div>
				<div
					class="absolute top-2.5 h-px bg-accent"
					style="left: {toT(Math.min(a, b)) * 100}%; width: {(toT(Math.max(a, b)) - toT(Math.min(a, b))) * 100}%"
				></div>
				<!-- ticks with mm labels, as on a zoom ring -->
				{#each ticks as mm (mm)}
					<div class="absolute top-1.5 w-px" style="left: {toT(mm) * 100}%">
						<div class="w-px bg-ink-soft/40 {labeled.has(mm) ? 'h-2' : 'h-1.5'}"></div>
						{#if labeled.has(mm)}
							<div class="type-mono absolute top-3 left-1/2 -translate-x-1/2 text-[9px] text-ink-soft/70">{mm}</div>
						{/if}
					</div>
				{/each}
				<!-- thumbs: lens index marks -->
				{#each [['a', a], ['b', b]] as const as [which, mm] (which)}
					<div
						class="absolute top-0 -translate-x-1/2"
						style="left: {toT(mm) * 100}%"
						role="slider"
						tabindex="0"
						aria-label={which === 'a' ? 'Minimum focal length' : 'Maximum focal length'}
						aria-valuemin={Math.floor(min)}
						aria-valuemax={Math.ceil(max)}
						aria-valuenow={mm}
						aria-valuetext="{mm}mm"
						onkeydown={(e) => onThumbKey(which, e)}
					>
						<div class="h-5 w-[3px] rounded-full bg-accent shadow-[0_0_0_3px_var(--paper)]"></div>
					</div>
				{/each}
			</div>

			<!-- classic lens families as one-tap ranges -->
			<div class="mt-3 flex items-center gap-2 border-t border-hairline pt-3">
				{#each presets as [name, pMin, pMax] (name)}
					<button
						type="button"
						class="type-label cursor-pointer rounded-pop border px-2.5 py-1 transition-colors {presetActive(pMin, pMax)
							? 'border-accent text-accent'
							: 'border-hairline text-ink-soft hover:border-ink-soft'}"
						onclick={() => (presetActive(pMin, pMax) ? clear() : onchange(pMin, pMax))}
					>
						{name}
					</button>
				{/each}
			</div>
		</div>
	{/if}
</div>
