import type { PageServerLoad } from './$types';
import { getAlbumPhotos, getAlbumsWithCounts } from '$lib/server/db';

export const load: PageServerLoad = async ({ url }) => {
	const albums = await getAlbumsWithCounts();
	const selected = url.searchParams.get('album') ?? albums[0]?.name ?? '';
	// includeTest: the reorder UI must see every member of the album, or saved
	// positions would interleave with invisible rows
	const photos = selected
		? (await getAlbumPhotos(selected, { includeTest: true })).map((p) => ({
				id: p.id,
				title: p.title,
				width: p.width,
				height: p.height,
				blurData: p.blurData
			}))
		: [];
	return { albums, selected, photos };
};
