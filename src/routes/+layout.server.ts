import type { LayoutServerLoad } from './$types';

export const load: LayoutServerLoad = ({ locals }) => ({
	settings: locals.settings,
	isAdmin: locals.isAdmin
});
