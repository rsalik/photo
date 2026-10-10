import assert from 'node:assert/strict';
import { test } from 'node:test';
import { immersiveChrome } from '../src/lib/immersive-chrome';

class Element {
	attributes = new Map<string, string>();
	name = '';
	content = '';
	parent?: Head;
	getAttribute(name: string) {
		return this.attributes.get(name) ?? null;
	}
	setAttribute(name: string, value: string) {
		this.attributes.set(name, value);
	}
	removeAttribute(name: string) {
		this.attributes.delete(name);
	}
	remove() {
		if (this.parent)
			this.parent.children = this.parent.children.filter((node) => node !== this);
	}
}

class Head {
	children: Element[] = [];
	prepend(node: Element) {
		node.parent = this;
		this.children.unshift(node);
	}
}

function page() {
	const documentElement = new Element();
	const head = new Head();
	const document = { documentElement, head, createElement: () => new Element() };
	const node = { ownerDocument: document } as unknown as HTMLElement;
	return { node, documentElement, head };
}

test('immersive colors override existing theme tags only while the lightbox is active', () => {
	const { node, documentElement, head } = page();
	const theme = new Element();
	theme.name = 'theme-color';
	theme.content = '#f8f5ee';
	theme.setAttribute('media', '(prefers-color-scheme: light)');
	head.prepend(theme);
	const action = immersiveChrome(node, false);
	assert.deepEqual(head.children, [theme]);
	assert.equal(documentElement.getAttribute('data-photo-immersive'), null);
	action.update(true);
	action.update(true);
	assert.equal(head.children.length, 2);
	assert.equal(head.children[0].name, 'theme-color');
	assert.equal(head.children[0].content, '#000000');
	assert.equal(documentElement.getAttribute('data-photo-immersive'), '');
	action.update(false);
	assert.deepEqual(head.children, [theme]);
	assert.equal(theme.content, '#f8f5ee');
	assert.equal(theme.getAttribute('media'), '(prefers-color-scheme: light)');
	assert.equal(documentElement.getAttribute('data-photo-immersive'), null);
	action.destroy();
});

test('navigation cleanup restores prior document state and removes temporary metadata', () => {
	const { node, documentElement, head } = page();
	documentElement.setAttribute('data-photo-immersive', 'prior');
	const action = immersiveChrome(node, true);
	action.destroy();
	action.destroy();
	assert.equal(documentElement.getAttribute('data-photo-immersive'), 'prior');
	assert.deepEqual(head.children, []);
});

test('overlapping viewers keep the browser dark until the final active viewer closes', () => {
	const { node, documentElement, head } = page();
	const first = immersiveChrome(node, true);
	const next = immersiveChrome(node, true);
	assert.equal(head.children.length, 1);
	first.destroy();
	assert.equal(head.children[0].content, '#000000');
	assert.equal(documentElement.getAttribute('data-photo-immersive'), '');
	next.update(false);
	assert.equal(documentElement.getAttribute('data-photo-immersive'), null);
	assert.deepEqual(head.children, []);
	next.destroy();
});

test('cleanup preserves a document mode changed by another owner', () => {
	const { node, documentElement, head } = page();
	const action = immersiveChrome(node, true);
	documentElement.setAttribute('data-photo-immersive', 'replacement');
	action.destroy();
	assert.equal(documentElement.getAttribute('data-photo-immersive'), 'replacement');
	assert.deepEqual(head.children, []);
});
