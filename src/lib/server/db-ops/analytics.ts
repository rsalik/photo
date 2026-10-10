import { query } from './connection';

/**
 * First-party analytics over daily rollups — one counter per (day, metric,
 * key), upserted in place. No visitor is ever identified: nothing is stored
 * but coarse aggregates, so there's nothing to consent-gate.
 *
 * Metrics written by the request hook (see src/hooks.server.ts):
 * - `page`     key: 'gallery' | 'photo' | 'other' — page views by kind
 * - `photo`    key: photo id — views of an individual photo page
 * - `referrer` key: external hostname that linked here
 * - `device`   key: 'desktop' | 'mobile' | 'tablet'
 * - `filter`   key: '<filterKey>:<value>' — gallery filter usage
 * - `search`   key: '' — free-text searches (values are unbounded, so only counted)
 */

export interface AnalyticsEvent {
	metric: string;
	key?: string;
}

/** Increment today's counters for a batch of events (one round trip). */
export async function recordEvents(events: AnalyticsEvent[]): Promise<void> {
	if (!events.length) return;
	const params: unknown[] = [];
	const rows = events.map((e) => {
		params.push(e.metric, (e.key ?? '').slice(0, 120));
		const metric = `$${params.length - 1}`;
		const key = `$${params.length}`;
		// Public photo URLs use slugs, while analytics must survive renames. Resolve
		// the canonical path segment to the stable photo id in this same write.
		return `(CURRENT_DATE, ${metric}, CASE WHEN ${metric} = 'photo' THEN
			coalesce((SELECT id FROM photos WHERE slug = ${key} OR id = ${key}
				ORDER BY (slug = ${key}) DESC LIMIT 1), ${key}) ELSE ${key} END, 1)`;
	});
	await query(
		`INSERT INTO analytics_daily (day, metric, key, count) VALUES ${rows.join(', ')}
		 ON CONFLICT (day, metric, key) DO UPDATE SET count = analytics_daily.count + excluded.count`,
		params
	);
}

const dayStr = (d: string | Date) =>
	(d instanceof Date ? d.toISOString() : new Date(d).toISOString()).slice(0, 10);

export interface DayCount {
	day: string; // YYYY-MM-DD
	count: number;
}

/** Page views per day over the trailing window, zero-filled for quiet days. */
export async function viewsByDay(days: number): Promise<DayCount[]> {
	const rows = await query<{ day: string | Date; count: number }>(
		`SELECT d::date AS day, coalesce(sum(a.count), 0)::int AS count
		 FROM generate_series(CURRENT_DATE - ($1::int - 1) * interval '1 day', CURRENT_DATE, interval '1 day') d
		 LEFT JOIN analytics_daily a ON a.day = d::date AND a.metric = 'page'
		 GROUP BY d ORDER BY d`,
		[days]
	);
	return rows.map((r) => ({ day: dayStr(r.day), count: r.count }));
}

export interface KeyCount {
	key: string;
	count: number;
}

/** Totals per key for one metric over the trailing window, busiest first. */
export async function keyTotals(metric: string, days: number, limit = 50): Promise<KeyCount[]> {
	return query<KeyCount>(
		`SELECT key, sum(count)::int AS count FROM analytics_daily
		 WHERE metric = $1 AND day > CURRENT_DATE - $2::int * interval '1 day'
		 GROUP BY key ORDER BY 2 DESC, key LIMIT $3`,
		[metric, days, limit]
	);
}

export interface PhotoViews {
	id: string;
	slug: string;
	title: string;
	count: number;
}

/** The most-viewed photos over the window, joined for display. Photos that
 *  have since been deleted are dropped. */
export async function topPhotos(days: number, limit = 12): Promise<PhotoViews[]> {
	return query<PhotoViews>(
		`SELECT p.id, p.slug, p.title, sum(a.count)::int AS count
		 FROM analytics_daily a JOIN photos p ON p.id = a.key OR p.slug = a.key
		 WHERE a.metric = 'photo' AND a.day > CURRENT_DATE - $1::int * interval '1 day'
		 GROUP BY p.id, p.slug, p.title ORDER BY 4 DESC, p.title LIMIT $2`,
		[days, limit]
	);
}

export interface AnalyticsSummary {
	today: number;
	week: number;
	month: number;
	allTime: number;
	/** first day with any data, YYYY-MM-DD — null when nothing is recorded yet */
	since: string | null;
	searches: number;
}

/** Headline page-view counts across standard windows. */
export async function analyticsSummary(searchDays = 30): Promise<AnalyticsSummary> {
	const rows = await query<{
		today: number;
		week: number;
		month: number;
		all_time: number;
		since: string | Date | null;
		searches: number;
	}>(
		`SELECT
			coalesce(sum(count) FILTER (WHERE metric = 'page' AND day = CURRENT_DATE), 0)::int AS today,
			coalesce(sum(count) FILTER (WHERE metric = 'page' AND day > CURRENT_DATE - interval '7 days'), 0)::int AS week,
			coalesce(sum(count) FILTER (WHERE metric = 'page' AND day > CURRENT_DATE - interval '30 days'), 0)::int AS month,
			coalesce(sum(count) FILTER (WHERE metric = 'page'), 0)::int AS all_time,
			min(day) FILTER (WHERE metric = 'page') AS since,
			coalesce(sum(count) FILTER (WHERE metric = 'search' AND day > CURRENT_DATE - $1::int * interval '1 day'), 0)::int AS searches
		 FROM analytics_daily`,
		[searchDays]
	);
	const r = rows[0];
	return {
		today: r?.today ?? 0,
		week: r?.week ?? 0,
		month: r?.month ?? 0,
		allTime: r?.all_time ?? 0,
		since: r?.since ? dayStr(r.since) : null,
		searches: r?.searches ?? 0
	};
}

/** Daily views of one photo over the window (for the per-photo drill-down). */
export async function photoViewsByDay(photoId: string, days: number): Promise<DayCount[]> {
	const rows = await query<{ day: string | Date; count: number }>(
		`SELECT d::date AS day, coalesce(sum(a.count), 0)::int AS count
		 FROM generate_series(CURRENT_DATE - ($2::int - 1) * interval '1 day', CURRENT_DATE, interval '1 day') d
		 LEFT JOIN analytics_daily a ON a.day = d::date AND a.metric = 'photo' AND a.key = $1
		 GROUP BY d ORDER BY d`,
		[photoId, days]
	);
	return rows.map((r) => ({ day: dayStr(r.day), count: r.count }));
}
