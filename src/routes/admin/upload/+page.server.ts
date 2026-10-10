/** Supply upload metadata options and native processing availability to the admin page. */
import type { PageServerLoad } from './$types';
import { dev } from '$app/environment';
import { getFilterOptions } from '$lib/server/db';

/** Enable local uploads even when the adapter emulates Cloudflare bindings. */
export const load: PageServerLoad = async ({ platform }) => ({
	options: await getFilterOptions({ includeTest: true }),
	localProcessing: dev || !platform
});
