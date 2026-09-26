import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { uuidv7 } from "../ids.ts";
import { isImageType, isVideoType, MediaRejected, type Processed, processImage, processProfileImage, processVideo } from "./process.ts";
import type { MediaStorage } from "./storage.ts";
import type { MediaRow, MediaStore } from "./store.ts";

// Unattached uploads are deleted after a day; stuck processing fails after an hour.
const UNATTACHED_TTL_MS = 24 * 60 * 60 * 1000;
const PROCESSING_TIMEOUT_MS = 60 * 60 * 1000;

/** Removes an upload's temp file, and its folder if it's one of ours. */
async function discard(file: string) {
  await rm(file, { force: true });
  const parent = path.dirname(file);
  if (path.basename(parent).startsWith("pinstripe-upload-")) await rm(parent, { recursive: true, force: true });
}

/**
 * Uploads: photos are processed during the request; videos are queued and
 * processed one at a time in the background (the client polls until ready,
 * as with Mastodon). Files go to media storage under `media/<id>/…`.
 */
export class MediaService {
  #queue: Promise<void> = Promise.resolve();

  constructor(
    readonly store: MediaStore,
    readonly storage: MediaStorage,
  ) {}

  url(row: MediaRow): string | null {
    return row.remoteUrl ?? (row.fileKey ? this.storage.url(row.fileKey) : null);
  }

  previewUrl(row: MediaRow): string | null {
    return row.remotePreviewUrl ?? (row.previewKey ? this.storage.url(row.previewKey) : null);
  }

  /**
   * Takes ownership of `upload.file` (a temp file; it and its upload folder
   * are removed when done).
   * Returns the row: ready for photos, processing for videos.
   */
  async upload(upload: { accountId: string; file: string; mimeType: string; description: string }): Promise<MediaRow> {
    const type = isVideoType(upload.mimeType) ? "video" : isImageType(upload.mimeType) ? "image" : null;
    if (!type) {
      await discard(upload.file);
      throw new MediaRejected(`That file type (${upload.mimeType}) isn't supported.`);
    }
    const row = await this.store.create({
      id: uuidv7(),
      accountId: upload.accountId,
      type,
      state: "processing",
      contentType: upload.mimeType,
      description: upload.description.slice(0, 1500),
    });
    if (type === "image") {
      try {
        return await this.#process(row, upload.file, upload.mimeType, processImage);
      } catch (error) {
        await this.store.delete([row.id]);
        throw error;
      }
    }
    this.#queue = this.#queue.then(() => this.#process(row, upload.file, upload.mimeType, processVideo).then(
      () => {},
      () => {},
    ));
    return row;
  }

  /** Resolves once queued processing has finished (for tests and shutdown). */
  idle(): Promise<void> {
    return this.#queue;
  }

  async #process(
    row: MediaRow,
    input: string,
    mimeType: string,
    processor: (input: string, mimeType: string, workDir: string) => Promise<Processed>,
  ): Promise<MediaRow> {
    const work = await mkdtemp(path.join(tmpdir(), "pinstripe-process-"));
    try {
      const out = await processor(input, mimeType, work);
      const fileKey = `media/${row.id}/original.${out.extension}`;
      const previewKey = `media/${row.id}/small.jpg`;
      await this.storage.put(fileKey, out.file, out.contentType);
      await this.storage.put(previewKey, out.preview, "image/jpeg");
      return (await this.store.update(row.id, {
        state: "ready",
        contentType: out.contentType,
        fileKey,
        previewKey,
        blurhash: out.blurhash,
        meta: { width: out.width, height: out.height, duration: out.duration, size: out.size },
      }))!;
    } catch (error) {
      const message = error instanceof MediaRejected ? error.message : "Processing failed.";
      if (!(error instanceof MediaRejected)) console.error("Media processing failed", row.id, error);
      await this.store.update(row.id, { state: "failed", error: message });
      throw error;
    } finally {
      await rm(work, { recursive: true, force: true });
      await discard(input);
    }
  }

  /** Stores a new avatar or banner and returns its key. */
  async profileImage(accountId: string, kind: "avatar" | "header", file: string): Promise<string> {
    const work = await mkdtemp(path.join(tmpdir(), "pinstripe-profile-"));
    try {
      const out = await processProfileImage(file, kind, work);
      const key = `accounts/${accountId}/${kind}-${uuidv7()}.jpg`;
      await this.storage.put(key, out, "image/jpeg");
      return key;
    } finally {
      await rm(work, { recursive: true, force: true });
      await discard(file);
    }
  }

  /** Removes stored files for media rows that are going away. */
  async deleteFiles(rows: MediaRow[]) {
    const keys = rows.flatMap((r) => [r.fileKey, r.previewKey]).filter((k): k is string => !!k);
    await this.storage.delete(keys).catch((error) => console.error("Failed to delete media files", error));
  }

  /** Housekeeping, run periodically: drop abandoned uploads and fail stuck ones. */
  async sweep(now = Date.now()) {
    const abandoned = await this.store.unattachedBefore(new Date(now - UNATTACHED_TTL_MS));
    await this.deleteFiles(abandoned);
    await this.store.delete(abandoned.map((r) => r.id));
    for (const row of await this.store.stuckProcessing(new Date(now - PROCESSING_TIMEOUT_MS))) {
      await this.store.update(row.id, { state: "failed", error: "Processing didn't finish. Please upload again." });
    }
  }
}
