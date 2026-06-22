import fs from 'node:fs';
import path from 'node:path';
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
const accountId = env.R2_ACCOUNT_ID || safeProcessEnv.R2_ACCOUNT_ID;
const accessKeyId = env.R2_ACCESS_KEY_ID || safeProcessEnv.R2_ACCESS_KEY_ID;
const secretAccessKey = env.R2_SECRET_ACCESS_KEY || safeProcessEnv.R2_SECRET_ACCESS_KEY;
const publicBase = (env.R2_PUBLIC_URL || safeProcessEnv.R2_PUBLIC_URL)?.replace(/\/+$/, '') || null;

export const usingR2 = !!(bucket && accountId && accessKeyId && secretAccessKey);

const originalKey = (id: string, ext: string) => `originals/${id}.${ext}`;
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

const diskPath = (key: string) => path.join(DATA_DIR, key);

async function put(key: string, body: Buffer, contentType: string): Promise<void> {
	if (usingR2) {
		const { PutObjectCommand } = await import('@aws-sdk/client-s3');
		await (await client()).send(
			new PutObjectCommand({ Bucket: bucket, Key: key, Body: body, ContentType: contentType })
		);
	} else {
		const full = diskPath(key);
		fs.mkdirSync(path.dirname(full), { recursive: true });
		fs.writeFileSync(full, body);
	}
}

export const putOriginal = (id: string, ext: string, body: Buffer) =>
	put(originalKey(id, ext), body, MIME[ext] ?? 'application/octet-stream');

export const putDerived = (id: string, size: string, body: Buffer) =>
	put(derivedKey(id, size), body, 'image/jpeg');

/** Store an Open-Graph share card under og/<path>.jpg. */
export const putOg = (path: string, body: Buffer) => put(`og/${path}.jpg`, body, 'image/jpeg');

/** Absolute public URL for an OG card (null without a CDN domain configured). */
export const ogPublicUrl = (path: string): string | null =>
	publicBase ? `${publicBase}/og/${path}.jpg` : null;

/** Public CDN URL for a derived size, when R2_PUBLIC_URL is configured. */
export function derivedPublicUrl(id: string, size: string): string | null {
	return publicBase ? `${publicBase}/${derivedKey(id, size)}` : null;
}

/** Fetch a derived image as a web stream (R2 proxy) or disk stream. Null if missing. */
export async function getDerived(
	id: string,
	size: string
): Promise<ReadableStream | null> {
	if (usingR2) {
		const { GetObjectCommand, NoSuchKey } = await import('@aws-sdk/client-s3');
		try {
			const res = await (await client()).send(
				new GetObjectCommand({ Bucket: bucket, Key: derivedKey(id, size) })
			);
			return res.Body ? (res.Body as Readable as unknown as ReadableStream) : null;
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
	if (usingR2) {
		const { DeleteObjectsCommand, ListObjectsV2Command } = await import('@aws-sdk/client-s3');
		const c = await client();
		const keys: string[] = DERIVED_SIZES.map((s) => derivedKey(id, s));
		// originals keep their source extension, so list them by prefix
		const listed = await c.send(
			new ListObjectsV2Command({ Bucket: bucket, Prefix: `originals/${id}.` })
		);
		for (const o of listed.Contents ?? []) if (o.Key) keys.push(o.Key);
		await c.send(
			new DeleteObjectsCommand({ Bucket: bucket, Delete: { Objects: keys.map((Key) => ({ Key })) } })
		);
		return;
	}
	// disk
	try {
		fs.rmSync(path.join(DATA_DIR, 'derived', id), { recursive: true, force: true });
		const od = path.join(DATA_DIR, 'originals');
		if (fs.existsSync(od)) {
			for (const f of fs.readdirSync(od)) {
				if (f.startsWith(`${id}.`)) fs.rmSync(path.join(od, f), { force: true });
			}
		}
	} catch {
		// best-effort
	}
}
