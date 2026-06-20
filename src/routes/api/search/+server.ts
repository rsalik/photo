import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getFilterOptions, getPhoto, listPhotos } from '$lib/server/db';
import { FAVORITE_TAG, type Photo } from '$lib/types';

const shape = (photos: Photo[]) =>
  photos.map((p) => ({
    id: p.id,
    title: p.title,
    location: p.location,
    width: p.width,
    height: p.height,
    blurData: p.blurData,
  }));

/**
 * Site-wide search for the public command palette.
 *
 * `context` holds the current photo's own album/tag/camera/location facets — the
 * palette surfaces these *first* ("From this photograph") but still returns the
 * full global results below, so everything stays reachable. When a query is
 * present, context facets are filtered by it too, so a contextual match ("Europe"
 * on a Europe-tagged photo) outranks an unrelated global one ("Eclipse").
 */
export const GET: RequestHandler = async ({ url, setHeaders }) => {
  const q = (url.searchParams.get('q') ?? '').trim().toLowerCase();
  const contextId = url.searchParams.get('photo');
  setHeaders({ 'Cache-Control': 'private, max-age=15' });

  const matches = (name: string) => !q || name.toLowerCase().includes(q);
  const isFav = (t: string) => t.toLowerCase() === FAVORITE_TAG;

  let context: { albums: string[]; tags: string[]; cameras: string[]; locations: string[]; favorite: boolean } | null =
    null;
  if (contextId) {
    const photo = await getPhoto(contextId);
    if (photo) {
      context = {
        albums: photo.albums.filter(matches),
        tags: photo.tags.filter((t) => !isFav(t) && matches(t)),
        cameras: photo.cameraModel && matches(photo.cameraModel) ? [photo.cameraModel] : [],
        locations: photo.location && matches(photo.location) ? [photo.location] : [],
        favorite: photo.tags.some(isFav) && (matches('favorites') || matches('favorite')),
      };
    }
  }

  const options = await getFilterOptions();
  const match = (names: string[]) => names.filter(matches).slice(0, 6);

  return json({
    context,
    photos: shape((q ? await listPhotos({ q }) : await listPhotos()).slice(0, 6)),
    albums: match(options.albums),
    tags: match(options.tags),
    cameras: match(options.cameras),
    locations: match(options.locations),
  });
};
