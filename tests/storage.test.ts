import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
import { after, test } from 'node:test';

// R2's SDK returns a mixed body type. Requiring its conversion method catches
// accidental TypeScript-only casts that never produce a web Response stream.
const sdk = `
export class NoSuchKey extends Error {}
export class GetObjectCommand { constructor(input) { this.input = input; } }
export class S3Client {
	async send(command) {
		if (command.input.Key.includes('/missing/')) throw new NoSuchKey();
		if (command.input.Key.includes('/offline/')) throw new Error('Network error');
		return { Body: { transformToWebStream() {
			return new ReadableStream({ start(controller) {
				controller.enqueue(new TextEncoder().encode('photo bytes'));
				controller.close();
			} });
		} } };
	}
}`;
const hooks = registerHooks({
	resolve(specifier, context, nextResolve) {
		if (specifier === '$env/dynamic/private') {
			const env = {
				R2_BUCKET: 'test-bucket',
				R2_ACCOUNT_ID: 'test-account',
				R2_ACCESS_KEY_ID: 'test-key',
				R2_SECRET_ACCESS_KEY: 'test-secret'
			};
			return {
				url: `data:text/javascript,export const env = ${JSON.stringify(env)};`,
				shortCircuit: true
			};
		}
		if (specifier === '@aws-sdk/client-s3') {
			return { url: `data:text/javascript,${encodeURIComponent(sdk)}`, shortCircuit: true };
		}
		return nextResolve(specifier, context);
	}
});
after(() => hooks.deregister());

test('R2 bodies convert to web streams and missing objects remain 404 candidates', async () => {
	const { getDerived } = await import('../src/lib/server/storage');
	const body = await getDerived('existing', 'sm');
	assert.ok(body instanceof ReadableStream);
	assert.equal(await new Response(body).text(), 'photo bytes');
	assert.equal(await getDerived('missing', 'sm'), null);
	assert.equal(await getDerived('../outside', 'sm'), null);
	await assert.rejects(() => getDerived('offline', 'sm'), /Network error/);
});
