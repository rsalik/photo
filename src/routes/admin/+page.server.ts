import type { PageServerLoad } from './$types';
import { getFilterOptions, getGearProfiles, listPhotos } from '$lib/server/db';

export const load: PageServerLoad = async () => {
	const [photos, options, gear] = await Promise.all([
		listPhotos(),
		getFilterOptions(),
		getGearProfiles()
	]);
	return { photos, options, gear };
};
