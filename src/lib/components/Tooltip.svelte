<script lang="ts">
	import { onMount, type Snippet } from 'svelte';

	let {
		text,
		class: className = '',
		children
	}: { text: string | null; class?: string; children: Snippet } = $props();

	const id = $props.id();
	let trigger = $state<HTMLButtonElement>();
	let bubble = $state<HTMLSpanElement>();
	let timer: ReturnType<typeof setTimeout> | undefined;

	function hide() {
		clearTimeout(timer);
		if (bubble?.hidePopover && bubble.matches(':popover-open')) bubble.hidePopover();
	}

	function show() {
		clearTimeout(timer);
		if (!text || !trigger || !bubble?.showPopover || trigger.closest('[inert]')) return;
		// The top layer escapes both overflow clipping and transformed ancestors.
		if (!bubble.matches(':popover-open')) bubble.showPopover();
		const anchor = trigger.getBoundingClientRect();
		const tip = bubble.getBoundingClientRect();
		const pad = 12;
		const gap = 9;
		const left = Math.max(
			pad,
			Math.min(anchor.left + (anchor.width - tip.width) / 2, innerWidth - tip.width - pad)
		);
		const above = anchor.top - tip.height - gap;
		const top = Math.max(
			pad,
			Math.min(above >= pad ? above : anchor.bottom + gap, innerHeight - tip.height - pad)
		);
		bubble.style.left = `${left}px`;
		bubble.style.top = `${top}px`;
	}

	function scheduleHide() {
		clearTimeout(timer);
		if (!trigger?.matches(':focus-visible')) timer = setTimeout(hide, 120);
	}

	function onKeydown(event: KeyboardEvent) {
		if (event.key === 'Escape' && bubble?.hidePopover && bubble.matches(':popover-open')) {
			event.preventDefault();
			event.stopPropagation();
		}
		hide();
	}

	$effect(() => {
		text;
		hide();
		// Retain a native tooltip in browsers predating the Popover API.
		if (trigger && bubble && !bubble.showPopover) trigger.title = text ?? '';
	});

	onMount(() => {
		// A scrolled or resized metadata strip must not leave a detached tooltip.
		window.addEventListener('scroll', hide, true);
		window.addEventListener('resize', hide);
		window.addEventListener('keydown', onKeydown, true);
		return () => {
			hide();
			window.removeEventListener('scroll', hide, true);
			window.removeEventListener('resize', hide);
			window.removeEventListener('keydown', onKeydown, true);
		};
	});
</script>

<button
	bind:this={trigger}
	type="button"
	class={className}
	aria-describedby={text ? id : undefined}
	onmouseenter={() => {
		clearTimeout(timer);
		timer = setTimeout(show, 250);
	}}
	onmouseleave={scheduleHide}
	onfocus={show}
	onblur={hide}
>
	{@render children()}
</button>
<span
	bind:this={bubble}
	{id}
	popover="manual"
	role="tooltip"
	onmouseenter={() => clearTimeout(timer)}
	onmouseleave={scheduleHide}
>
	{text}
</span>

<style>
	[popover] {
		display: none;
		position: fixed;
		inset: auto;
		max-width: calc(100vw - 24px);
		margin: 0;
		border: 0;
		border-radius: var(--radius-pop);
		padding: 0.3rem 0.55rem;
		background: var(--ink);
		color: var(--paper);
		font-family: var(--font-caps);
		font-size: 0.625rem;
		font-weight: 500;
		line-height: 1.5;
		letter-spacing: 0.14em;
		text-align: center;
		text-transform: uppercase;
		overflow-wrap: anywhere;
	}

	[popover]:popover-open {
		display: block;
	}
</style>
