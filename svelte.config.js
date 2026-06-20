import adapter from '@sveltejs/adapter-vercel';
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';

/** @type {import('@sveltejs/kit').Config} */
const config = {
	preprocess: vitePreprocess(),
	kit: {
		// Node serverless runtime — needed for sharp, better-sqlite3-free Postgres
		// drivers, and AsyncLocalStorage transactions.
		adapter: adapter({ runtime: 'nodejs20.x' })
	}
};

export default config;
