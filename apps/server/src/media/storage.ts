/**
 * Where uploaded media lives. Keys look like `media/<id>/original.mp4`;
 * `url(key)` is what clients and other servers fetch.
 *
 * - LocalDiskStorage: files under a directory, served by this server at
 *   /media/* (with Range support for video). For development and small setups.
 * - S3Storage: any S3-compatible service (AWS S3, Cloudflare R2, Backblaze
 *   B2, MinIO…), served from `publicUrl`, usually a CDN in front of the bucket.
 */
import { createReadStream } from "node:fs";
import { mkdir, rm, stat, copyFile } from "node:fs/promises";
import path from "node:path";
import { Readable } from "node:stream";
import { DeleteObjectsCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";

export interface MediaStorage {
  /** Stores a file from disk under `key`. */
  put(key: string, filePath: string, contentType: string): Promise<void>;
  /** The public URL for a key. */
  url(key: string): string;
  delete(keys: string[]): Promise<void>;
}

const SAFE_KEY = /^[a-z0-9][a-z0-9/_.-]*$/i;

function assertKey(key: string) {
  if (!SAFE_KEY.test(key) || key.includes("..")) throw new Error(`Unsafe media key: ${key}`);
}

// Files are immutable (a new upload gets a new key), so they can be cached forever.
export const IMMUTABLE = "public, max-age=31536000, immutable";

export class LocalDiskStorage implements MediaStorage {
  constructor(
    readonly dir: string,
    /** e.g. https://pinstripe.social — files are at `${origin}/media/<key>`. */
    private readonly origin: string,
  ) {}

  // The type isn't stored: `serve` works it out from the key's extension.
  async put(key: string, filePath: string, _contentType?: string) {
    assertKey(key);
    const target = path.join(this.dir, key);
    await mkdir(path.dirname(target), { recursive: true });
    await copyFile(filePath, target);
  }

  url(key: string) {
    return new URL(`/media/${key}`, this.origin).href;
  }

  async delete(keys: string[]) {
    await Promise.all(
      keys.map(async (key) => {
        assertKey(key);
        await rm(path.join(this.dir, key), { force: true });
      }),
    );
  }

  /**
   * Serves a stored file, honouring a single `Range: bytes=a-b`, which video
   * players use to seek. Returns null for anything that isn't a stored file.
   */
  async serve(key: string, range: string | undefined, contentType: string): Promise<Response | null> {
    if (!SAFE_KEY.test(key) || key.includes("..")) return null;
    const file = path.join(this.dir, key);
    const info = await stat(file).catch(() => null);
    if (!info?.isFile()) return null;
    const headers: Record<string, string> = {
      "Content-Type": contentType,
      "Accept-Ranges": "bytes",
      "Cache-Control": IMMUTABLE,
      "X-Content-Type-Options": "nosniff",
    };
    const match = range ? /^bytes=(\d*)-(\d*)$/.exec(range) : null;
    if (match && (match[1] || match[2])) {
      let start = match[1] ? Number(match[1]) : info.size - Number(match[2]);
      let end = match[1] && match[2] ? Number(match[2]) : info.size - 1;
      start = Math.max(0, start);
      end = Math.min(end, info.size - 1);
      if (start > end) {
        return new Response(null, { status: 416, headers: { "Content-Range": `bytes */${info.size}` } });
      }
      headers["Content-Range"] = `bytes ${start}-${end}/${info.size}`;
      headers["Content-Length"] = String(end - start + 1);
      return new Response(toWeb(createReadStream(file, { start, end })), { status: 206, headers });
    }
    headers["Content-Length"] = String(info.size);
    return new Response(toWeb(createReadStream(file)), { status: 200, headers });
  }
}

function toWeb(stream: ReturnType<typeof createReadStream>): ReadableStream {
  return Readable.toWeb(stream) as ReadableStream;
}

export interface S3Options {
  bucket: string;
  region: string;
  /** For non-AWS services, e.g. https://<account>.r2.cloudflarestorage.com */
  endpoint?: string;
  accessKeyId: string;
  secretAccessKey: string;
  /** Base URL files are publicly served from (bucket website or CDN). */
  publicUrl: string;
  /** Some S3-compatible services (MinIO) need path-style URLs. */
  forcePathStyle?: boolean;
}

export class S3Storage implements MediaStorage {
  readonly client: S3Client;

  constructor(private readonly options: S3Options) {
    this.client = new S3Client({
      region: options.region,
      endpoint: options.endpoint,
      forcePathStyle: options.forcePathStyle,
      credentials: { accessKeyId: options.accessKeyId, secretAccessKey: options.secretAccessKey },
    });
  }

  async put(key: string, filePath: string, contentType: string) {
    assertKey(key);
    const { size } = await stat(filePath);
    await this.client.send(
      new PutObjectCommand({
        Bucket: this.options.bucket,
        Key: key,
        Body: createReadStream(filePath),
        ContentLength: size,
        ContentType: contentType,
        CacheControl: IMMUTABLE,
      }),
    );
  }

  url(key: string) {
    return `${this.options.publicUrl.replace(/\/+$/, "")}/${key}`;
  }

  async delete(keys: string[]) {
    if (!keys.length) return;
    keys.forEach(assertKey);
    // DeleteObjects takes at most 1000 keys.
    for (let i = 0; i < keys.length; i += 1000) {
      await this.client.send(
        new DeleteObjectsCommand({
          Bucket: this.options.bucket,
          Delete: { Objects: keys.slice(i, i + 1000).map((Key) => ({ Key })), Quiet: true },
        }),
      );
    }
  }
}
