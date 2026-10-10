<script lang="ts">
	import type { ActionData, PageServerData } from './$types';
	import { enhance } from '$app/forms';

	let { data, form }: { data: PageServerData; form: ActionData } = $props();
	let submitting = $state(false);
</script>

<svelte:head><title>Admin · Sign in</title></svelte:head>

<div class="flex min-h-dvh items-center justify-center px-6">
	<div class="w-full max-w-sm">
		<h1 class="type-display text-center text-2xl">Admin Portal</h1>
		<div class="mx-auto mt-4 mb-8 h-px w-16 bg-accent"></div>

		{#if !data.enabled}
			<p class="border border-hairline px-4 py-3 text-center text-sm text-ink-soft">
				Set <code class="type-mono">ADMIN_PASSWORD</code> in your <code class="type-mono">.env</code> file to enable the portal.
			</p>
		{:else}
			<form
				method="POST"
				use:enhance={() => {
					submitting = true;
					return async ({ update }) => {
						submitting = false;
						await update();
					};
				}}
				class="flex flex-col gap-4"
			>
				<label class="flex flex-col gap-2">
					<span class="type-label text-ink-soft">Password</span>
					<!-- svelte-ignore a11y_autofocus -->
					<input
						type="password"
						name="password"
						required
						autofocus
						autocomplete="current-password"
						class="field py-2"
					/>
				</label>
				{#if form?.message}
					<p class="text-sm text-red-800">{form.message}</p>
				{/if}
				<button
					type="submit"
					disabled={submitting}
					class="btn btn-outline mt-2 px-6 py-3"
				>
					{submitting ? 'Signing in…' : 'Sign in'}
				</button>
			</form>
		{/if}

		<a href="/" class="type-label mt-8 block text-center text-ink-soft hover:text-accent">← Back to gallery</a>
	</div>
</div>
