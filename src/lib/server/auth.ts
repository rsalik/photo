import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { env } from '$env/dynamic/private';
import { DATA_DIR } from './db';

export const SESSION_COOKIE = 'pa_session';
const SESSION_TTL_MS = 1000 * 60 * 60 * 24 * 14; // 14 days

function sessionSecret(): string {
	if (env.SESSION_SECRET) return env.SESSION_SECRET;
	const production = (env.NODE_ENV || process.env.NODE_ENV) === 'production';
	if (production) {
		throw new Error('SESSION_SECRET is required when the admin portal runs in production');
	}
	// In production (serverless), SESSION_SECRET env var is required.
	// Filesystem fallback is for local dev only.
	try {
		const file = path.join(DATA_DIR, '.session-secret');
		if (!fs.existsSync(file)) {
			fs.writeFileSync(file, crypto.randomBytes(32).toString('hex'), { mode: 0o600 });
		}
		return fs.readFileSync(file, 'utf8').trim();
	} catch {
		// No filesystem available — generate an ephemeral secret.
		// Sessions won't survive cold starts; set SESSION_SECRET for persistence.
		return crypto.randomBytes(32).toString('hex');
	}
}

let _secret: string | null = null;
function getSecret(): string {
	if (!_secret) {
		_secret = sessionSecret();
	}
	return _secret;
}

function sign(payload: string): string {
	return crypto.createHmac('sha256', getSecret()).update(payload).digest('base64url');
}

export function createSession(): string {
	const payload = `admin.${Date.now() + SESSION_TTL_MS}`;
	return `${payload}.${sign(payload)}`;
}

export function verifySession(token: string | undefined): boolean {
	if (!token || token.length > 512) return false;
	// Validate the wire format before comparing byte buffers: equal JavaScript
	// string lengths do not imply equal byte lengths for a forged Unicode cookie.
	const match = /^(admin\.(\d{1,16}))\.([A-Za-z0-9_-]{43})$/.exec(token);
	if (!match) return false;
	const [, payload, expiresRaw, sig] = match;
	const expires = Number(expiresRaw);
	if (!Number.isSafeInteger(expires) || Date.now() >= expires) return false;
	const expected = sign(payload);
	return crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected));
}

/* Simple in-memory throttle: max 10 failed attempts per IP per 15 minutes. */
const attempts = new Map<string, { count: number; resetAt: number }>();

export function loginAllowed(ip: string): boolean {
	const entry = attempts.get(ip);
	if (!entry) return true;
	if (Date.now() > entry.resetAt) {
		attempts.delete(ip);
		return true;
	}
	return entry.count < 10;
}

export function recordFailedLogin(ip: string): void {
	if (attempts.size >= 1000 && !attempts.has(ip)) {
		const now = Date.now();
		for (const [key, value] of attempts) if (value.resetAt < now) attempts.delete(key);
		// Keep the process memory bounded even during a burst of spoofed addresses.
		// Map iteration is insertion ordered, so this evicts the oldest windows first.
		while (attempts.size >= 1000) {
			const oldest = attempts.keys().next().value;
			if (oldest === undefined) break;
			attempts.delete(oldest);
		}
	}
	const entry = attempts.get(ip);
	if (!entry || Date.now() > entry.resetAt) {
		attempts.set(ip, { count: 1, resetAt: Date.now() + 15 * 60 * 1000 });
	} else {
		entry.count += 1;
	}
}

export function clearFailedLogins(ip: string): void {
	attempts.delete(ip);
}

export function checkPassword(password: string): boolean {
	const expected = env.ADMIN_PASSWORD;
	if (!expected) return false; // portal disabled without a configured password
	const a = crypto.createHash('sha256').update(password).digest();
	const b = crypto.createHash('sha256').update(expected).digest();
	return crypto.timingSafeEqual(a, b);
}

export function adminEnabled(): boolean {
	return !!env.ADMIN_PASSWORD;
}
