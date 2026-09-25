/**
 * Mastodon's media API, plus serving locally stored files:
 *
 *   POST /api/v2/media        upload (multipart `file`, optional `description`);
 *                             200 for photos, 202 while a video processes
 *   GET  /api/v1/media/:id    206 while processing, 200 when ready, 422 if it failed
 *   PUT  /api/v1/media/:id    change the description
 *   GET  /media/*             files from LocalDiskStorage (Range supported)
 */
import { createWriteStream } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { IMAGE_LIMITS, VIDEO_LIMITS } from "@pinstripe/core";
import Busboy from "busboy";
import { type Context, Hono } from "hono";
import { type AuthEnv, requireUser } from "../auth/middleware.ts";
import { notFound, readParams } from "../http.ts";
import { type MastodonMedia, serializeMedia } from "./serialize.ts";
import { isVideoType, MediaRejected } from "./process.ts";
import type { MediaService } from "./service.ts";
import { LocalDiskStorage } from "./storage.ts";

const CONTENT_TYPES: Record<string, string> = {
  jpg: "image/jpeg",
  png: "image/png",
  gif: "image/gif",
  mp4: "video/mp4",
};

class TooLarge extends Error {}

/**
 * Streams the multipart `file` part to a temp file, stopping as soon as it
 * passes the limit for its type. Returns the other fields too.
 */
async function receiveUpload(c: Context) {
  const type = c.req.header("content-type") ?? "";
  if (!type.includes("multipart/form-data") || !c.req.raw.body) return null;
  const dir = await mkdtemp(path.join(tmpdir(), "pinstripe-upload-"));
  const fields: Record<string, string> = {};
  let file: { path: string; mimeType: string } | null = null;

  const source = Readable.fromWeb(c.req.raw.body as never);
  // Stopping only the file stream would leave the parser waiting; stop the whole request.
  const abort = (error: Error) => source.destroy(error);
  const busboy = Busboy({
    headers: { "content-type": type },
    limits: { files: 1, fields: 10, fileSize: VIDEO_LIMITS.maxBytes + 1 },
  });
  const done = new Promise<void>((resolve, reject) => {
    busboy.on("field", (name, value) => {
      fields[name] = value;
    });
    busboy.on("file", (name, stream, info) => {
      if (name !== "file" || file) {
        stream.resume();
        return;
      }
      const target = path.join(dir, "upload");
      const limit = isVideoType(info.mimeType) ? VIDEO_LIMITS.maxBytes : IMAGE_LIMITS.maxBytes;
      let bytes = 0;
      stream.on("data", (chunk: Buffer) => {
        bytes += chunk.length;
        if (bytes > limit) abort(new TooLarge());
      });
      stream.on("limit", () => abort(new TooLarge()));
      file = { path: target, mimeType: info.mimeType };
      pipeline(stream, createWriteStream(target)).catch(reject);
    });
    busboy.on("close", resolve);
    busboy.on("error", reject);
  });
  try {
    await Promise.all([pipeline(source, busboy), done]);
  } catch (error) {
    await rm(dir, { recursive: true, force: true });
    if (error instanceof TooLarge || (error as Error)?.cause instanceof TooLarge) throw new TooLarge();
    throw error;
  }
  return { dir, file: file as { path: string; mimeType: string } | null, fields };
}

export function mediaRoutes({ media }: { media: MediaService }) {
  const app = new Hono<AuthEnv>();
  const json = (row: Parameters<typeof serializeMedia>[0]): MastodonMedia => serializeMedia(row, media);

  app.post("/api/v2/media", async (c) => {
    const auth = requireUser(c, "write:media");
    if (!auth.ok) return auth.response;
    let received: Awaited<ReturnType<typeof receiveUpload>>;
    try {
      received = await receiveUpload(c);
    } catch (error) {
      if (error instanceof TooLarge) return c.json({ error: "File is too large" }, 413);
      return c.json({ error: "Upload failed" }, 400);
    }
    if (!received?.file) {
      if (received) await rm(received.dir, { recursive: true, force: true });
      return c.json({ error: "Validation failed: File can't be blank" }, 422);
    }
    try {
      const row = await media.upload({
        accountId: auth.value.account.id,
        file: received.file.path,
        mimeType: received.file.mimeType,
        description: received.fields.description ?? "",
      });
      return c.json(json(row), row.state === "ready" ? 200 : 202);
    } catch (error) {
      // media.upload has already cleaned up the temp file.
      if (error instanceof MediaRejected) return c.json({ error: `Validation failed: ${error.message}` }, 422);
      throw error;
    }
  });

  app.get("/api/v1/media/:id", async (c) => {
    const auth = requireUser(c, "write:media");
    if (!auth.ok) return auth.response;
    const row = await media.store.get(c.req.param("id"));
    if (!row || row.accountId !== auth.value.account.id) return notFound(c);
    if (row.state === "failed") return c.json({ error: row.error ?? "Processing failed" }, 422);
    return c.json(json(row), row.state === "processing" ? 206 : 200);
  });

  app.put("/api/v1/media/:id", async (c) => {
    const auth = requireUser(c, "write:media");
    if (!auth.ok) return auth.response;
    const row = await media.store.get(c.req.param("id"));
    if (!row || row.accountId !== auth.value.account.id) return notFound(c);
    const p = await readParams(c);
    const updated = p.description !== undefined ? await media.store.update(row.id, { description: p.description.slice(0, 1500) }) : row;
    return c.json(json(updated!));
  });

  if (media.storage instanceof LocalDiskStorage) {
    const storage = media.storage;
    app.get("/media/*", async (c) => {
      const key = decodeURIComponent(new URL(c.req.url).pathname.replace(/^\/media\//, ""));
      const type = CONTENT_TYPES[key.split(".").pop() ?? ""];
      const res = type ? await storage.serve(key, c.req.header("range"), type) : null;
      return res ?? c.notFound();
    });
  }

  return app;
}
