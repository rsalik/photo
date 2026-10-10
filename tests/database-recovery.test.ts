import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
import { after, test } from 'node:test';

// Exercise the production connection lifecycle without contacting a service.
// The first schema query simulates a transient Neon error during cold start.
const driver = `
let attempts = 0;
export function neon() {
	const fail = attempts++ === 0;
	return { query: async (sql) => {
		if (fail) throw new Error('Temporary database outage');
		return sql === 'SELECT 1 AS value' ? [{ value: 1 }] : [];
	} };
}`;
const hooks = registerHooks({
	resolve(specifier, context, nextResolve) {
		if (specifier === '$env/dynamic/private') {
			return {
				url: 'data:text/javascript,export const env = { DATABASE_URL: "test-only" };',
				shortCircuit: true
			};
		}
		if (specifier === '@neondatabase/serverless') {
			return {
				url: `data:text/javascript,${encodeURIComponent(driver)}`,
				shortCircuit: true
			};
		}
		return nextResolve(specifier, context);
	}
});
after(() => hooks.deregister());

test('concurrent requests share a failed cold start and a later request reconnects', async () => {
	const { query, closeDatabase } = await import('../src/lib/server/db-ops/connection');
	const attempts = await Promise.allSettled(
		Array.from({ length: 3 }, () => query('SELECT 1 AS value'))
	);
	for (const attempt of attempts) {
		assert.equal(attempt.status, 'rejected');
		if (attempt.status === 'rejected')
			assert.match(attempt.reason.message, /Temporary database outage/);
	}
	assert.deepEqual(await query('SELECT 1 AS value'), [{ value: 1 }]);
	// HTTP connections have no close method; cleanup is still safe and a later
	// script can establish a fresh connection.
	await closeDatabase();
	assert.deepEqual(await query('SELECT 1 AS value'), [{ value: 1 }]);
});
