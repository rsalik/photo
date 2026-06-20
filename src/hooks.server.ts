import { redirect, type Handle } from '@sveltejs/kit';
import { SESSION_COOKIE, verifySession } from '$lib/server/auth';
import { getSettings } from '$lib/server/db';

export const handle: Handle = async ({ event, resolve }) => {
	event.locals.isAdmin = verifySession(event.cookies.get(SESSION_COOKIE));
	event.locals.settings = await getSettings();

	const { pathname } = event.url;
	if (pathname.startsWith('/admin') && pathname !== '/admin/login' && !event.locals.isAdmin) {
		redirect(303, `/admin/login?next=${encodeURIComponent(pathname)}`);
	}

	return resolve(event);
};
