/**
 * Upload limits. The server enforces these; the app checks them before
 * uploading so people get an error before waiting on a slow upload.
 */

const MB = 1024 * 1024;

export const VIDEO_LIMITS = {
  maxDurationSeconds: 60,
  /** Up to 1080p in either orientation: 1920×1080 or 1080×1920. */
  maxLongEdge: 1920,
  maxShortEdge: 1080,
  /**
   * A minute of 1080p at a generous ~25 Mbps. Uploads are transcoded
   * afterwards, so this only bounds what people can send.
   */
  maxBytes: 200 * MB,
  mimeTypes: ["video/mp4", "video/quicktime", "video/webm"],
} as const;

export const IMAGE_LIMITS = {
  maxBytes: 15 * MB,
  mimeTypes: ["image/jpeg", "image/png", "image/webp", "image/heic", "image/gif"],
} as const;

export interface VideoInfo {
  mimeType: string;
  bytes: number;
  width: number;
  height: number;
  durationSeconds: number;
}

export interface ImageInfo {
  mimeType: string;
  bytes: number;
}

export type MediaProblem =
  | { code: "unsupported_type"; mimeType: string }
  | { code: "too_large"; bytes: number; maxBytes: number }
  | { code: "too_long"; durationSeconds: number; maxDurationSeconds: number }
  | { code: "resolution_too_high"; width: number; height: number };

// Players and phones report durations like 60.02s for a one-minute clip.
const DURATION_TOLERANCE_SECONDS = 0.5;

export function checkVideo(video: VideoInfo): MediaProblem[] {
  const problems: MediaProblem[] = [];
  if (!(VIDEO_LIMITS.mimeTypes as readonly string[]).includes(video.mimeType)) {
    problems.push({ code: "unsupported_type", mimeType: video.mimeType });
  }
  if (video.bytes > VIDEO_LIMITS.maxBytes) {
    problems.push({ code: "too_large", bytes: video.bytes, maxBytes: VIDEO_LIMITS.maxBytes });
  }
  if (video.durationSeconds > VIDEO_LIMITS.maxDurationSeconds + DURATION_TOLERANCE_SECONDS) {
    problems.push({
      code: "too_long",
      durationSeconds: video.durationSeconds,
      maxDurationSeconds: VIDEO_LIMITS.maxDurationSeconds,
    });
  }
  const long = Math.max(video.width, video.height);
  const short = Math.min(video.width, video.height);
  if (long > VIDEO_LIMITS.maxLongEdge || short > VIDEO_LIMITS.maxShortEdge) {
    problems.push({ code: "resolution_too_high", width: video.width, height: video.height });
  }
  return problems;
}

export function checkImage(image: ImageInfo): MediaProblem[] {
  const problems: MediaProblem[] = [];
  if (!(IMAGE_LIMITS.mimeTypes as readonly string[]).includes(image.mimeType)) {
    problems.push({ code: "unsupported_type", mimeType: image.mimeType });
  }
  if (image.bytes > IMAGE_LIMITS.maxBytes) {
    problems.push({ code: "too_large", bytes: image.bytes, maxBytes: IMAGE_LIMITS.maxBytes });
  }
  return problems;
}
