import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { Readable } from 'node:stream';
import { DATA_DIR } from './db-ops/connection';
import { IMAGE_SIZES } from '$lib/types';

/**
 * Image object storage. Backed by Cloudflare R2 (S3 API) when configured, else
 * the local filesystem under DATA_DIR (offline dev). Object keys:
 *   originals/<id>.<ext>
 *   derived/<id>/<size>.jpg          (size ∈ sm|md|lg|xl|full)
 *
 * Serving (`/img/[id]/[size]`) prefers a redirect to R2_PUBLIC_URL (the CDN
 * custom domain); without it, R2 objects are proxied through the server, and
 * with no R2 at all, files are streamed from disk.
 */

import { env } from '$env/dynamic/private';

const safeProcessEnv = typeof process !== 'undefined' ? process.env : {};

const bucket = env.R2_BUCKET || safeProcessEnv.R2_BUCKET;
// Optional private bucket. When omitted, originals still receive an
// unguessable object key, but a separate non-public bucket is preferred.
const originalsBucket = env.R2_ORIGINALS_BUCKET || safeProcessEnv.R2_ORIGINALS_BUCKET || bucket;
const accountId = env.R2_ACCOUNT_ID || safeProcessEnv.R2_ACCOUNT_ID;
const accessKeyId = env.R2_ACCESS_KEY_ID || safeProcessEnv.R2_ACCESS_KEY_ID;
const secretAccessKey = env.R2_SECRET_ACCESS_KEY || safeProcessEnv.R2_SECRET_ACCESS_KEY;
const publicBase = (env.R2_PUBLIC_URL || safeProcessEnv.R2_PUBLIC_URL)?.replace(/\/+$/, '') || null;

export const usingR2 = !!(bucket && accountId && accessKeyId && secretAccessKey);

const PHOTO_ID_RE = /^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/;
export const isSafePhotoId = (id: string): boolean => PHOTO_ID_RE.test(id);

function requireSafePhotoId(id: string): void {
	if (!isSafePhotoId(id)) throw new Error('Invalid photo id');
}

const originalKey = (id: string, ext: string) => `originals/${id}/${crypto.randomUUID()}.${ext}`;
const derivedKey = (id: string, size: string) => `derived/${id}/${size}.jpg`;
const DERIVED_SIZES = [...Object.keys(IMAGE_SIZES), 'full'];

const MIME: Record<string, string> = {
	jpg: 'image/jpeg',
	jpeg: 'image/jpeg',
	png: 'image/png',
	webp: 'image/webp',
	heic: 'image/heic',
	heif: 'image/heif',
	tif: 'image/tiff',
	tiff: 'image/tiff'
};

// Lazily construct the S3 client so the SDK is only loaded when R2 is in use.
type S3 = import('@aws-sdk/client-s3').S3Client;
let _client: Promise<S3> | null = null;
function client(): Promise<S3> {
	if (!_client) {
		_client = import('@aws-sdk/client-s3').then(
			({ S3Client }) =>
				new S3Client({
					region: 'auto',
					endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
					forcePathStyle: true, // R2's wildcard cert doesn't cover bucket-as-subdomain
					credentials: { accessKeyId: accessKeyId!, secretAccessKey: secretAccessKey! }
				})
		);
	}
	return _client;
}

const diskPath = (key: string) => {
	const root = path.resolve(DATA_DIR);
	const full = path.resolve(root, key);
	if (full !== root && !full.startsWith(`${root}${path.sep}`)) {
		throw new Error('Storage path escapes the data directory');
	}
	return full;
};

async function put(
	key: string,
	body: Buffer,
	contentType: string,
	targetBucket = bucket
): Promise<void> {
	if (usingR2) {
		const { PutObjectCommand } = await import('@aws-sdk/client-s3');
		await (
			await client()
		).send(
			new PutObjectCommand({
				Bucket: targetBucket,
				Key: key,
				Body: body,
				ContentType: contentType,
				CacheControl: key.startsWith('derived/')
					? 'public, max-age=31536000, immutable'
					: 'private, no-store'
			})
		);
	} else {
		const full = diskPath(key);
		fs.mkdirSync(path.dirname(full), { recursive: true });
		fs.writeFileSync(full, body);
	}
}

export const putOriginal = (id: string, ext: string, body: Buffer) => {
	requireSafePhotoId(id);
	return put(
		originalKey(id, ext),
		body,
		MIME[ext] ?? 'application/octet-stream',
		originalsBucket
	);
};

export const putDerived = (id: string, size: string, body: Buffer) => {
	requireSafePhotoId(id);
	return put(derivedKey(id, size), body, 'image/jpeg');
};

/** Public CDN URL for a derived size, when R2_PUBLIC_URL is configured. */
export function derivedPublicUrl(id: string, size: string): string | null {
	if (!isSafePhotoId(id)) return null;
	return publicBase ? `${publicBase}/${derivedKey(id, size)}` : null;
}

/** Fetch a derived image as a web stream (R2 proxy) or disk stream. Null if missing. */
export async function getDerived(id: string, size: string): Promise<ReadableStream | null> {
	if (!isSafePhotoId(id)) return null;
	if (usingR2) {
		const { GetObjectCommand, NoSuchKey } = await import('@aws-sdk/client-s3');
		try {
			const res = await (
				await client()
			).send(new GetObjectCommand({ Bucket: bucket, Key: derivedKey(id, size) }));
			return res.Body?.transformToWebStream() ?? null;
		} catch (err) {
			if (err instanceof NoSuchKey) return null;
			throw err;
		}
	}
	const full = diskPath(derivedKey(id, size));
	if (!fs.existsSync(full)) return null;
	return Readable.toWeb(fs.createReadStream(full)) as ReadableStream;
}

/** Remove every object (original + all derived sizes) for a photo. */
export async function deletePhotoAssets(id: string): Promise<void> {
	requireSafePhotoId(id);
	if (usingR2) {
		const { DeleteObjectsCommand, ListObjectsV2Command } = await import('@aws-sdk/client-s3');
		const c = await client();
		const derivedKeys = DERIVED_SIZES.map((s) => derivedKey(id, s));
		await c.send(
			new DeleteObjectsCommand({
				Bucket: bucket,
				Delete: { Objects: derivedKeys.map((Key) => ({ Key })) }
			})
		);
		// Search both buckets: legacy originals lived in the public derived bucket,
		// while new installs can route them to a private bucket.
		for (const sourceBucket of new Set([bucket!, originalsBucket!])) {
			const originalKeys: string[] = [];
			for (const prefix of [`originals/${id}/`, `originals/${id}.`]) {
				const listed = await c.send(
					new ListObjectsV2Command({ Bucket: sourceBucket, Prefix: prefix })
				);
				for (const o of listed.Contents ?? []) if (o.Key) originalKeys.push(o.Key);
			}
			if (originalKeys.length) {
				await c.send(
					new DeleteObjectsCommand({
						Bucket: sourceBucket,
						Delete: { Objects: originalKeys.map((Key) => ({ Key })) }
					})
				);
			}
		}
		return;
	}
	// disk
	try {
		fs.rmSync(diskPath(path.join('derived', id)), { recursive: true, force: true });
		const od = diskPath('originals');
		if (fs.existsSync(od)) {
			fs.rmSync(diskPath(path.join('originals', id)), { recursive: true, force: true });
			for (const f of fs.readdirSync(od)) {
				if (f.startsWith(`${id}.`)) fs.rmSync(path.join(od, f), { force: true });
			}
		}
	} catch {
		// best-effort
	}
}
