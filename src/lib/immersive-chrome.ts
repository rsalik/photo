const ATTRIBUTE = 'data-photo-immersive';

interface ImmersiveDocument {
	users: number;
	previousAttribute: string | null;
	theme: HTMLMetaElement;
}

const documents = new WeakMap<Document, ImmersiveDocument>();

function enter(document: Document): () => void {
	let state = documents.get(document);
	if (!state) {
		const theme = document.createElement('meta');
		theme.name = 'theme-color';
		theme.content = '#000000';
		state = {
			users: 0,
			previousAttribute: document.documentElement.getAttribute(ATTRIBUTE),
			theme
		};
		documents.set(document, state);
		// Browsers use the first applicable theme tag. Keep the site's existing
		// tags intact so leaving the viewer restores even media-specific colors.
		document.head.prepend(theme);
		document.documentElement.setAttribute(ATTRIBUTE, '');
	}
	state.users++;
	const current = state;
	return () => {
		if (--current.users > 0) return;
		current.theme.remove();
		if (document.documentElement.getAttribute(ATTRIBUTE) === '') {
			if (current.previousAttribute === null)
				document.documentElement.removeAttribute(ATTRIBUTE);
			else document.documentElement.setAttribute(ATTRIBUTE, current.previousAttribute);
		}
		documents.delete(document);
	};
}

/**
 * Match page edges and supported browser chrome to the black lightbox.
 * CSS uses the root attribute for backgrounds; the browser owns its toolbar UI.
 */
export function immersiveChrome(node: HTMLElement, active: boolean) {
	let leave: (() => void) | undefined;
	function update(next: boolean) {
		if (next && !leave) leave = enter(node.ownerDocument);
		else if (!next && leave) {
			leave();
			leave = undefined;
		}
	}
	update(active);
	return {
		update,
		destroy() {
			update(false);
		}
	};
}
