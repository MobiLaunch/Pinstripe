import { beforeEach, describe, expect, it } from "vitest";
import { testApp } from "../../test/app.ts";

const { reset, signedInUser, get, postJson, request, del } = testApp();

type Json = Record<string, any>;
const api = "application/json";
const json = async (res: Response) => (await res.json()) as any;
const list = async (headers: Record<string, string>, query = "") =>
  (await json(await get(`/api/v1/notifications${query}`, api, headers))) as any[];

beforeEach(reset);

describe("notifications", () => {
  it("covers follows, mentions, replies, favourites and boosts, newest first", async () => {
    const sam = await signedInUser("sam");
    const mira = await signedInUser("mira");
    const post = await json(await postJson("/api/v1/statuses", { status: "hello" }, sam.headers));

    await postJson(`/api/v1/accounts/${sam.account.id}/follow`, {}, mira.headers);
    await postJson(`/api/v1/statuses/${post.id}/favourite`, {}, mira.headers);
    const boost = await json(await postJson(`/api/v1/statuses/${post.id}/reblog`, {}, mira.headers));
    const mention = await json(await postJson("/api/v1/statuses", { status: "@sam look" }, mira.headers));
    // A reply without an @mention still reaches the author.
    const reply = await json(await postJson("/api/v1/statuses", { status: "nice", in_reply_to_id: post.id }, mira.headers));

    const got = await list(sam.headers);
    expect(got.map((n) => n.type)).toEqual(["mention", "mention", "reblog", "favourite", "follow"]);
    expect(got.every((n) => n.account.username === "mira")).toBe(true);
    expect(got[0].status.id).toBe(reply.id);
    expect(got[1].status.id).toBe(mention.id);
    // A boost notification shows the boosted post, not the boost.
    expect(got[2].status.id).toBe(post.id);
    expect(boost.reblog.id).toBe(post.id);
    expect(got[3].status.id).toBe(post.id);
    expect(got[4]).not.toHaveProperty("status");

    // Mira's own actions don't notify Mira.
    expect(await list(mira.headers)).toEqual([]);
  });

  it("removes a notification when the action is undone", async () => {
    const sam = await signedInUser("sam");
    const mira = await signedInUser("mira");
    const post = await json(await postJson("/api/v1/statuses", { status: "hello" }, sam.headers));
    await postJson(`/api/v1/accounts/${sam.account.id}/follow`, {}, mira.headers);
    await postJson(`/api/v1/statuses/${post.id}/favourite`, {}, mira.headers);
    await postJson(`/api/v1/statuses/${post.id}/reblog`, {}, mira.headers);
    const mention = await json(await postJson("/api/v1/statuses", { status: "@sam hi" }, mira.headers));
    expect(await list(sam.headers)).toHaveLength(4);

    await postJson(`/api/v1/accounts/${sam.account.id}/unfollow`, {}, mira.headers);
    await postJson(`/api/v1/statuses/${post.id}/unfavourite`, {}, mira.headers);
    await postJson(`/api/v1/statuses/${post.id}/unreblog`, {}, mira.headers);
    await del(`/api/v1/statuses/${mention.id}`, mira.headers);
    expect(await list(sam.headers)).toEqual([]);

    // Favouriting again notifies again, once.
    await postJson(`/api/v1/statuses/${post.id}/favourite`, {}, mira.headers);
    await postJson(`/api/v1/statuses/${post.id}/favourite`, {}, mira.headers);
    expect((await list(sam.headers)).map((n) => n.type)).toEqual(["favourite"]);
  });

  it("turns a follow request into a follow when approved", async () => {
    const sam = await signedInUser("sam");
    const mira = await signedInUser("mira");
    await request("/api/v1/accounts/update_credentials", {
      method: "PATCH",
      headers: { ...sam.headers, "content-type": "application/json" },
      body: JSON.stringify({ locked: true }),
    });
    await postJson(`/api/v1/accounts/${sam.account.id}/follow`, {}, mira.headers);
    expect((await list(sam.headers)).map((n) => n.type)).toEqual(["follow_request"]);
    await postJson(`/api/v1/follow_requests/${mira.account.id}/authorize`, {}, sam.headers);
    expect((await list(sam.headers)).map((n) => n.type)).toEqual(["follow"]);
  });

  it("filters by type and sender, pages, and dismisses", async () => {
    const sam = await signedInUser("sam");
    const mira = await signedInUser("mira");
    const kai = await signedInUser("kai");
    const post = await json(await postJson("/api/v1/statuses", { status: "hello" }, sam.headers));
    await postJson(`/api/v1/statuses/${post.id}/favourite`, {}, mira.headers);
    await postJson(`/api/v1/statuses/${post.id}/favourite`, {}, kai.headers);
    await postJson(`/api/v1/accounts/${sam.account.id}/follow`, {}, kai.headers);

    expect((await list(sam.headers, "?types[]=follow")).map((n) => n.type)).toEqual(["follow"]);
    expect((await list(sam.headers, "?exclude_types[]=follow")).map((n) => n.type)).toEqual(["favourite", "favourite"]);
    expect((await list(sam.headers, `?account_id=${mira.account.id}`)).map((n) => n.account.username)).toEqual(["mira"]);

    const res = await get("/api/v1/notifications?limit=2", api, sam.headers);
    const page = await json(res);
    expect(page).toHaveLength(2);
    expect(res.headers.get("link")).toContain(`max_id=${page[1].id}`);
    const next = await list(sam.headers, `?max_id=${page[1].id}`);
    expect(next.map((n) => n.account.username)).toEqual(["mira"]);

    expect((await postJson(`/api/v1/notifications/${next[0].id}/dismiss`, {}, sam.headers)).status).toBe(200);
    expect((await get(`/api/v1/notifications/${next[0].id}`, api, sam.headers)).status).toBe(404);
    // Someone else's notification can't be dismissed.
    expect((await postJson(`/api/v1/notifications/${page[0].id}/dismiss`, {}, mira.headers)).status).toBe(404);

    await postJson("/api/v1/notifications/clear", {}, sam.headers);
    expect(await list(sam.headers)).toEqual([]);
  });

  it("counts unread notifications after the read marker", async () => {
    const sam = await signedInUser("sam");
    const mira = await signedInUser("mira");
    const post = await json(await postJson("/api/v1/statuses", { status: "hello" }, sam.headers));
    await postJson(`/api/v1/statuses/${post.id}/favourite`, {}, mira.headers);
    await postJson(`/api/v1/accounts/${sam.account.id}/follow`, {}, mira.headers);
    const unread = async () => (await json(await get("/api/v1/notifications/unread_count", api, sam.headers))).count;
    expect(await unread()).toBe(2);

    const [newest] = await list(sam.headers);
    const saved = await json(await postJson("/api/v1/markers", { notifications: { last_read_id: newest.id } }, sam.headers));
    expect(saved.notifications).toMatchObject({ last_read_id: newest.id, version: 0 });
    expect(await unread()).toBe(0);
    expect(await json(await get("/api/v1/markers?timeline[]=notifications", api, sam.headers))).toMatchObject({
      notifications: { last_read_id: newest.id },
    });

    await postJson("/api/v1/statuses", { status: "@sam again" }, mira.headers);
    expect(await unread()).toBe(1);
  });

  it("needs a signed-in user with the notifications scope", async () => {
    expect((await get("/api/v1/notifications", api)).status).toBe(401);
    const sam = await signedInUser("sam", ["read:statuses"]);
    expect((await get("/api/v1/notifications", api, sam.headers)).status).toBe(403);
  });
});
