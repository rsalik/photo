/** Shared so pages (e.g. the photo view's Shift-to-fullscreen and Escape
 *  handlers) can stand down while the site palette is open. */
export const palette = $state({ open: false });
