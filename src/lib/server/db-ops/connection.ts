import { AsyncLocalStorage } from 'node:async_hooks';
import path from 'node:path';
import { createSchema } from './schema';

/**
 * Postgres-everywhere data layer.
 *
 * - No `DATABASE_URL`  → embedded **PGlite** (WASM Postgres) persisted under
 *   `DATA_DIR/pg`. Zero external services; used for local dev and tests.
 * - `DATABASE_URL` set → **Neon** serverless driver (HTTP). Used in production
 *   (Vercel) and on the laptop when working against the live database.
 *
 * Both speak the same Postgres dialect, so every query in `read.ts`/`write.ts`
 * runs identically in either place.
 */

const safeProcessEnv = typeof process !== 'undefined' ? process.env : {};

export const DATA_DIR = path.resolve(safeProcessEnv.DATA_DIR ?? 'data');
export const ORIGINALS_DIR = path.join(DATA_DIR, 'originals');
export const DERIVED_DIR = path.join(DATA_DIR, 'derived');

/** Minimal async executor — a parameterized query that returns rows. */
export interface Executor {
	query<T = Record<string, unknown>>(text: string, params?: unknown[]): Promise<T[]>;
}

// While inside bulk(), the active transaction's executor is published here so the
// db-op functions route their statements through it without changing signatures.
const txStore = new AsyncLocalStorage<Executor>();

interface Backend {
	exec: Executor;
	/** run fn inside a real transaction if the backend supports one */
	transaction(fn: () => Promise<void>): Promise<void>;
}

let ready: Promise<Backend> | null = null;

async function initBackend(): Promise<Backend> {
	const safeProcessEnv = typeof process !== 'undefined' ? process.env : {};
	let url = safeProcessEnv.DATABASE_URL;
	let svelteEnv: any = null;
	try {
		// @ts-ignore
		svelteEnv = await import('$env/dynamic/private');
		if (svelteEnv?.env?.DATABASE_URL) {
			url = svelteEnv.env.DATABASE_URL;
		}
	} catch (e) {
		// Ignore: we are probably running in a CLI script outside SvelteKit
	}

	if (url) {
		// --- Production / live: Neon serverless (HTTP) ---
		const { neon } = await import('@neondatabase/serverless');
		const sql = neon(url);
		const exec: Executor = {
			query: async <T>(text: string, params: unknown[] = []) =>
				(await sql.query(text, params)) as T[]
		};
		// Neon's HTTP driver is stateless (no interactive transactions). Bulk writes
		// are admin-only and single-user, so their statements run sequentially and
		// each autocommits. (Swap to a WebSocket Pool here if strict atomicity is
		// ever needed.)
		const backend: Backend = { exec, transaction: (fn) => fn() };
		await createSchema(exec);
		return backend;
	}

	// --- Local / tests: embedded PGlite ---
	const fs = await import('node:fs');
	fs.mkdirSync(DATA_DIR, { recursive: true });
	const { PGlite } = await import('@electric-sql/pglite');
	const pg = new PGlite(path.join(DATA_DIR, 'pg'));
	await pg.waitReady;
	const exec: Executor = {
		query: async <T>(text: string, params: unknown[] = []) =>
			(await pg.query<T>(text, params)).rows
	};
	const backend: Backend = {
		exec,
		transaction: (fn) =>
			pg.transaction(async (tx) => {
				const txExec: Executor = {
					query: async <T>(text: string, params: unknown[] = []) =>
						(await tx.query<T>(text, params)).rows
				};
				await txStore.run(txExec, fn);
			})
	};
	await createSchema(exec);
	return backend;
}

function backend(): Promise<Backend> {
	if (!ready) ready = initBackend();
	return ready;
}

/** Run a parameterized query (Postgres `$1, $2…` placeholders), returning rows. */
export async function query<T = Record<string, unknown>>(
	text: string,
	params: unknown[] = []
): Promise<T[]> {
	const active = txStore.getStore();
	if (active) return active.query<T>(text, params);
	return (await backend()).exec.query<T>(text, params);
}

/** Convenience: run a query and return the first row (or null). */
export async function queryOne<T = Record<string, unknown>>(
	text: string,
	params: unknown[] = []
): Promise<T | null> {
	const rows = await query<T>(text, params);
	return rows[0] ?? null;
}

/**
 * Run several writes as one unit. On PGlite this is a real transaction; on Neon
 * HTTP the statements run sequentially (see note above). Inner db-op calls pick
 * up the transaction automatically via AsyncLocalStorage.
 */
export async function bulk(fn: () => Promise<void> | void): Promise<void> {
	const b = await backend();
	await b.transaction(async () => {
		await fn();
	});
}
