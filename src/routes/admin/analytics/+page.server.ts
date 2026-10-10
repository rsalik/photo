import type { PageServerLoad } from './$types';
import {
	analyticsSummary,
	keyTotals,
	topPhotos,
	viewsByDay
} from '$lib/server/db';

const RANGES = [7, 30, 90, 365] as const;

export const load: PageServerLoad = async ({ url }) => {
	const requested = Number(url.searchParams.get('days'));
	const days = (RANGES as readonly number[]).includes(requested) ? requested : 30;

	const [summary, series, photos, referrers, devices, filters] = await Promise.all([
		analyticsSummary(days),
		viewsByDay(days),
		topPhotos(days, 12),
		keyTotals('referrer', days, 12),
		keyTotals('device', days, 3),
		keyTotals('filter', days, 12)
	]);

	return { days, ranges: RANGES, summary, series, photos, referrers, devices, filters };
};
