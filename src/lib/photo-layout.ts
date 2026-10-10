export const PHOTO_MARGIN = 8;
export const PHOTO_HEADER_HEIGHT = 48;
export const COMPACT_FOOTER_HEIGHT = 92;

/** Choose the arrangement that gives a photo more room in a short, wide window. */
export function photoLayout(
	photo: { width: number; height: number },
	viewportWidth: number,
	viewportHeight: number
) {
	const width = viewportWidth || 1280;
	const height = viewportHeight || 800;
	const compact = width > height && height <= 600;
	const sidebarWidth = compact ? Math.round(Math.max(200, Math.min(280, width * 0.3))) : 320;
	let sidebar = photo.height > photo.width && width >= 900 && width >= height;

	if (compact) {
		const beside = Math.min(
			Math.max(1, width - sidebarWidth - PHOTO_MARGIN * 2) / photo.width,
			Math.max(1, height - PHOTO_MARGIN * 2) / photo.height
		);
		const below = Math.min(
			Math.max(1, width - PHOTO_MARGIN * 2) / photo.width,
			Math.max(1, height - PHOTO_HEADER_HEIGHT - COMPACT_FOOTER_HEIGHT - PHOTO_MARGIN * 2) /
				photo.height
		);
		// A modest gain is enough to justify a sidebar. Panoramas usually gain
		// more from the full window width and keep the compact footer instead.
		sidebar = beside > below * 1.08;
	}

	return { sidebar, sidebarWidth, compact };
}
