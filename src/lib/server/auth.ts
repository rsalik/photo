import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { env } from '$env/dynamic/private';
import { DATA_DIR } from './db';

export const SESSION_COOKIE = 'pa_session';
const SESSION_TTL_MS = 1000 * 60 * 60 * 24 * 14; // 14 days

function sessionSecret(): string {
	if (env.SESSION_SECRET) return env.SESSION_SECRET;
	const file = path.join(DATA_DIR, '.session-secret');
	if (!fs.existsSync(file)) {
		fs.writeFileSync(file, crypto.randomBytes(32).toString('hex'), { mode: 0o600 });
	}
	return fs.readFileSync(file, 'utf8').trim();
}

const SECRET = sessionSecret();

function sign(payload: string): string {
	return crypto.createHmac('sha256', SECRET).update(payload).digest('base64url');
}

export function createSession(): string {
	const payload = `admin.${Date.now() + SESSION_TTL_MS}`;
	return `${payload}.${sign(payload)}`;
}

export function verifySession(token: string | undefined): boolean {
	if (!token) return false;
	const i = token.lastIndexOf('.');
	if (i < 0) return false;
	const payload = token.slice(0, i);
	const sig = token.slice(i + 1);
	const expected = sign(payload);
	if (sig.length !== expected.length) return false;
	if (!crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return false;
	const expires = Number(payload.split('.')[1]);
	return Number.isFinite(expires) && Date.now() < expires;
}

/* Simple in-memory throttle: max 10 failed attempts per IP per 15 minutes. */
const attempts = new Map<string, { count: number; resetAt: number }>();

export function loginAllowed(ip: string): boolean {
	const entry = attempts.get(ip);
	if (!entry || Date.now() > entry.resetAt) return true;
	return entry.count < 10;
}

export function recordFailedLogin(ip: string): void {
	const entry = attempts.get(ip);
	if (!entry || Date.now() > entry.resetAt) {
		attempts.set(ip, { count: 1, resetAt: Date.now() + 15 * 60 * 1000 });
	} else {
		entry.count += 1;
	}
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
