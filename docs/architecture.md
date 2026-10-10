# Architecture

## Runtime boundaries

| Layer             | Location                                | Responsibility                                                                            |
| ----------------- | --------------------------------------- | ----------------------------------------------------------------------------------------- |
| Interface         | `src/routes`, `src/lib/components`      | Server-rendered gallery, photo presentation, filters, search, and admin screens           |
| Data access       | `src/lib/server/db-ops`                 | Parameterized Postgres queries, schema initialization, settings, and analytics            |
| Image preparation | `src/lib/server/images.ts`, `exif.ts`   | Local resizing, orientation correction, metadata extraction, and postcard color selection |
| Image storage     | `src/lib/server/storage.ts`             | Local files or R2 objects, separate original storage, and public display URLs             |
| Request handling  | `src/hooks.server.ts`                   | Admin authentication, response headers, settings, and aggregate page counters             |
| Share images      | `src/routes/og`, `src/lib/server/og.ts` | Request-time Open Graph cards using `@cf-wasm/og`                                         |

Modules in `src/lib/server` stay on the server. Browser-facing image source helpers live in `src/lib/image-sources.ts`; gallery filters share one parser and serializer in `src/lib/filters.ts`.

## Photograph lifecycle

1. The local admin portal submits a photograph and its optional title, location, tags, and album assignments.
2. Upload processing extracts EXIF, corrects image orientation, generates display JPEGs and an inline placeholder, and chooses title-color candidates.
3. Image objects are stored under a stable ID. Metadata is written to Postgres with an editable, human-readable slug for the public URL.
4. Gallery pages load metadata on the server and choose display images for each layout. The photo page upgrades its image while the postcard sequence runs.
5. When a public R2 domain is configured, `/img/[id]/[size]` redirects to the cached display object. Otherwise the application streams the image from configured storage.

Display sizes are defined in `src/lib/types.ts`: 480, 960, 1600, and 2560 pixels on the longest edge, plus a full-resolution JPEG. Derived JPEGs use immutable cache headers. Original uploads are preserved separately; `R2_ORIGINALS_BUCKET` provides a private bucket for source files.

The browser selects sources using the displayed width, including postcard transforms, device pixel density, and native page zoom. When the full-resolution JPEG is needed, one useful existing derivative can appear first. Entering the lightbox or using native pinch zoom explicitly requests full resolution on every device. `progressive-photo.ts` owns source promotion and ignores stale navigation results; `image-loading.ts` shares fetch/decode work and bounds retained image memory.

Gallery tiles prepare their responsive image ahead of the viewport. Hover, keyboard focus, and tap intent prepare a resized detail preview. This speculative work uses a small queue and respects reported data-saving and slow-connection preferences; opening a photograph starts its required loads directly.

## Data model

Photographs contain dimensions, presentation settings, capture metadata, and their public slug. Tags and albums have separate tables with join tables for membership. Album order, site settings, and daily analytics live alongside the photo catalog.

Schema initialization is idempotent and runs when the database connection is first opened. With no `DATABASE_URL`, PGlite persists to `data/pg` (or `DATA_DIR/pg`). With a connection URL, the application uses Neon's HTTP driver.

## Interaction details

- Filters serialize to query parameters, making filtered galleries linkable and preserving context on a photo detail page.
- Gallery-to-photo navigation uses the browser's View Transitions API where available; the application also works without it.
- Photo presentation accounts for image aspect ratio and viewport size. Users can skip the opening sequence, and reduced-motion preferences are respected.
- Short landscape windows compare the image space available beside and above metadata. Regular photographs generally use a compact sidebar; panoramas retain a footer when that preserves more image area. The immersive view fades the paper background to black.
- The photo surface owns pinch and pan gestures; metadata keeps native scrolling and accessibility zoom. Transform raster hints are limited to the opening animation so interactive zoom can redraw at the enlarged scale. Immersive mode also darkens the document canvas and supplies a temporary browser theme hint; native browser toolbars can override that hint.
- A shared command palette exposes search and metadata navigation. Related photographs and previous/next links retain gallery context.

## Tradeoffs

- **Local ingestion.** Native image work runs on my machine, so production needs no upload-processing service. New photos can only be published from the local admin portal.
- **Two database transports.** PGlite supports interactive transactions; Neon's HTTP driver autocommits each statement, so `bulk()` is not atomic against Neon. Anything needing strict multi-statement atomicity would need a different approach.
- **Approximate analytics.** Counters are aggregated by day, page, photo, filter, referrer hostname and device class, skipping bots, admin browsing and prefetches. They are page activity, not unique visitors.
- **Admin auth.** A signed, expiring cookie protects the single-owner admin. `SESSION_SECRET` must stay stable in production, and login throttling is per-instance.
- **Cookie override.** `package.json` pins `cookie@0.7.2` for SvelteKit to pick up an input-validation fix ([context](https://github.com/sveltejs/kit/issues/13089#issuecomment-2510265451)); drop it once SvelteKit updates.
