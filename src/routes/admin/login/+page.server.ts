import { fail, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import {
	SESSION_COOKIE,
	adminEnabled,
	checkPassword,
	createSession,
	loginAllowed,
	recordFailedLogin
} from '$lib/server/auth';

export const load: PageServerLoad = ({ locals }) => {
	if (locals.isAdmin) redirect(303, '/admin');
	return { enabled: adminEnabled() };
};

export const actions: Actions = {
	default: async ({ request, cookies, url, getClientAddress }) => {
		if (!adminEnabled()) {
			return fail(503, { message: 'Admin portal is disabled: set ADMIN_PASSWORD in .env' });
		}
		const ip = getClientAddress();
		if (!loginAllowed(ip)) {
			return fail(429, { message: 'Too many attempts. Try again in 15 minutes.' });
		}
		const form = await request.formData();
		const password = String(form.get('password') ?? '');
		if (!checkPassword(password)) {
			recordFailedLogin(ip);
			return fail(401, { message: 'Incorrect password' });
		}
		cookies.set(SESSION_COOKIE, createSession(), {
			path: '/',
			httpOnly: true,
			sameSite: 'lax',
			secure: url.protocol === 'https:',
			maxAge: 60 * 60 * 24 * 14
		});
		const next = url.searchParams.get('next');
		redirect(303, next?.startsWith('/admin') ? next : '/admin');
	}
};
