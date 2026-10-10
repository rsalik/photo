/**
 * Photo timestamp formatting.
 *
 * A photo's `takenAt` is the camera's wall clock at the moment of capture —
 * a naive local time with no meaningful zone. It is stored, transported, and
 * formatted pinned to UTC so no viewer timezone can shift the displayed date
 * off the day the photo was actually taken.
 */

/** "October 15, 2025" — the everyday display form. */
export function photoDate(iso: string | null | undefined): string | null {
	if (!iso) return null;
	return new Date(iso).toLocaleDateString('en-US', {
		year: 'numeric',
		month: 'long',
		day: 'numeric',
		timeZone: 'UTC'
	});
}

/** "October 15, 2025, 4:32:11 PM" — the full capture moment, for hover detail. */
export function photoDateTime(iso: string | null | undefined): string | null {
	if (!iso) return null;
	return new Date(iso).toLocaleString('en-US', {
		year: 'numeric',
		month: 'long',
		day: 'numeric',
		hour: 'numeric',
		minute: '2-digit',
		second: '2-digit',
		timeZone: 'UTC'
	});
}
