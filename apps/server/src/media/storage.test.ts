import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { DeleteObjectsCommand, PutObjectCommand } from "@aws-sdk/client-s3";
import { mockClient } from "aws-sdk-client-mock";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { loadConfig } from "../config.ts";
import { LocalDiskStorage, S3Storage } from "./storage.ts";

let dir: string;
beforeAll(async () => {
  dir = await mkdtemp(path.join(tmpdir(), "pinstripe-storage-"));
});
afterAll(() => rm(dir, { recursive: true, force: true }));

describe("LocalDiskStorage", () => {
  it("stores, serves ranges, and refuses unsafe keys", async () => {
    const storage = new LocalDiskStorage(path.join(dir, "store"), "https://pinstripe.test");
    const src = path.join(dir, "src.bin");
    await writeFile(src, Buffer.from("0123456789"));
    await storage.put("media/x/original.mp4", src, "video/mp4");
    expect(storage.url("media/x/original.mp4")).toBe("https://pinstripe.test/media/media/x/original.mp4");

    const full = await storage.serve("media/x/original.mp4", undefined, "video/mp4");
    expect(await full!.text()).toBe("0123456789");
    const tail = await storage.serve("media/x/original.mp4", "bytes=-3", "video/mp4");
    expect(tail!.status).toBe(206);
    expect(await tail!.text()).toBe("789");
    expect((await storage.serve("media/x/original.mp4", "bytes=50-60", "video/mp4"))!.status).toBe(416);

    expect(await storage.serve("../src.bin", undefined, "video/mp4")).toBeNull();
    await expect(storage.put("../escape.mp4", src, "video/mp4")).rejects.toThrow(/Unsafe/);
    await storage.delete(["media/x/original.mp4"]);
    expect(await storage.serve("media/x/original.mp4", undefined, "video/mp4")).toBeNull();
  });
});

describe("S3Storage", () => {
  it("uploads with type and caching, serves from the public URL, and deletes in batches", async () => {
    const storage = new S3Storage({
      bucket: "pinstripe-media",
      region: "auto",
      endpoint: "https://example.r2.cloudflarestorage.com",
      accessKeyId: "id",
      secretAccessKey: "secret",
      publicUrl: "https://media.pinstripe.social/",
    });
    const s3 = mockClient(storage.client);
    s3.on(PutObjectCommand).resolves({});
    s3.on(DeleteObjectsCommand).resolves({});
    const src = path.join(dir, "photo.jpg");
    await writeFile(src, Buffer.from("jpeg"));

    await storage.put("media/y/original.jpg", src, "image/jpeg");
    const put = s3.commandCalls(PutObjectCommand)[0]!.args[0].input;
    expect(put).toMatchObject({ Bucket: "pinstripe-media", Key: "media/y/original.jpg", ContentType: "image/jpeg", ContentLength: 4 });
    expect(put.CacheControl).toContain("immutable");
    expect(storage.url("media/y/original.jpg")).toBe("https://media.pinstripe.social/media/y/original.jpg");

    await storage.delete(Array.from({ length: 1500 }, (_, i) => `media/${i}/original.jpg`));
    expect(s3.commandCalls(DeleteObjectsCommand).map((c) => c.args[0].input.Delete!.Objects!.length)).toEqual([1000, 500]);
  });

  it("is configured from the environment", () => {
    const base = { DATABASE_URL: "postgres://x" };
    expect(loadConfig(base).storage).toEqual({ kind: "local", dir: "./media-data" });
    expect(() => loadConfig({ ...base, MEDIA_STORAGE: "s3" })).toThrow(/S3_BUCKET, S3_ACCESS_KEY_ID/);
    expect(
      loadConfig({ ...base, MEDIA_STORAGE: "s3", S3_BUCKET: "b", S3_ACCESS_KEY_ID: "i", S3_SECRET_ACCESS_KEY: "s", S3_PUBLIC_URL: "https://cdn" })
        .storage,
    ).toMatchObject({ kind: "s3", bucket: "b", region: "auto" });
  });
});
