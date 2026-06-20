import type { SiteSettings } from '$lib/types';

declare global {
	namespace App {
		interface Locals {
			isAdmin: boolean;
			settings: SiteSettings;
		}
	}
}

export {};
