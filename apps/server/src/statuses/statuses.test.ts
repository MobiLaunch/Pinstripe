import { createServer, type IncomingHttpHeaders } from "node:http";
import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { ORIGIN, testApp } from "../../test/app.ts";

const { reset, store, signedInUser, remoteFollower, get, postJson, del } = testApp();

type Json = Record<string, any>;
const json = async (res: Response) => (await res.json()) as Json;
const api = "application/json";

async function post(headers: Record<string, string>, body: Json) {
  return postJson("/api/v1/statuses", body, headers);
}

beforeEach(reset);

describe("posting", () => {
  it("creates a post in Mastodon's Status shape", async () => {
    const sam = await signedInUser("sam");
    await signedInUser("mira");
    const res = await post(sam.headers, { status: "Fixed the iBook! #RetroComputing @mira https://example.com", visibility: "public" });
    expect(res.status).toBe(200);
    const status = await json(res);
    expect(status).toMatchObject({
      visibility: "public",
      sensitive: false,
      spoiler_text: "",
      replies_count: 0,
      reblogs_count: 0,
      favourites_count: 0,
      favourited: false,
      reblogged: false,
      reblog: null,
      in_reply_to_id: null,
      media_attachments: [],
      tags: [{ name: "retrocomputing", url: `${ORIGIN}/tags/retrocomputing` }],
      account: { username: "sam", statuses_count: 1 },
    });
    expect(status.uri).toBe(`${ORIGIN}/users/${sam.account.id}/statuses/${status.id}`);
    expect(status.url).toBe(`${ORIGIN}/@sam/${status.id}`);
    expect(status.content).toContain('class="u-url mention">@<span>mira</span></a>');
    expect(status.content).toContain('<a href="https://example.com"');
    expect(status).not.toHaveProperty("text");
  });

  it("maps Mastodon's private visibility to followers-only and back", async () => {
    const sam = await signedInUser("sam");
    const status = await json(await post(sam.headers, { status: "friends only", visibility: "private" }));
    expect(status.visibility).toBe("private");
  });

  it("uses a content warning as sensitive", async () => {
    const sam = await signedInUser("sam");
    const status = await json(await post(sam.headers, { status: "spoilers", spoiler_text: "Finale" }));
    expect(status).toMatchObject({ sensitive: true, spoiler_text: "Finale" });
  });

  it("validates input", async () => {
    const sam = await signedInUser("sam");
    for (const body of [
      { status: "   " },
      { status: "x".repeat(501) },
      { status: "hi", visibility: "everyone" },
      { status: "hi", in_reply_to_id: crypto.randomUUID() },
    ]) {
      expect((await post(sam.headers, body)).status).toBe(422);
    }
    // Emoji count as one character each, not two UTF-16 units.
    expect((await post(sam.headers, { status: "🎬".repeat(500) })).status).toBe(200);
  });

  it("needs a user token with write access", async () => {
    const reader = await signedInUser("reader", ["read"]);
    expect((await post({}, { status: "hi" })).status).toBe(401);
    expect((await post(reader.headers, { status: "hi" })).status).toBe(403);
  });

  it("replies, and counts them", async () => {
    const sam = await signedInUser("sam");
    const mira = await signedInUser("mira");
    const parent = await json(await post(sam.headers, { status: "question?" }));
    const reply = await json(await post(mira.headers, { status: "answer", in_reply_to_id: parent.id }));
    expect(reply).toMatchObject({ in_reply_to_id: parent.id, in_reply_to_account_id: sam.account.id });
    expect((await json(await get(`/api/v1/statuses/${parent.id}`, api))).replies_count).toBe(1);
  });
});

describe("reading and deleting", () => {
  it("hides followers-only and direct posts from everyone but the author", async () => {
    const sam = await signedInUser("sam");
    const mira = await signedInUser("mira");
    for (const visibility of ["private", "direct"]) {
      const status = await json(await post(sam.headers, { status: "secret", visibility }));
      expect((await get(`/api/v1/statuses/${status.id}`, api)).status).toBe(404);
      expect((await get(`/api/v1/statuses/${status.id}`, api, mira.headers)).status).toBe(404);
      expect((await get(`/api/v1/statuses/${status.id}`, api, sam.headers)).status).toBe(200);
    }
  });

  it("lets only the author delete, returning the text for redrafting", async () => {
    const sam = await signedInUser("sam");
    const mira = await signedInUser("mira");
    const status = await json(await post(sam.headers, { status: "oops  typo" }));
    expect((await del(`/api/v1/statuses/${status.id}`, mira.headers)).status).toBe(404);
    const deleted = await del(`/api/v1/statuses/${status.id}`, sam.headers);
    expect(deleted.status).toBe(200);
    expect((await json(deleted)).text).toBe("oops  typo");
    expect((await get(`/api/v1/statuses/${status.id}`, api)).status).toBe(404);
  });
});

describe("favourites and boosts", () => {
  it("favourites idempotently and reports the viewer's state", async () => {
    const sam = await signedInUser("sam");
    const mira = await signedInUser("mira");
    const status = await json(await post(sam.headers, { status: "like me" }));
    const fav = () => postJson(`/api/v1/statuses/${status.id}/favourite`, {}, mira.headers);
    await fav();
    const after = await json(await fav());
    expect(after).toMatchObject({ favourited: true, favourites_count: 1 });
    // The author sees the count but not someone else's favourite as their own.
    expect(await json(await get(`/api/v1/statuses/${status.id}`, api, sam.headers))).toMatchObject({ favourited: false, favourites_count: 1 });
    const undone = await json(await postJson(`/api/v1/statuses/${status.id}/unfavourite`, {}, mira.headers));
    expect(undone).toMatchObject({ favourited: false, favourites_count: 0 });
  });

  it("boosts once, wraps the original, and can be undone", async () => {
    const sam = await signedInUser("sam");
    const mira = await signedInUser("mira");
    const status = await json(await post(sam.headers, { status: "boost me" }));
    const boost = await json(await postJson(`/api/v1/statuses/${status.id}/reblog`, {}, mira.headers));
    expect(boost.reblog).toMatchObject({ id: status.id, reblogged: true, reblogs_count: 1 });
    expect(boost.account.username).toBe("mira");
    expect(boost.uri).toBe(`${ORIGIN}/users/${mira.account.id}/statuses/${boost.id}/activity`);
    const again = await json(await postJson(`/api/v1/statuses/${status.id}/reblog`, {}, mira.headers));
    expect(again.id).toBe(boost.id);

    const original = await json(await postJson(`/api/v1/statuses/${status.id}/unreblog`, {}, mira.headers));
    expect(original).toMatchObject({ id: status.id, reblogged: false, reblogs_count: 0 });
  });

  it("won't boost followers-only posts", async () => {
    const sam = await signedInUser("sam");
    const status = await json(await post(sam.headers, { status: "mine", visibility: "private" }));
    expect((await postJson(`/api/v1/statuses/${status.id}/reblog`, {}, sam.headers)).status).toBe(422);
  });

  it("removes boosts when the original is deleted", async () => {
    const sam = await signedInUser("sam");
    const mira = await signedInUser("mira");
    const status = await json(await post(sam.headers, { status: "gone soon" }));
    const boost = await json(await postJson(`/api/v1/statuses/${status.id}/reblog`, {}, mira.headers));
    await del(`/api/v1/statuses/${status.id}`, sam.headers);
    expect((await get(`/api/v1/statuses/${boost.id}`, api)).status).toBe(404);
  });
});

describe("timelines", () => {
  it("public shows public posts only, newest first, without boosts", async () => {
    const sam = await signedInUser("sam");
    const mira = await signedInUser("mira");
    const a = await json(await post(sam.headers, { status: "one", visibility: "public" }));
    await post(sam.headers, { status: "quiet", visibility: "unlisted" });
    await post(sam.headers, { status: "friends", visibility: "private" });
    const b = await json(await post(mira.headers, { status: "two", visibility: "public" }));
    await postJson(`/api/v1/statuses/${a.id}/reblog`, {}, mira.headers);
    const timeline = await json(await get("/api/v1/timelines/public?local=true", api));
    expect(timeline.map((s: Json) => s.id)).toEqual([b.id, a.id]);
    expect(await json(await get("/api/v1/timelines/public?remote=true", api))).toEqual([]);
  });

  it("home shows your own posts and boosts", async () => {
    const sam = await signedInUser("sam");
    const mira = await signedInUser("mira");
    const other = await json(await post(mira.headers, { status: "mira's" }));
    const mine = await json(await post(sam.headers, { status: "mine", visibility: "private" }));
    const boost = await json(await postJson(`/api/v1/statuses/${other.id}/reblog`, {}, sam.headers));
    const home = await json(await get("/api/v1/timelines/home", api, sam.headers));
    expect(home.map((s: Json) => s.id)).toEqual([boost.id, mine.id]);
    expect((await get("/api/v1/timelines/home", api)).status).toBe(401);
  });

  it("profiles show public and unlisted posts to others, everything to the author", async () => {
    const sam = await signedInUser("sam");
    await post(sam.headers, { status: "a", visibility: "public" });
    await post(sam.headers, { status: "b", visibility: "unlisted" });
    await post(sam.headers, { status: "c", visibility: "private" });
    const path = `/api/v1/accounts/${sam.account.id}/statuses`;
    expect((await json(await get(path, api))).length).toBe(2);
    expect((await json(await get(path, api, sam.headers))).length).toBe(3);
  });

  it("pages with max_id, min_id, limit and a Link header", async () => {
    const sam = await signedInUser("sam");
    const ids: string[] = [];
    for (let i = 0; i < 5; i++) ids.push((await json(await post(sam.headers, { status: `post ${i}` }))).id);
    const newestFirst = [...ids].reverse();

    const first = await get("/api/v1/timelines/public?limit=2", api);
    expect((await json(first)).map((s: Json) => s.id)).toEqual(newestFirst.slice(0, 2));
    const next = /<([^>]+)>; rel="next"/.exec(first.headers.get("link")!)![1]!;
    expect(new URL(next).searchParams.get("max_id")).toBe(newestFirst[1]);

    const second = await json(await get(`/api/v1/timelines/public?limit=2&max_id=${newestFirst[1]}`, api));
    expect(second.map((s: Json) => s.id)).toEqual(newestFirst.slice(2, 4));
    const newer = await json(await get(`/api/v1/timelines/public?limit=2&min_id=${ids[0]}`, api));
    expect(newer.map((s: Json) => s.id)).toEqual([ids[2], ids[1]]);
    const since = await json(await get(`/api/v1/timelines/public?since_id=${ids[3]}`, api));
    expect(since.map((s: Json) => s.id)).toEqual([ids[4]]);
  });
});

describe("ActivityPub", () => {
  it("serves public posts as Notes and hides the rest", async () => {
    const sam = await signedInUser("sam");
    const status = await json(await post(sam.headers, { status: "hello fediverse #pinstripe", visibility: "public" }));
    const res = await get(new URL(status.uri).pathname);
    expect(res.status).toBe(200);
    const note = await json(res);
    expect(note).toMatchObject({
      type: "Note",
      id: status.uri,
      attributedTo: `${ORIGIN}/users/${sam.account.id}`,
      to: "as:Public",
      cc: `${ORIGIN}/users/${sam.account.id}/followers`,
      url: status.url,
      content: status.content,
    });
    const hidden = await json(await post(sam.headers, { status: "hidden", visibility: "private" }));
    expect((await get(new URL(hidden.uri).pathname)).status).toBe(404);
  });

  it("lists posts in the outbox and links it from the actor", async () => {
    const sam = await signedInUser("sam");
    await post(sam.headers, { status: "first" });
    await post(sam.headers, { status: "second", visibility: "private" });
    const actor = await json(await get(`/users/${sam.account.id}`));
    expect(actor.outbox).toBe(`${ORIGIN}/users/${sam.account.id}/outbox`);
    const outbox = await json(await get(new URL(actor.outbox).pathname));
    expect(outbox.totalItems).toBe(2);
    const page = await json(await get(new URL(outbox.first).pathname + new URL(outbox.first).search));
    // The followers-only post is counted but not shown to anonymous fetches.
    expect(page.orderedItems).toHaveLength(1);
    expect(page.orderedItems[0]).toMatchObject({ type: "Create", object: { type: "Note" } });
  });

  describe("delivery to followers", () => {
    const received: { headers: IncomingHttpHeaders; body: Json }[] = [];
    let inbox: string;
    const server = createServer((req, res) => {
      let data = "";
      req.on("data", (chunk) => (data += chunk));
      req.on("end", () => {
        received.push({ headers: req.headers, body: JSON.parse(data) });
        res.writeHead(202).end();
      });
    });
    beforeAll(async () => {
      await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
      inbox = `http://127.0.0.1:${(server.address() as AddressInfo).port}/inbox`;
    });
    afterAll(() => new Promise<void>((resolve) => server.close(() => resolve())));
    beforeEach(() => {
      received.length = 0;
    });

    async function samWithFollower() {
      const sam = await signedInUser("sam");
      await remoteFollower(sam.account.id, inbox);
      return sam;
    }

    it("sends signed Create, Announce, Undo and Delete activities", async () => {
      const sam = await samWithFollower();
      const status = await json(await post(sam.headers, { status: "hello followers" }));
      await postJson(`/api/v1/statuses/${status.id}/reblog`, {}, sam.headers);
      await postJson(`/api/v1/statuses/${status.id}/unreblog`, {}, sam.headers);
      await del(`/api/v1/statuses/${status.id}`, sam.headers);

      expect(received.map((r) => r.body.type)).toEqual(["Create", "Announce", "Undo", "Delete"]);
      const [create, announce, undo, deleted] = received.map((r) => r.body);
      expect(create).toMatchObject({ actor: `${ORIGIN}/users/${sam.account.id}`, object: { type: "Note", id: status.uri } });
      expect(announce!.object).toBe(status.uri);
      expect(undo!.object).toMatchObject({ type: "Announce", id: announce!.id });
      expect(deleted!.object).toMatchObject({ type: "Tombstone", id: status.uri });
      // Every delivery is signed with the author's key.
      for (const r of received) expect(r.headers.signature ?? r.headers["signature-input"]).toBeTruthy();
    });

    it("doesn't send direct posts, and skips pending followers", async () => {
      const sam = await samWithFollower();
      await post(sam.headers, { status: "just me", visibility: "direct" });
      const mira = await store.getAccountByUri(`${new URL(inbox).origin}/users/mira`);
      await store.unfollow(mira!.id, sam.account.id);
      await remoteFollower(sam.account.id, inbox, "pending");
      await post(sam.headers, { status: "public but nobody's accepted" });
      expect(received).toEqual([]);
    });
  });
});

describe("views", () => {
  it("counts each signed-in viewer once", async () => {
    const sam = await signedInUser("sam");
    const mira = await signedInUser("mira");
    const kai = await signedInUser("kai");
    const status = await json(await post(sam.headers, { status: "watch this" }));
    expect(status.pinstripe).toEqual({ views_count: 0 });

    const view = async (headers: Record<string, string>) => json(await postJson(`/api/v1/pinstripe/statuses/${status.id}/view`, {}, headers));
    expect(await view(mira.headers)).toEqual({ views_count: 1 });
    expect(await view(mira.headers)).toEqual({ views_count: 1 });
    expect(await view(kai.headers)).toEqual({ views_count: 2 });
    expect((await postJson(`/api/v1/pinstripe/statuses/${status.id}/view`, {})).status).toBe(401);
    expect((await json(await get(`/api/v1/statuses/${status.id}`, api))).pinstripe).toEqual({ views_count: 2 });
    // The author's download preference rides along on the account.
    expect((await json(await get(`/api/v1/statuses/${status.id}`, api))).account.pinstripe).toEqual({ allow_video_downloads: false });
  });
});

