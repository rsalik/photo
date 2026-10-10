import { query } from './connection';
import { DEFAULT_SETTINGS, type SiteSettings } from '../../types';

/* Settings are read by the request hook on every page view, so a short
   in-memory cache keeps steady-state traffic from paying a database round
   trip per request (Neon's HTTP driver makes that a network hop). Saving
   busts the cache; other isolates converge within the TTL, which is fine for
   single-admin cosmetic settings. */
const TTL_MS = 30_000;
let cached: { value: SiteSettings; at: number } | null = null;
let pending: Promise<SiteSettings> | null = null;

export async function getSettings(): Promise<SiteSettings> {
	if (cached && Date.now() - cached.at < TTL_MS) return cached.value;
	if (pending) return pending;
	pending = (async () => {
		const rows = await query<{ key: string; value: unknown }>(`SELECT key, value FROM settings`);
		const stored = Object.fromEntries(rows.map((r) => [r.key, r.value]));
		const value = { ...DEFAULT_SETTINGS, ...stored };
		cached = { value, at: Date.now() };
		return value;
	})();
	try {
		return await pending;
	} finally {
		pending = null;
	}
}

export async function saveSettings(patch: Partial<SiteSettings>): Promise<void> {
	for (const [key, value] of Object.entries(patch)) {
		await query(
			`INSERT INTO settings (key, value) VALUES ($1, $2::jsonb)
			 ON CONFLICT (key) DO UPDATE SET value = excluded.value`,
			[key, JSON.stringify(value)]
		);
	}
	cached = null;
}
