import type { PageServerLoad } from './$types';
import { getAlbumPhotos, getAlbumsWithCounts } from '$lib/server/db';

export const load: PageServerLoad = async ({ url }) => {
	const albums = await getAlbumsWithCounts();
	const selected = url.searchParams.get('album') ?? albums[0]?.name ?? '';
	const photos = selected
		? (await getAlbumPhotos(selected)).map((p) => ({
				id: p.id,
				title: p.title,
				width: p.width,
				height: p.height,
				blurData: p.blurData
			}))
		: [];
	return { albums, selected, photos };
};
