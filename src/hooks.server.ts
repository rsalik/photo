import type { Handle, RequestEvent } from '@sveltejs/kit';
import { SESSION_COOKIE, verifySession } from '$lib/server/auth';
import { getSettings, recordEvents, type AnalyticsEvent } from '$lib/server/db';
import { DEFAULT_SETTINGS, FILTER_KEYS } from '$lib/types';

export const handle: Handle = async ({ event, resolve }) => {
	event.locals.isAdmin = verifySession(event.cookies.get(SESSION_COOKIE));

	const { pathname, search } = event.url;
	if (pathname.startsWith('/admin') && pathname !== '/admin/login' && !event.locals.isAdmin) {
		// Fetch follows redirects, so an API redirect becomes a misleading 200 HTML
		// response. Give admin clients an unambiguous authentication failure.
		const response = pathname.startsWith('/admin/api/')
			? new Response(JSON.stringify({ message: 'Admin session expired' }), {
					status: 401,
					headers: { 'Content-Type': 'application/json' }
				})
			: new Response(null, {
					status: 303,
					headers: { Location: `/admin/login?next=${encodeURIComponent(pathname + search)}` }
				});
		return applySecurityHeaders(response, event);
	}

	// Endpoints do not run the root layout and never consume site settings. This
	// avoids waking the database on every image/CDN redirect and API request.
	const endpointOnly =
		/^\/(api|img|og)(\/|$)/.test(pathname) ||
		pathname.startsWith('/admin/api/') ||
		pathname === '/admin/logout';
	event.locals.settings = endpointOnly
		? DEFAULT_SETTINGS
		: pathname === '/admin/login'
			? await getSettings().catch(() => DEFAULT_SETTINGS)
			: await getSettings();

	const response = await resolve(event);
	// Redirects, 404s, and failed renders are not views. Tracking after resolve
	// also prevents legacy-id → canonical-slug redirects from counting twice.
	if (response.status >= 200 && response.status < 300) trackPageview(event);
	return applySecurityHeaders(response, event);
};

function applySecurityHeaders(response: Response, event: RequestEvent): Response {
	response.headers.set('X-Content-Type-Options', 'nosniff');
	response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
	response.headers.set('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
	response.headers.set(
		'Content-Security-Policy',
		"frame-ancestors 'none'; base-uri 'self'; object-src 'none'"
	);
	if (event.url.protocol === 'https:') {
		response.headers.set('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
	}
	if (event.url.pathname.startsWith('/admin')) response.headers.set('Cache-Control', 'private, no-store');
	return response;
}

/* ---------------------------------------------------------------- analytics
   Anonymous daily rollups (see db-ops/analytics.ts). The write is fire-and-
   forget — a page must never wait on, or fail because of, its own counter. */

const BOT_UA =
	/bot|crawl|spider|slurp|bingpreview|duckduck|baiduspider|yandex|facebookexternalhit|embedly|pinterest|slackbot|whatsapp|telegram|discord|headless/i;

function trackPageview(event: RequestEvent): void {
	const events = pageviewEvents(event);
	if (!events) return;
	const write = recordEvents(events).catch((err) => {
		console.warn('[analytics] failed to record view:', err);
	});
	// on Cloudflare, keep the worker alive past the response for the write
	event.platform?.context?.waitUntil?.(write);
}

/** The rollup increments a request represents — or null when it isn't a
 *  countable visitor page view. */
function pageviewEvents(event: RequestEvent): AnalyticsEvent[] | null {
	if (event.request.method !== 'GET') return null;
	if (event.locals.isAdmin) return null; // own browsing doesn't count
	const { pathname, searchParams } = event.url;
	// only public pages: not admin, not APIs/images/OG cards, not asset files
	if (/^\/(admin|api|img|og)(\/|$)/.test(pathname) || pathname.includes('.')) return null;
	// hover/viewport prefetches aren't views; real client-side navigations are
	if (event.request.headers.has('x-sveltekit-preload-data')) return null;
	const ua = event.request.headers.get('user-agent') ?? '';
	if (!ua || BOT_UA.test(ua)) return null;

	const events: AnalyticsEvent[] = [];
	const photoId = pathname.match(/^\/photo\/([^/]+)$/)?.[1];
	const kind = photoId ? 'photo' : pathname === '/' ? 'gallery' : 'other';
	events.push({ metric: 'page', key: kind });
	if (photoId) events.push({ metric: 'photo', key: photoId });

	if (kind === 'gallery') {
		for (const key of FILTER_KEYS) {
			const value = searchParams.get(key);
			if (!value) continue;
			if (key === 'q') events.push({ metric: 'search' });
			else events.push({ metric: 'filter', key: `${key}:${value}` });
		}
	}

	// external referrers only, and only on full page loads (client-side
	// navigations always come from this site itself)
	if (!event.isDataRequest) {
		const ref = event.request.headers.get('referer');
		if (ref) {
			try {
				const host = new URL(ref).hostname;
				if (host && host !== event.url.hostname) events.push({ metric: 'referrer', key: host });
			} catch {
				/* malformed referrer — ignore */
			}
		}
		events.push({
			metric: 'device',
			key: /ipad|tablet/i.test(ua) ? 'tablet' : /mobi|android/i.test(ua) ? 'mobile' : 'desktop'
		});
	}

	return events;
}
