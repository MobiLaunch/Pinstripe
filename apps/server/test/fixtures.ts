import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import ffmpegInstaller from "@ffmpeg-installer/ffmpeg";
import sharp from "sharp";

const run = promisify(execFile);

/** A synthetic MP4: colour bars and a tone. */
export async function videoBytes(opts: { size?: string; seconds?: number; rate?: number } = {}): Promise<Buffer> {
  const dir = await mkdtemp(path.join(tmpdir(), "pinstripe-fixture-"));
  const file = path.join(dir, "clip.mp4");
  const seconds = opts.seconds ?? 1;
  try {
    await run(ffmpegInstaller.path, [
      "-hide_banner", "-loglevel", "error", "-y",
      "-f", "lavfi", "-i", `testsrc=size=${opts.size ?? "320x240"}:rate=${opts.rate ?? 25}:duration=${seconds}`,
      "-f", "lavfi", "-i", `sine=duration=${seconds}`,
      "-shortest", "-c:v", "libx264", "-preset", "ultrafast", "-c:a", "aac", file,
    ]);
    return await readFile(file);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

export function jpegBytes(width = 1200, height = 800, color = "#3a7cc2"): Promise<Buffer> {
  return sharp({ create: { width, height, channels: 3, background: color } }).jpeg().toBuffer();
}

/** A multipart body with one file and optional fields. */
export function uploadForm(bytes: Buffer, type: string, fields: Record<string, string> = {}, name = "file"): FormData {
  const form = new FormData();
  form.append(name, new Blob([new Uint8Array(bytes)], { type }), `upload.${type.split("/")[1]}`);
  for (const [k, v] of Object.entries(fields)) form.append(k, v);
  return form;
}
