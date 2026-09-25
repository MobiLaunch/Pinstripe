import { beforeEach, describe, expect, it } from "vitest";
import { ORIGIN, testApp } from "../../test/app.ts";
import { jpegBytes, uploadForm, videoBytes } from "../../test/fixtures.ts";

const { reset, signedInUser, get, postJson, del, request, media } = testApp();
const api = "application/json";
type Json = Record<string, any>;
const json = async (res: Response) => (await res.json()) as any;

beforeEach(reset);

const upload = (headers: Record<string, string>, body: FormData) =>
  request("/api/v2/media", { method: "POST", headers, body });
const path = (url: string) => new URL(url).pathname;

describe("photo uploads", () => {
  it("processes a photo during the upload and serves it", async () => {
    const sam = await signedInUser("sam");
    const res = await upload(sam.headers, uploadForm(await jpegBytes(), "image/jpeg", { description: "A blue square" }));
    expect(res.status).toBe(200);
    const m = await json(res);
    expect(m).toMatchObject({
      type: "image",
      description: "A blue square",
      meta: { original: { width: 1200, height: 800, size: "1200x800", aspect: 1.5 }, small: { width: 640, height: 427 } },
    });
    expect(m.url).toMatch(new RegExp(`^${ORIGIN}/media/media/${m.id}/original\\.jpg$`));
    expect(m.blurhash).toBeTruthy();

    const file = await get(path(m.url), "*/*");
    expect(file.status).toBe(200);
    expect(file.headers.get("content-type")).toBe("image/jpeg");
    expect(file.headers.get("cache-control")).toContain("immutable");
    expect((await get(path(m.preview_url), "*/*")).status).toBe(200);
  });

  it("updates the description", async () => {
    const sam = await signedInUser("sam");
    const m = await json(await upload(sam.headers, uploadForm(await jpegBytes(), "image/jpeg")));
    const res = await request(`/api/v1/media/${m.id}`, {
      method: "PUT",
      headers: { ...sam.headers, "content-type": "application/json" },
      body: JSON.stringify({ description: "Now described" }),
    });
    expect((await json(res)).description).toBe("Now described");
  });

  it("rejects unsupported, broken and oversized files", async () => {
    const sam = await signedInUser("sam");
    expect((await upload(sam.headers, uploadForm(Buffer.from("hello"), "text/plain"))).status).toBe(422);
    expect((await upload(sam.headers, uploadForm(Buffer.from("not really"), "image/jpeg"))).status).toBe(422);
    expect((await upload(sam.headers, uploadForm(Buffer.alloc(15 * 1024 * 1024 + 10), "image/jpeg"))).status).toBe(413);
    expect((await upload(sam.headers, new FormData())).status).toBe(422);
    expect((await upload({}, uploadForm(await jpegBytes(), "image/jpeg"))).status).toBe(401);
  });
});

describe("video uploads", () => {
  it("processes videos in the background and serves them with Range support", async () => {
    const sam = await signedInUser("sam");
    const res = await upload(sam.headers, uploadForm(await videoBytes({ seconds: 2 }), "video/mp4"));
    expect(res.status).toBe(202);
    const pending = await json(res);
    expect(pending).toMatchObject({ type: "video", url: null });

    await media.idle();
    const ready = await request(`/api/v1/media/${pending.id}`, { headers: sam.headers });
    expect(ready.status).toBe(200);
    const m = await json(ready);
    expect(m.url).toMatch(/original\.mp4$/);
    expect(m.meta.original).toMatchObject({ width: 320, height: 240 });
    expect(m.meta.original.duration).toBeGreaterThan(1.5);

    const range = await request(path(m.url), { headers: { range: "bytes=0-99" } });
    expect(range.status).toBe(206);
    expect(range.headers.get("content-range")).toMatch(/^bytes 0-99\/\d+$/);
    expect((await range.arrayBuffer()).byteLength).toBe(100);
  });

  it("reports videos that break the rules once processing finishes", async () => {
    const sam = await signedInUser("sam");
    const pending = await json(await upload(sam.headers, uploadForm(await videoBytes({ size: "160x90", seconds: 62, rate: 5 }), "video/mp4")));
    await media.idle();
    const res = await request(`/api/v1/media/${pending.id}`, { headers: sam.headers });
    expect(res.status).toBe(422);
    expect((await json(res)).error).toBe("Videos can be up to 60 seconds long.");
  }, 30_000);
});

describe("posting with media", () => {
  it("attaches uploads in order, federates them, and deletes their files with the post", async () => {
    const sam = await signedInUser("sam");
    const a = await json(await upload(sam.headers, uploadForm(await jpegBytes(400, 300, "#ff0000"), "image/jpeg", { description: "red" })));
    const b = await json(await upload(sam.headers, uploadForm(await jpegBytes(400, 300, "#00ff00"), "image/jpeg")));
    // Text is optional when there's media.
    const res = await postJson("/api/v1/statuses", { status: "", media_ids: [b.id, a.id] }, sam.headers);
    expect(res.status).toBe(200);
    const post = await json(res);
    expect(post.media_attachments.map((m: Json) => m.id)).toEqual([b.id, a.id]);

    const note = await json(await get(path(post.uri)));
    expect(note.attachment).toHaveLength(2);
    expect(note.attachment[1]).toMatchObject({ type: "Document", mediaType: "image/jpeg", url: a.url, name: "red", width: 400, height: 300 });

    // An upload can only be attached once.
    expect((await postJson("/api/v1/statuses", { status: "again", media_ids: [a.id] }, sam.headers)).status).toBe(422);

    await del(`/api/v1/statuses/${post.id}`, sam.headers);
    expect((await get(path(a.url), "*/*")).status).toBe(404);
  });

  it("enforces Mastodon's attachment rules", async () => {
    const sam = await signedInUser("sam");
    const mira = await signedInUser("mira");
    const photo = async () => (await json(await upload(sam.headers, uploadForm(await jpegBytes(200, 200), "image/jpeg")))).id;
    const five = [await photo(), await photo(), await photo(), await photo(), await photo()];
    expect((await postJson("/api/v1/statuses", { media_ids: five }, sam.headers)).status).toBe(422);
    expect((await postJson("/api/v1/statuses", { media_ids: [five[0]] }, mira.headers)).status).toBe(422);

    const video = await json(await upload(sam.headers, uploadForm(await videoBytes(), "video/mp4")));
    // Not processed yet.
    expect((await json(await postJson("/api/v1/statuses", { media_ids: [video.id] }, sam.headers))).error).toMatch(/finished processing/);
    await media.idle();
    expect((await postJson("/api/v1/statuses", { media_ids: [video.id, five[1]] }, sam.headers)).status).toBe(422);
    expect((await postJson("/api/v1/statuses", { status: "clip", media_ids: [video.id] }, sam.headers)).status).toBe(200);
  });

  it("filters timelines to media and to videos", async () => {
    const sam = await signedInUser("sam");
    await postJson("/api/v1/statuses", { status: "text only" }, sam.headers);
    const photo = await json(await upload(sam.headers, uploadForm(await jpegBytes(), "image/jpeg")));
    const photoPost = await json(await postJson("/api/v1/statuses", { media_ids: [photo.id] }, sam.headers));
    const video = await json(await upload(sam.headers, uploadForm(await videoBytes(), "video/mp4")));
    await media.idle();
    const videoPost = await json(await postJson("/api/v1/statuses", { media_ids: [video.id] }, sam.headers));

    const ids = async (url: string, headers = {}) => (await json(await get(url, api, headers))).map((s: Json) => s.id);
    expect(await ids("/api/v1/timelines/public?only_media=true")).toEqual([videoPost.id, photoPost.id]);
    expect(await ids("/api/v1/timelines/public?only_video=true")).toEqual([videoPost.id]);
    expect(await ids("/api/v1/timelines/home?only_video=true", sam.headers)).toEqual([videoPost.id]);
    expect(await ids(`/api/v1/accounts/${sam.account.id}/statuses?only_media=true`)).toEqual([videoPost.id, photoPost.id]);
  });
});

describe("profile images", () => {
  it("uploads an avatar and banner, cropped, and puts them on the actor", async () => {
    const sam = await signedInUser("sam");
    const form = uploadForm(await jpegBytes(900, 1600), "image/jpeg", { display_name: "Sam" }, "avatar");
    form.append("header", new Blob([new Uint8Array(await jpegBytes(3000, 800))], { type: "image/jpeg" }), "header.jpg");
    const res = await request("/api/v1/accounts/update_credentials", { method: "PATCH", headers: sam.headers, body: form });
    expect(res.status).toBe(200);
    const me = await json(res);
    expect(me.avatar).toMatch(new RegExp(`^${ORIGIN}/media/accounts/${sam.account.id}/avatar-`));
    expect(me.header).toMatch(/header-.*\.jpg$/);
    expect((await get(path(me.avatar), "*/*")).status).toBe(200);

    const actor = await json(await get(`/users/${sam.account.id}`));
    expect(actor.icon).toMatchObject({ type: "Image", url: me.avatar });
    expect(actor.image).toMatchObject({ type: "Image", url: me.header });

    // Replacing the avatar deletes the old file.
    const again = uploadForm(await jpegBytes(500, 500, "#000000"), "image/jpeg", {}, "avatar");
    const updated = await json(await request("/api/v1/accounts/update_credentials", { method: "PATCH", headers: sam.headers, body: again }));
    expect(updated.avatar).not.toBe(me.avatar);
    expect((await get(path(me.avatar), "*/*")).status).toBe(404);
  });
});

describe("housekeeping", () => {
  it("deletes uploads that were never posted after a day", async () => {
    const sam = await signedInUser("sam");
    const m = await json(await upload(sam.headers, uploadForm(await jpegBytes(), "image/jpeg")));
    await media.sweep(Date.now() + 25 * 60 * 60 * 1000);
    expect((await request(`/api/v1/media/${m.id}`, { headers: sam.headers })).status).toBe(404);
    expect((await get(path(m.url), "*/*")).status).toBe(404);
  });
});
