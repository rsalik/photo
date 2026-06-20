export interface ExifData {
  cameraMake: string | null;
  cameraModel: string | null;
  lens: string | null;
  aperture: string | null; // "f/2.8"
  shutterSpeed: string | null; // "1/250s"
  focalLength: string | null; // "35mm"
  iso: number | null;
  takenAt: string | null; // ISO 8601
}

/** Film details for analog (shot-on-film) photos. */
export interface FilmData {
  analog: boolean; // true → shot on film
  filmStock: string | null; // e.g. "Kodak Portra 400"
  filmIso: string | null; // e.g. "400"
  filmFormat: string | null; // e.g. "35mm", "120"
}

export interface Photo extends ExifData, FilmData {
  id: string; // slug
  title: string;
  description: string | null;
  location: string | null;
  width: number;
  height: number;
  titleColor: string; // hex used for the postcard title
  palette: string[]; // suggested title colors from analysis
  blurData: string; // base64 data URI placeholder
  uploadedAt: string;
  tags: string[];
  albums: string[];
}

export interface GalleryFilters {
  album?: string;
  tag?: string;
  camera?: string;
  lens?: string;
  location?: string;
  aperture?: string;
  shutter?: string;
  focal?: string;
  iso?: string;
  q?: string;
  /** '1' restricts to favorites; combines with the other filters */
  favorite?: string;
  /** '1' restricts to analog (film) photos; combines with the other filters */
  analog?: string;
  /** exact film stock name */
  film?: string;
}

/** Filter keys accepted on the gallery + preview/search endpoints. */
export const FILTER_KEYS = [
  'album',
  'tag',
  'camera',
  'lens',
  'location',
  'aperture',
  'shutter',
  'focal',
  'iso',
  'q',
  'favorite',
  'analog',
  'film',
] as const;

export type FontTheme = 'heritage' | 'modern' | 'editorial';

/** Strength of the scrim + text shadow behind the postcard title. */
export type ScrimStrength = 'off' | 'subtle' | 'standard' | 'strong';

/** Shape of the title scrim: a flat blanket over the whole photo, or a soft
 *  centred ellipse behind the title. */
export type ScrimMode = 'blanket' | 'ellipse';

export const SCRIM_FACTORS: Record<ScrimStrength, number> = {
  off: 0,
  subtle: 0.55,
  standard: 1,
  strong: 1.45,
};

export interface SiteSettings {
  siteTitle: string;
  siteSubtitle: string;
  accentColor: string;
  fontTheme: FontTheme;
  galleryRowHeight: number; // target row height for justified layout (desktop px)
  postcardHoldMs: number; // how long the postcard title stays up
  scrimStrength: ScrimStrength;
  scrimMode: ScrimMode; // blanket vs centred ellipse behind the title
}

export const DEFAULT_SETTINGS: SiteSettings = {
  siteTitle: 'Ryan Salik',
  siteSubtitle: 'Photography',
  accentColor: '#1f4633',
  fontTheme: 'heritage',
  galleryRowHeight: 300,
  postcardHoldMs: 2000,
  scrimStrength: 'standard',
  scrimMode: 'blanket',
};

/** The four derived sizes (longest edge, px) + original. */
export const IMAGE_SIZES = { sm: 480, md: 960, lg: 1600, xl: 2560 } as const;
export type ImageSize = keyof typeof IMAGE_SIZES | 'full';

/** Reserved tag: admin "Favorite" toggle; rendered amber with a star. */
export const FAVORITE_TAG = 'favorite';

/** Fixed postcard title color candidates (also scored during upload). */
export const TITLE_COLOR_PRESETS = [
  { hex: '#fffdf7', name: 'White' },
  { hex: '#edc821', name: 'Postcard yellow' },
  { hex: '#f6e8d2', name: 'Cream' },
  { hex: '#1c1b18', name: 'Ink' },
  { hex: '#dce8e4', name: 'Mist' },
] as const;
