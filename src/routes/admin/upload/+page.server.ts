import type { PageServerLoad } from './$types';
import { getFilterOptions } from '$lib/server/db';

export const load: PageServerLoad = async () => ({
	options: await getFilterOptions()
});
