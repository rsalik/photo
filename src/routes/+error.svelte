<script lang="ts">
	import { page } from '$app/state';
</script>

<div class="flex min-h-dvh flex-col items-center justify-center gap-4 px-6 text-center">
	<p class="type-mono text-ink-soft">{page.status}</p>
	<h1 class="type-display text-3xl">{page.error?.message ?? 'Something went wrong'}</h1>
	<a href="/" class="type-label mt-4 text-accent underline underline-offset-4">Return to gallery</a>
</div>
