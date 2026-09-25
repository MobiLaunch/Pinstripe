import type { MediaRow } from "./store.ts";

export interface MastodonMedia {
  id: string;
  type: "image" | "video" | "gifv" | "unknown";
  /** Null while a video is still processing. */
  url: string | null;
  preview_url: string | null;
  remote_url: string | null;
  preview_remote_url: null;
  text_url: null;
  meta: {
    original?: { width: number; height: number; size: string; aspect: number; duration?: number };
    small?: { width: number; height: number; size: string; aspect: number };
  } | null;
  description: string | null;
  blurhash: string | null;
}

const PREVIEW_WIDTH = 640;

/** Mastodon's MediaAttachment entity. */
export function serializeMedia(
  row: MediaRow,
  urls: { url(row: MediaRow): string | null; previewUrl(row: MediaRow): string | null },
): MastodonMedia {
  const { width, height, duration } = row.meta;
  const dims = (w: number, h: number) => ({ width: w, height: h, size: `${w}x${h}`, aspect: Math.round((w / h) * 1000) / 1000 });
  const small = width && height ? dims(Math.min(width, PREVIEW_WIDTH), Math.round(Math.min(width, PREVIEW_WIDTH) * (height / width))) : null;
  const ready = row.state === "ready";
  return {
    id: row.id,
    // Mastodon calls silent looping GIFs "gifv"; our GIFs stay images.
    type: row.type,
    url: ready ? urls.url(row) : null,
    preview_url: ready ? urls.previewUrl(row) : null,
    remote_url: row.remoteUrl,
    preview_remote_url: null,
    text_url: null,
    meta:
      width && height
        ? { original: { ...dims(width, height), ...(duration ? { duration } : {}) }, ...(small ? { small } : {}) }
        : null,
    description: row.description || null,
    blurhash: row.blurhash,
  };
}
