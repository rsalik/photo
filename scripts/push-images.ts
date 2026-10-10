/**
 * Upload the local image tree (data/originals + data/derived) to R2, preserving
 * keys (legacy originals/<id>.<ext> or nested originals, plus
 * derived/<id>/<size>.jpg). Skips objects already present, so it's safe to
 * re-run / resume. When R2_ORIGINALS_BUCKET is set, a verified private copy
 * replaces any matching original left in the public derived bucket.
 *
 *   R2_BUCKET=… R2_ACCOUNT_ID=… R2_ACCESS_KEY_ID=… R2_SECRET_ACCESS_KEY=… npm run push-images
 */
import fs from 'node:fs';
import path from 'node:path';
import {
	S3Client,
	PutObjectCommand,
	HeadObjectCommand,
	DeleteObjectCommand
} from '@aws-sdk/client-s3';

const { R2_BUCKET, R2_ORIGINALS_BUCKET, R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY } = process.env;
if (!R2_BUCKET || !R2_ACCOUNT_ID || !R2_ACCESS_KEY_ID || !R2_SECRET_ACCESS_KEY) {
	console.error('Set R2_BUCKET, R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY.');
	process.exit(1);
}

const s3 = new S3Client({
	region: 'auto',
	endpoint: `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
	forcePathStyle: true,
	credentials: { accessKeyId: R2_ACCESS_KEY_ID, secretAccessKey: R2_SECRET_ACCESS_KEY }
});

const DATA = path.resolve('data');
const MIME: Record<string, string> = {
	'.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp',
	'.heic': 'image/heic', '.heif': 'image/heif', '.tif': 'image/tiff', '.tiff': 'image/tiff'
};

function* walk(dir: string): Generator<string> {
	if (!fs.existsSync(dir)) return;
	for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
		const p = path.join(dir, e.name);
		if (e.isDirectory()) yield* walk(p);
		else yield p;
	}
}

const targetBucket = (key: string) =>
	key.startsWith('originals/') ? R2_ORIGINALS_BUCKET || R2_BUCKET! : R2_BUCKET!;

async function exists(key: string): Promise<boolean> {
	try {
		await s3.send(new HeadObjectCommand({ Bucket: targetBucket(key), Key: key }));
		return true;
	} catch {
		return false;
	}
}

async function main() {
	const files = [...walk(path.join(DATA, 'originals')), ...walk(path.join(DATA, 'derived'))];
	let uploaded = 0,
		skipped = 0,
		privatized = 0,
		done = 0;
	const CONCURRENCY = 8;

	async function worker(queue: string[]) {
		for (let f = queue.pop(); f; f = queue.pop()) {
			const key = path.relative(DATA, f).split(path.sep).join('/');
			if (await exists(key)) {
				skipped++;
			} else {
				await s3.send(
					new PutObjectCommand({
						Bucket: targetBucket(key),
						Key: key,
							Body: fs.readFileSync(f),
							ContentType: MIME[path.extname(f).toLowerCase()] ?? 'application/octet-stream',
							CacheControl: key.startsWith('derived/')
								? 'public, max-age=31536000, immutable'
								: 'private, no-store'
						})
					);
					uploaded++;
				}
				if (key.startsWith('originals/') && R2_ORIGINALS_BUCKET && R2_ORIGINALS_BUCKET !== R2_BUCKET) {
					try {
						await s3.send(new HeadObjectCommand({ Bucket: R2_BUCKET, Key: key }));
						await s3.send(new DeleteObjectCommand({ Bucket: R2_BUCKET, Key: key }));
						privatized++;
					} catch {
						// No legacy public copy exists.
					}
				}
			if (++done % 25 === 0) console.log(`  ${done}/${files.length}…`);
		}
	}

	const queue = [...files];
	await Promise.all(Array.from({ length: CONCURRENCY }, () => worker(queue)));
	console.log(
		`Done. Uploaded ${uploaded}, skipped ${skipped} existing, privatized ${privatized}, of ${files.length} files.`
	);
	process.exit(0);
}

main().catch((err) => {
	console.error('push-images failed:', err);
	process.exit(1);
});
