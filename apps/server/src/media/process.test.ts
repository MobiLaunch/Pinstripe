import { execFile } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import ffmpegInstaller from "@ffmpeg-installer/ffmpeg";
import sharp from "sharp";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { MediaRejected, probeVideo, processImage, processProfileImage, processVideo } from "./process.ts";

// Encoding video with ffmpeg takes seconds, more on a busy CI machine.
vi.setConfig({ testTimeout: 30_000 });

const run = promisify(execFile);
let dir: string;

/** A synthetic test clip: colour bars plus a tone. */
async function clip(name: string, opts: { size: string; seconds: number; rate?: number; extra?: string[] }) {
  const file = path.join(dir, name);
  await run(ffmpegInstaller.path, [
    "-hide_banner", "-loglevel", "error", "-y",
    "-f", "lavfi", "-i", `testsrc=size=${opts.size}:rate=${opts.rate ?? 25}:duration=${opts.seconds}`,
    "-f", "lavfi", "-i", `sine=duration=${opts.seconds}`,
    "-shortest", "-c:v", "libx264", "-preset", "ultrafast", "-c:a", "aac",
    ...(opts.extra ?? []),
    file,
  ]);
  return file;
}

beforeAll(async () => {
  dir = await mkdtemp(path.join(tmpdir(), "pinstripe-media-"));
});
afterAll(() => rm(dir, { recursive: true, force: true }));

describe("videos", () => {
  it("re-encodes to streamable H.264 MP4 with a poster, dropping metadata", async () => {
    const input = await clip("in.mp4", { size: "640x360", seconds: 2, extra: ["-metadata", "location=+40.7128-074.0060/"] });
    const work = await mkdtemp(path.join(dir, "w-"));
    const out = await processVideo(input, "video/mp4", work);
    expect(out).toMatchObject({ contentType: "video/mp4", width: 640, height: 360 });
    expect(out.duration).toBeGreaterThan(1.5);
    expect(out.blurhash).toMatch(/^[0-9A-Za-z#$%*+,.:;=?@[\]^_{|}~-]{6,}$/);
    // ffmpeg -i prints the file's metadata (to stderr) and exits non-zero without an output.
    const { stderr } = await run(ffmpegInstaller.path, ["-hide_banner", "-i", out.file]).catch((e) => e);
    expect(String(stderr)).toContain("Video: h264");
    expect(String(stderr)).not.toContain("location");
    const preview = await sharp(out.preview).metadata();
    expect(preview.width).toBe(640);
  });

  it("reads a sideways phone video as portrait", async () => {
    // Phones store landscape frames plus a rotation tag, added here in a copy-only pass.
    const landscape = await clip("landscape.mp4", { size: "1920x1080", seconds: 1 });
    const input = path.join(dir, "phone.mp4");
    await run(ffmpegInstaller.path, ["-hide_banner", "-loglevel", "error", "-y", "-i", landscape, "-c", "copy", "-metadata:s:v:0", "rotate=90", input]);
    expect(await probeVideo(input)).toMatchObject({ width: 1080, height: 1920 });
    const out = await processVideo(input, "video/mp4", await mkdtemp(path.join(dir, "w-")));
    expect([out.width, out.height]).toEqual([1080, 1920]);
  }, 30_000);

  it("rejects videos over a minute", async () => {
    const input = await clip("long.mp4", { size: "160x90", seconds: 62, rate: 5 });
    await expect(processVideo(input, "video/mp4", dir)).rejects.toMatchObject({ problems: [{ code: "too_long" }] });
  }, 30_000);

  it("rejects videos above 1080p", async () => {
    const input = await clip("big.mp4", { size: "2560x1440", seconds: 1 });
    await expect(processVideo(input, "video/mp4", dir)).rejects.toMatchObject({ problems: [{ code: "resolution_too_high" }] });
  }, 30_000);

  it("rejects files that aren't videos", async () => {
    const input = path.join(dir, "fake.mp4");
    await writeFile(input, "not a video");
    await expect(processVideo(input, "video/mp4", dir)).rejects.toBeInstanceOf(MediaRejected);
    await expect(processVideo(input, "video/x-msvideo", dir)).rejects.toMatchObject({ problems: [{ code: "unsupported_type" }] });
  });
});

describe("photos", () => {
  it("strips GPS and other metadata, fits within 1920px, and makes a preview", async () => {
    const input = path.join(dir, "gps.jpg");
    await sharp({ create: { width: 3000, height: 2000, channels: 3, background: "#3a7cc2" } })
      .withExif({ IFD0: { Make: "PhoneCo", Copyright: "me" }, IFD3: { GPSLatitudeRef: "N", GPSLatitude: "40/1 42/1 46/1" } })
      .jpeg()
      .toFile(input);
    expect((await sharp(input).metadata()).exif).toBeDefined();

    const out = await processImage(input, "image/jpeg", await mkdtemp(path.join(dir, "w-")));
    expect(out).toMatchObject({ contentType: "image/jpeg", width: 1920, height: 1280 });
    const meta = await sharp(out.file).metadata();
    expect(meta.exif).toBeUndefined();
    expect(meta.xmp).toBeUndefined();
    expect((await sharp(out.preview).metadata()).width).toBe(640);
    expect(out.blurhash).toBeTruthy();
  });

  it("keeps PNGs as PNGs and rejects non-images and oversized files", async () => {
    const png = path.join(dir, "shot.png");
    await sharp({ create: { width: 800, height: 600, channels: 4, background: "#ffffff" } }).png().toFile(png);
    expect((await processImage(png, "image/png", await mkdtemp(path.join(dir, "w-")))).contentType).toBe("image/png");

    const fake = path.join(dir, "fake.jpg");
    await writeFile(fake, "not an image");
    await expect(processImage(fake, "image/jpeg", dir)).rejects.toBeInstanceOf(MediaRejected);
    const big = path.join(dir, "big.jpg");
    await writeFile(big, Buffer.alloc(15 * 1024 * 1024 + 1));
    await expect(processImage(big, "image/jpeg", dir)).rejects.toMatchObject({ problems: [{ code: "too_large" }] });
  });

  it("crops avatars square and banners wide", async () => {
    const input = path.join(dir, "portrait.jpg");
    await sharp({ create: { width: 900, height: 1600, channels: 3, background: "#d97757" } }).jpeg().toFile(input);
    const avatar = await sharp(await processProfileImage(input, "avatar", dir)).metadata();
    const header = await sharp(await processProfileImage(input, "header", dir)).metadata();
    expect([avatar.width, avatar.height]).toEqual([400, 400]);
    expect([header.width, header.height]).toEqual([1500, 500]);
  });
});
