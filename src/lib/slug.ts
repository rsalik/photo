/** Turn a title into a URL-safe slug. */
export function slugify(input: string): string {
	return (
		input
			.normalize('NFKD')
			.replace(/[\u0300-\u036f]/g, '')
			.toLowerCase()
			.replace(/[^a-z0-9]+/g, '-')
			.replace(/^-+|-+$/g, '')
			.slice(0, 80) || 'photo'
	);
}

/** Derive a presentable default title from a file name. */
export function titleFromFilename(name: string): string {
	const base = name.replace(/\.[^.]+$/, '').replace(/[_-]+/g, ' ').trim();
	if (/^(img|dsc|dscf|dji|pxl|p|_mg)?\s*\d+\s*$/i.test(base)) return base.toUpperCase();
	return base.replace(/\b\w/g, (c) => c.toUpperCase());
}
