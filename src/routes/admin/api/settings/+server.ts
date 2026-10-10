import { error, json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getSettings, saveSettings } from '$lib/server/db';
import type { SiteSettings } from '$lib/types';

export const POST: RequestHandler = async ({ request }) => {
	const body = (await request.json()) as Partial<SiteSettings>;
	const patch: Partial<SiteSettings> = {};

	if (body.siteTitle !== undefined) patch.siteTitle = String(body.siteTitle).trim() || 'Portfolio';
	if (body.siteSubtitle !== undefined) patch.siteSubtitle = String(body.siteSubtitle).trim();
	if (body.accentColor !== undefined) {
		if (!/^#[0-9a-fA-F]{6}$/.test(body.accentColor)) error(400, 'Accent must be a hex color');
		patch.accentColor = body.accentColor;
	}
	if (body.fontTheme !== undefined) {
		if (!['heritage', 'modern', 'editorial'].includes(body.fontTheme)) error(400, 'Unknown font theme');
		patch.fontTheme = body.fontTheme;
	}
	if (body.galleryRowHeight !== undefined) {
		patch.galleryRowHeight = Math.min(520, Math.max(160, Number(body.galleryRowHeight) || 300));
	}
	if (body.postcardHoldMs !== undefined) {
		patch.postcardHoldMs = Math.min(6000, Math.max(500, Number(body.postcardHoldMs) || 2000));
	}
	if (body.postcardScrimStrength !== undefined) {
		patch.postcardScrimStrength = Math.min(1.5, Math.max(0, Number(body.postcardScrimStrength) || 0));
	}
	if (body.postcardScrimShapeDesktop !== undefined) {
		if (!['rectangle', 'ellipse'].includes(body.postcardScrimShapeDesktop)) {
			error(400, 'Unknown scrim shape');
		}
		patch.postcardScrimShapeDesktop = body.postcardScrimShapeDesktop;
	}
	if (body.postcardScrimShapeMobile !== undefined) {
		if (!['rectangle', 'ellipse'].includes(body.postcardScrimShapeMobile)) {
			error(400, 'Unknown scrim shape');
		}
		patch.postcardScrimShapeMobile = body.postcardScrimShapeMobile;
	}

	await saveSettings(patch);
	return json(await getSettings());
};
