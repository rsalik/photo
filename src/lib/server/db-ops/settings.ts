import { query } from './connection';
import { DEFAULT_SETTINGS, type SiteSettings } from '../../types';

export async function getSettings(): Promise<SiteSettings> {
	const rows = await query<{ key: string; value: string }>(`SELECT key, value FROM settings`);
	const stored = Object.fromEntries(rows.map((r) => [r.key, JSON.parse(r.value)]));
	return { ...DEFAULT_SETTINGS, ...stored };
}

export async function saveSettings(patch: Partial<SiteSettings>): Promise<void> {
	for (const [key, value] of Object.entries(patch)) {
		await query(
			`INSERT INTO settings (key, value) VALUES ($1, $2)
			 ON CONFLICT (key) DO UPDATE SET value = excluded.value`,
			[key, JSON.stringify(value)]
		);
	}
}
