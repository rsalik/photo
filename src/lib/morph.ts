/**
 * Mark a clicked gallery frame so the photo page zooms *out of* it: the frame
 * gets a shared `view-transition-name` and a session flag tells the photo page
 * to give its image the same name (see +layout.svelte's onNavigate). The browser
 * morphs the frame into the photo. The name is unique per transition, so we only
 * ever set it on the one element being clicked.
 */
export function markMorph(e: MouseEvent) {
	if (typeof document === 'undefined' || !document.startViewTransition) return;
	try {
		sessionStorage.setItem('morph', '1');
	} catch {
		/* private mode */
	}
	(e.currentTarget as HTMLElement).style.viewTransitionName = 'morph-frame';
}
