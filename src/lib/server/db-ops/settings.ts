import { db } from './connection';
import { DEFAULT_SETTINGS, type SiteSettings } from '../../types';

export function getSettings(): SiteSettings {
	const rows = db.prepare(`SELECT key, value FROM settings`).all() as { key: string; value: string }[];
	const stored = Object.fromEntries(rows.map((r) => [r.key, JSON.parse(r.value)]));
	return { ...DEFAULT_SETTINGS, ...stored };
}

export function saveSettings(patch: Partial<SiteSettings>): void {
	const stmt = db.prepare(`
		INSERT INTO settings (key, value) VALUES (?, ?)
		ON CONFLICT(key) DO UPDATE SET value = excluded.value
	`);
	const tx = db.transaction(() => {
		for (const [key, value] of Object.entries(patch)) {
			stmt.run(key, JSON.stringify(value));
		}
	});
	tx();
}
