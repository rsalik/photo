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
  filmStock: string | null; // e.g. "Kodak Portra 400" (ISO folded in as free text)
}

export interface Photo extends ExifData, FilmData {
  id: string;
  slug: string; // URL-friendly, derived from title at upload time
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
  /** numeric focal-length range bounds in mm (inclusive), e.g. "24"–"105" */
  focalMin?: string;
  focalMax?: string;
  iso?: string;
  q?: string;
  /** '1' restricts to favorites; combines with the other filters */
  favorite?: string;
  /** '1' restricts to analog (film) photos; combines with the other filters */
  analog?: string;
  /** exact film stock name */
  film?: string;
}

/** Option lists offered by the gallery filter bar, derived from the library. */
export interface FilterOptions {
  albums: string[];
  tags: string[];
  cameras: string[];
  lenses: string[];
  locations: string[];
  filmStocks: string[];
  hasAnalog: boolean;
  /** span of focal lengths present in the library (mm), for the range control */
  focalRange: { min: number; max: number } | null;
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
  'focalMin',
  'focalMax',
  'iso',
  'q',
  'favorite',
  'analog',
  'film',
] as const;

export type FontTheme = 'heritage' | 'modern' | 'editorial';

/** Shape of the title scrim: a flat rectangle wash over the whole photo, or a
 *  soft centred ellipse behind the title. Configurable per device since a
 *  full-bleed ellipse reads differently on a phone-width photo. */
export type ScrimShape = 'rectangle' | 'ellipse';

export interface SiteSettings {
  siteTitle: string;
  siteSubtitle: string;
  accentColor: string;
  fontTheme: FontTheme;
  galleryRowHeight: number; // target row height for justified layout (desktop px)
  postcardHoldMs: number; // how long the postcard title stays up
  /** 0 = no scrim, ~1 = the old "standard" baseline, up to ~1.5 = "strong". */
  postcardScrimStrength: number;
  postcardScrimShapeDesktop: ScrimShape;
  postcardScrimShapeMobile: ScrimShape;
}

export const DEFAULT_SETTINGS: SiteSettings = {
  siteTitle: 'Ryan Salik',
  siteSubtitle: 'Photography',
  accentColor: '#1f4633',
  fontTheme: 'heritage',
  galleryRowHeight: 300,
  postcardHoldMs: 2000,
  postcardScrimStrength: 1,
  postcardScrimShapeDesktop: 'rectangle',
  postcardScrimShapeMobile: 'rectangle',
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
