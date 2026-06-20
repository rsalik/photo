import { error, json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import {
  addTag,
  addToAlbum,
  bulk,
  getPhoto,
  removeFromAlbum,
  removeTag,
  titleExists,
  updatePhoto,
} from '$lib/server/db';

interface PatchBody {
  title?: string;
  description?: string | null;
  location?: string | null;
  titleColor?: string;
  takenAt?: string | null;
  cameraMake?: string | null;
  cameraModel?: string | null;
  lens?: string | null;
  aperture?: string | null;
  shutterSpeed?: string | null;
  focalLength?: string | null;
  iso?: number | null;
  analog?: boolean;
  filmStock?: string | null;
  filmIso?: string | null;
  filmFormat?: string | null;
  tags?: string[];
  albums?: string[];
}

export const PATCH: RequestHandler = async ({ params, request }) => {
  const photo = await getPhoto(params.id);
  if (!photo) error(404, 'Photo not found');
  const body = (await request.json()) as PatchBody;

  if (body.title !== undefined) {
    const title = body.title.trim();
    if (!title) error(400, 'Title cannot be empty');
    if (title.toLowerCase() !== photo.title.toLowerCase() && (await titleExists(title))) {
      error(409, `A photo titled “${title}” already exists`);
    }
  }
  if (body.titleColor !== undefined && !/^#[0-9a-fA-F]{6}$/.test(body.titleColor)) {
    error(400, 'Title color must be a hex value like #ffffff');
  }

  await bulk(async () => {
    await updatePhoto(params.id, {
      ...(body.title !== undefined && { title: body.title.trim() }),
      ...(body.description !== undefined && { description: body.description?.trim() || null }),
      ...(body.location !== undefined && { location: body.location?.trim() || null }),
      ...(body.titleColor !== undefined && { titleColor: body.titleColor }),
      ...(body.takenAt !== undefined && { takenAt: body.takenAt }),
      ...(body.cameraMake !== undefined && { cameraMake: body.cameraMake?.trim() || null }),
      ...(body.cameraModel !== undefined && { cameraModel: body.cameraModel?.trim() || null }),
      ...(body.lens !== undefined && { lens: body.lens?.trim() || null }),
      ...(body.aperture !== undefined && { aperture: body.aperture?.trim() || null }),
      ...(body.shutterSpeed !== undefined && { shutterSpeed: body.shutterSpeed?.trim() || null }),
      ...(body.focalLength !== undefined && { focalLength: body.focalLength?.trim() || null }),
      ...(body.iso !== undefined && { iso: body.iso ?? null }),
      ...(body.analog !== undefined && { analog: body.analog }),
      ...(body.filmStock !== undefined && { filmStock: body.filmStock?.trim() || null }),
      ...(body.filmIso !== undefined && { filmIso: body.filmIso?.trim() || null }),
      ...(body.filmFormat !== undefined && { filmFormat: body.filmFormat?.trim() || null }),
    });
    if (body.tags) {
      const next = new Set(body.tags.map((t) => t.trim().toLowerCase()).filter(Boolean));
      for (const tag of photo.tags) if (!next.has(tag.toLowerCase())) await removeTag(params.id, tag);
      for (const tag of body.tags) await addTag(params.id, tag);
    }
    if (body.albums) {
      const next = new Set(body.albums.map((a) => a.trim().toLowerCase()).filter(Boolean));
      for (const album of photo.albums) if (!next.has(album.toLowerCase())) await removeFromAlbum(params.id, album);
      for (const album of body.albums) await addToAlbum(params.id, album);
    }
  });

  return json(await getPhoto(params.id));
};
