/** Describe request state and Cloudflare bindings shared by server routes. */
import type { SiteSettings } from '$lib/types';

declare global {
	namespace App {
		interface Locals {
			isAdmin: boolean;
			settings: SiteSettings;
		}
		interface Platform {
			/** Cloudflare execution context, also emulated by the adapter in local development. */
			context?: {
				waitUntil(promise: Promise<unknown>): void;
			};
		}
	}
}

export {};
