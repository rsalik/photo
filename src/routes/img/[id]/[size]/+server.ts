import fs from 'node:fs';
import { Readable } from 'node:stream';
import { error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { derivedPath } from '$lib/server/images';

export const GET: RequestHandler = async ({ params, setHeaders }) => {
	const size = params.size.replace(/\.jpg$/, '');
	const filePath = derivedPath(params.id, size);
	if (!filePath) error(404, 'Image not found');

	const stat = fs.statSync(filePath);
	setHeaders({
		'Content-Type': 'image/jpeg',
		'Content-Length': String(stat.size),
		'Cache-Control': 'public, max-age=31536000, immutable'
	});
	return new Response(Readable.toWeb(fs.createReadStream(filePath)) as ReadableStream);
};
