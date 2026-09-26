/**
 * Turning uploads into what we serve:
 *
 * - Photos: auto-rotated, stripped of all metadata (EXIF, including GPS),
 *   resized to fit 1920×1920, plus a 640px preview and a blurhash.
 * - Videos: checked against the limits (≤60s, ≤1080p), re-encoded to
 *   H.264/AAC MP4 with the index up front so playback starts before the
 *   download finishes, metadata stripped, plus a poster frame and blurhash.
 */
import { execFile } from "node:child_process";
import { accessSync, chmodSync, constants } from "node:fs";
import { stat } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import ffmpegInstaller from "@ffmpeg-installer/ffmpeg";
import ffprobeInstaller from "@ffprobe-installer/ffprobe";
import { checkImage, checkVideo, describeMediaProblem as describeProblem, IMAGE_LIMITS, type MediaProblem, VIDEO_LIMITS } from "@pinstripe/core";
import { encode } from "blurhash";
import sharp from "sharp";

const run = promisify(execFile);

/**
 * Production images should install ffmpeg and set FFMPEG_PATH / FFPROBE_PATH;
 * the bundled static builds are a fallback. Their install step marks them
 * executable, but package managers that skip install scripts leave them
 * without the bit, so set it here if needed.
 */
function binary(fromEnv: string | undefined, bundled: string): string {
  if (fromEnv) return fromEnv;
  try {
    accessSync(bundled, constants.X_OK);
  } catch {
    chmodSync(bundled, 0o755);
  }
  return bundled;
}

const FFMPEG = binary(process.env.FFMPEG_PATH, ffmpegInstaller.path);
const FFPROBE = binary(process.env.FFPROBE_PATH, ffprobeInstaller.path);

const IMAGE_MAX_EDGE = 1920;
const PREVIEW_WIDTH = 640;

export class MediaRejected extends Error {
  constructor(
    message: string,
    readonly problems: MediaProblem[] = [],
  ) {
    super(message);
  }
}

export { describeMediaProblem as describeProblem } from "@pinstripe/core";

export interface Processed {
  /** The file to store, and its type and extension. */
  file: string;
  contentType: string;
  extension: string;
  preview: string;
  width: number;
  height: number;
  duration: number | null;
  size: number;
  blurhash: string | null;
}

async function blurhashOf(file: string): Promise<string | null> {
  try {
    const { data, info } = await sharp(file).resize(32, 32, { fit: "inside" }).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    return encode(new Uint8ClampedArray(data), info.width, info.height, 4, 3);
  } catch {
    return null;
  }
}

async function makePreview(input: string, output: string) {
  await sharp(input)
    .rotate()
    .resize({ width: PREVIEW_WIDTH, height: PREVIEW_WIDTH, fit: "inside", withoutEnlargement: true })
    .jpeg({ quality: 80, mozjpeg: true })
    .toFile(output);
}

export function isImageType(mimeType: string) {
  return (IMAGE_LIMITS.mimeTypes as readonly string[]).includes(mimeType);
}

export function isVideoType(mimeType: string) {
  return (VIDEO_LIMITS.mimeTypes as readonly string[]).includes(mimeType);
}

export async function processImage(input: string, mimeType: string, workDir: string): Promise<Processed> {
  const { size } = await stat(input);
  const problems = checkImage({ mimeType, bytes: size });
  if (problems.length) throw new MediaRejected(describeProblem(problems[0]!), problems);

  let image: ReturnType<typeof sharp>;
  try {
    image = sharp(input, { animated: mimeType === "image/gif" });
    await image.metadata();
  } catch {
    throw new MediaRejected("That image couldn't be read.");
  }

  // GIFs stay GIFs (they may be animated) and PNGs stay PNGs (they may be
  // screenshots with sharp text); everything else becomes JPEG.
  const format = mimeType === "image/gif" ? "gif" : mimeType === "image/png" ? "png" : "jpeg";
  const file = path.join(workDir, `processed.${format === "jpeg" ? "jpg" : format}`);
  // sharp drops all metadata (EXIF, GPS, XMP) unless asked to keep it.
  let pipeline = image.rotate().resize({ width: IMAGE_MAX_EDGE, height: IMAGE_MAX_EDGE, fit: "inside", withoutEnlargement: true });
  pipeline = format === "gif" ? pipeline.gif() : format === "png" ? pipeline.png({ compressionLevel: 9 }) : pipeline.jpeg({ quality: 85, mozjpeg: true });
  const info = await pipeline.toFile(file);

  const preview = path.join(workDir, "preview.jpg");
  await makePreview(file, preview);
  return {
    file,
    contentType: `image/${format}`,
    extension: format === "jpeg" ? "jpg" : format,
    preview,
    width: info.width,
    height: info.pageHeight ?? info.height,
    duration: null,
    size: info.size,
    blurhash: await blurhashOf(preview),
  };
}

export interface VideoProbe {
  width: number;
  height: number;
  duration: number;
  hasAudio: boolean;
}

/** Reads a video's display size (after rotation), duration and audio. */
export async function probeVideo(input: string): Promise<VideoProbe> {
  let json: {
    streams?: { codec_type: string; width?: number; height?: number; tags?: { rotate?: string }; side_data_list?: { rotation?: number }[] }[];
    format?: { duration?: string };
  };
  try {
    const { stdout } = await run(FFPROBE, ["-v", "error", "-print_format", "json", "-show_streams", "-show_format", input]);
    json = JSON.parse(stdout);
  } catch {
    throw new MediaRejected("That video couldn't be read.");
  }
  const video = json.streams?.find((s) => s.codec_type === "video");
  if (!video?.width || !video.height) throw new MediaRejected("That file has no video.");
  // Phones record sideways and store a rotation; the displayed size is what counts.
  const rotation = Number(video.tags?.rotate ?? video.side_data_list?.find((d) => d.rotation !== undefined)?.rotation ?? 0);
  const sideways = Math.abs(rotation) % 180 === 90;
  return {
    width: sideways ? video.height : video.width,
    height: sideways ? video.width : video.height,
    duration: Number(json.format?.duration ?? 0),
    hasAudio: !!json.streams?.some((s) => s.codec_type === "audio"),
  };
}

export async function processVideo(input: string, mimeType: string, workDir: string): Promise<Processed> {
  const { size } = await stat(input);
  // Cheap checks first, so a 2 GB upload doesn't get probed.
  const early = checkVideo({ mimeType, bytes: size, width: 0, height: 0, durationSeconds: 0 });
  if (early.length) throw new MediaRejected(describeProblem(early[0]!), early);

  const probe = await probeVideo(input);
  const problems = checkVideo({ mimeType, bytes: size, width: probe.width, height: probe.height, durationSeconds: probe.duration });
  if (problems.length) throw new MediaRejected(describeProblem(problems[0]!), problems);

  const file = path.join(workDir, "processed.mp4");
  const args = [
    "-hide_banner",
    "-loglevel", "error",
    "-y",
    "-i", input,
    "-map", "0:v:0",
    ...(probe.hasAudio ? ["-map", "0:a:0"] : []),
    // H.264 High, yuv420p: plays everywhere. Even dimensions are required by the encoder.
    "-c:v", "libx264",
    "-preset", "veryfast",
    "-crf", "23",
    "-profile:v", "high",
    "-pix_fmt", "yuv420p",
    "-vf", "scale=trunc(iw/2)*2:trunc(ih/2)*2",
    "-maxrate", "8M",
    "-bufsize", "16M",
    ...(probe.hasAudio ? ["-c:a", "aac", "-b:a", "128k", "-ac", "2"] : []),
    // Drop metadata (location, device), and put the index first for streaming.
    "-map_metadata", "-1",
    "-movflags", "+faststart",
    "-t", String(VIDEO_LIMITS.maxDurationSeconds + 1),
    file,
  ];
  try {
    await run(FFMPEG, args, { maxBuffer: 16 * 1024 * 1024 });
  } catch (error) {
    throw new MediaRejected("That video couldn't be converted.", []);
  }

  const frame = path.join(workDir, "frame.png");
  await run(FFMPEG, ["-hide_banner", "-loglevel", "error", "-y", "-ss", String(Math.min(0.5, probe.duration / 2)), "-i", file, "-frames:v", "1", frame]);
  const preview = path.join(workDir, "preview.jpg");
  await makePreview(frame, preview);
  const out = await probeVideo(file);
  return {
    file,
    contentType: "video/mp4",
    extension: "mp4",
    preview,
    width: out.width,
    height: out.height,
    duration: Math.round(out.duration * 100) / 100,
    size: (await stat(file)).size,
    blurhash: await blurhashOf(preview),
  };
}

/** Square avatar (400×400) or wide banner (1500×500), metadata stripped. */
export async function processProfileImage(input: string, kind: "avatar" | "header", workDir: string): Promise<string> {
  const [width, height] = kind === "avatar" ? [400, 400] : [1500, 500];
  const out = path.join(workDir, `${kind}.jpg`);
  try {
    await sharp(input).rotate().resize(width, height, { fit: "cover", position: "attention" }).jpeg({ quality: 85, mozjpeg: true }).toFile(out);
  } catch {
    throw new MediaRejected("That image couldn't be read.");
  }
  return out;
}
