import type { PageServerLoad } from './$types';
import { getFilterOptions } from '$lib/server/db';

export const load: PageServerLoad = () => ({
	options: getFilterOptions()
});
