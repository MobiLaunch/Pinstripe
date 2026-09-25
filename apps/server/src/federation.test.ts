/**
 * Two Pinstripe servers federating with each other over real HTTP: follows,
 * posts, favourites, boosts, mentions, replies and deletes.
 */
import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { jpegBytes, uploadForm } from "../test/fixtures.ts";
import { twoInstances } from "../test/instances.ts";
import { accounts } from "./db/schema.ts";

const servers = twoInstances();
beforeEach(() => servers.reset());

type Json = Record<string, any>;

/** Finds `user`'s account on `on` by resolving their actor URL, as a search box would. */
async function discover(on: typeof servers.a, viewer: { headers: Record<string, string> }, actor: string): Promise<Json> {
  const result = await on.get(`/api/v2/search?q=${encodeURIComponent(actor)}&resolve=true`, viewer.headers);
  expect(result.accounts).toHaveLength(1);
  return result.accounts[0];
}

describe("following across servers", () => {
  it("follows a remote account, which is accepted by its server", async () => {
    const { a, b } = servers;
    const alice = await a.user("alice");
    const bob = await b.user("bob");

    const remoteBob = await discover(a, alice, bob.actor);
    expect(remoteBob).toMatchObject({ username: "bob", acct: bob.handle, uri: bob.actor });

    const rel = await a.post(`/api/v1/accounts/${remoteBob.id}/follow`, {}, alice.headers);
    expect(rel).toMatchObject({ following: true, requested: false });

    // Bob's server knows Alice now, as a follower.
    const bobOnB = await b.get(`/api/v1/accounts/${bob.id}`);
    expect(bobOnB.followers_count).toBe(1);
    const followers = await b.get(`/api/v1/accounts/${bob.id}/followers`);
    expect(followers.map((f: Json) => f.acct)).toEqual([alice.handle]);

    // A handle lookup now works from the database.
    expect((await a.get(`/api/v1/accounts/lookup?acct=${bob.handle}`)).id).toBe(remoteBob.id);
    const [relation] = await a.get(`/api/v1/accounts/relationships?id[]=${remoteBob.id}`, alice.headers);
    expect(relation).toMatchObject({ id: remoteBob.id, following: true });

    await a.post(`/api/v1/accounts/${remoteBob.id}/unfollow`, {}, alice.headers);
    expect((await b.get(`/api/v1/accounts/${bob.id}`)).followers_count).toBe(0);
  });

  it("waits for approval when the remote account is locked", async () => {
    const { a, b } = servers;
    const alice = await a.user("alice");
    const bob = await b.user("bob");
    // Lock Bob's account (Settings → Approve new followers).
    const bobRow = (await b.store.getAccount(bob.id))!;
    await b.store.db
      .update(accounts)
      .set({ settings: { ...bobRow.settings, approveFollowers: true } })
      .where(eq(accounts.id, bob.id));

    const remoteBob = await discover(a, alice, bob.actor);
    expect(await a.post(`/api/v1/accounts/${remoteBob.id}/follow`, {}, alice.headers)).toMatchObject({ following: false, requested: true });

    const requests = await b.get("/api/v1/follow_requests", bob.headers);
    expect(requests.map((r: Json) => r.acct)).toEqual([alice.handle]);
    await b.post(`/api/v1/follow_requests/${requests[0].id}/authorize`, {}, bob.headers);

    const [relation] = await a.get(`/api/v1/accounts/relationships?id[]=${remoteBob.id}`, alice.headers);
    expect(relation).toMatchObject({ following: true, requested: false });
  });
});

describe("posts across servers", () => {
  async function aliceFollowsBob() {
    const { a, b } = servers;
    const alice = await a.user("alice");
    const bob = await b.user("bob");
    const remoteBob = await discover(a, alice, bob.actor);
    await a.post(`/api/v1/accounts/${remoteBob.id}/follow`, {}, alice.headers);
    return { alice, bob, remoteBob };
  }

  it("delivers posts to followers' home timelines, and deletes them too", async () => {
    const { a, b } = servers;
    const { alice, bob } = await aliceFollowsBob();
    const post = await b.post("/api/v1/statuses", { status: "Hello from B! #federation <b>not bold</b>" }, bob.headers);

    const home = await a.get("/api/v1/timelines/home", alice.headers);
    expect(home).toHaveLength(1);
    expect(home[0]).toMatchObject({ uri: post.uri, url: post.url, account: { acct: bob.handle }, tags: [{ name: "federation" }] });
    expect(home[0].content).toContain("&lt;b&gt;not bold&lt;/b&gt;");
    expect(home[0].id).not.toBe(post.id);

    // Federated includes other servers; Local doesn't.
    expect(await a.get("/api/v1/timelines/public?local=true")).toEqual([]);
    expect((await a.get("/api/v1/timelines/public")).map((s: Json) => s.uri)).toEqual([post.uri]);

    await b.del(`/api/v1/statuses/${post.id}`, bob.headers);
    expect(await a.get("/api/v1/timelines/home", alice.headers)).toEqual([]);
  });

  it("keeps followers-only posts to followers", async () => {
    const { a, b } = servers;
    const { alice, bob } = await aliceFollowsBob();
    const carol = await a.user("carol");
    const post = await b.post("/api/v1/statuses", { status: "just followers", visibility: "private" }, bob.headers);
    const [copy] = await a.get("/api/v1/timelines/home", alice.headers);
    expect(copy).toMatchObject({ uri: post.uri, visibility: "private" });
    await expect(a.get(`/api/v1/statuses/${copy.id}`, carol.headers)).rejects.toThrow(/404/);
    await expect(a.get(`/api/v1/statuses/${copy.id}`)).rejects.toThrow(/404/);
  });

  it("sends favourites and boosts back to the author's server", async () => {
    const { a, b } = servers;
    const { alice, bob } = await aliceFollowsBob();
    const post = await b.post("/api/v1/statuses", { status: "like and boost me" }, bob.headers);
    const [copy] = await a.get("/api/v1/timelines/home", alice.headers);

    await a.post(`/api/v1/statuses/${copy.id}/favourite`, {}, alice.headers);
    await a.post(`/api/v1/statuses/${copy.id}/reblog`, {}, alice.headers);
    expect(await b.get(`/api/v1/statuses/${post.id}`)).toMatchObject({ favourites_count: 1, reblogs_count: 1 });

    await a.post(`/api/v1/statuses/${copy.id}/unfavourite`, {}, alice.headers);
    await a.post(`/api/v1/statuses/${copy.id}/unreblog`, {}, alice.headers);
    expect(await b.get(`/api/v1/statuses/${post.id}`)).toMatchObject({ favourites_count: 0, reblogs_count: 0 });
  });

  it("delivers direct mentions to the mentioned account only", async () => {
    const { a, b } = servers;
    const { alice, bob } = await aliceFollowsBob();
    const carol = await a.user("carol");
    const post = await b.post("/api/v1/statuses", { status: `@alice@${a.host} psst`, visibility: "direct" }, bob.headers);
    expect(post.mentions.map((m: Json) => m.acct)).toEqual([alice.handle]);

    const [copy] = await a.get("/api/v1/timelines/home", alice.headers);
    expect(copy).toMatchObject({ uri: post.uri, visibility: "direct", mentions: [{ acct: "alice" }] });
    await expect(a.get(`/api/v1/statuses/${copy.id}`, carol.headers)).rejects.toThrow(/404/);
  });

  it("threads replies on both servers", async () => {
    const { a, b } = servers;
    const { alice, bob } = await aliceFollowsBob();
    const post = await b.post("/api/v1/statuses", { status: "what do you think?" }, bob.headers);
    const [copy] = await a.get("/api/v1/timelines/home", alice.headers);

    const reply = await a.post("/api/v1/statuses", { status: `@bob@${b.host} love it`, in_reply_to_id: copy.id }, alice.headers);
    expect(reply.in_reply_to_id).toBe(copy.id);

    // Bob's server got the reply even though Bob doesn't follow Alice, and threads it.
    const context = await b.get(`/api/v1/statuses/${post.id}/context`);
    expect(context.descendants.map((s: Json) => s.uri)).toEqual([reply.uri]);
    expect(context.descendants[0].account.acct).toBe(alice.handle);

    const back = await a.get(`/api/v1/statuses/${reply.id}/context`, alice.headers);
    expect(back.ancestors.map((s: Json) => s.id)).toEqual([copy.id]);
  });

  it("shows a remote post only in the home timelines of those who follow its author", async () => {
    const { a, b } = servers;
    const { alice, bob } = await aliceFollowsBob();
    const carol = await a.user("carol");
    await discover(a, carol, bob.actor); // Carol knows of Bob but doesn't follow him.
    await b.post("/api/v1/statuses", { status: "for my followers' feeds" }, bob.headers);
    expect(await a.get("/api/v1/timelines/home", alice.headers)).toHaveLength(1);
    expect(await a.get("/api/v1/timelines/home", carol.headers)).toEqual([]);
  });
});

describe("notifications across servers", () => {
  it("notifies about follows, favourites, boosts and replies from another server", async () => {
    const { a, b } = servers;
    const alice = await a.user("alice");
    const bob = await b.user("bob");
    const remoteAlice = await discover(b, bob, alice.actor);
    await b.post(`/api/v1/accounts/${remoteAlice.id}/follow`, {}, bob.headers);
    const post = await a.post("/api/v1/statuses", { status: "from A" }, alice.headers);
    const [copy] = await b.get("/api/v1/timelines/home", bob.headers);
    await b.post(`/api/v1/statuses/${copy.id}/favourite`, {}, bob.headers);
    await b.post(`/api/v1/statuses/${copy.id}/reblog`, {}, bob.headers);
    await b.post("/api/v1/statuses", { status: "great post", in_reply_to_id: copy.id }, bob.headers);

    const got = await a.get("/api/v1/notifications", alice.headers);
    expect(got.map((n: Json) => n.type)).toEqual(["mention", "reblog", "favourite", "follow"]);
    expect(got.every((n: Json) => n.account.acct === bob.handle)).toBe(true);
    expect(got[1].status.id).toBe(post.id);

    // Undone on B, gone on A.
    await b.post(`/api/v1/statuses/${copy.id}/unfavourite`, {}, bob.headers);
    expect((await a.get("/api/v1/notifications", alice.headers)).map((n: Json) => n.type)).toEqual(["mention", "reblog", "follow"]);
  });
});

describe("blocks across servers", () => {
  it("tells the other server, which ends the follows and hides the blocker", async () => {
    const { a, b } = servers;
    const alice = await a.user("alice");
    const bob = await b.user("bob");
    const remoteBob = await discover(a, alice, bob.actor);
    const remoteAlice = await discover(b, bob, alice.actor);
    await a.post(`/api/v1/accounts/${remoteBob.id}/follow`, {}, alice.headers);
    await b.post(`/api/v1/accounts/${remoteAlice.id}/follow`, {}, bob.headers);
    await b.post("/api/v1/statuses", { status: "before the block" }, bob.headers);
    expect(await a.get("/api/v1/timelines/home", alice.headers)).toHaveLength(1);

    expect(await b.post(`/api/v1/accounts/${remoteAlice.id}/block`, {}, bob.headers)).toMatchObject({ blocking: true, following: false });
    const [onA] = await a.get(`/api/v1/accounts/relationships?id[]=${remoteBob.id}`, alice.headers);
    expect(onA).toMatchObject({ blocked_by: true, following: false, followed_by: false });
    // Bob's posts are hidden from Alice on her own server, and she can't follow again.
    expect(await a.get("/api/v1/timelines/home", alice.headers)).toEqual([]);
    await expect(a.post(`/api/v1/accounts/${remoteBob.id}/follow`, {}, alice.headers)).rejects.toThrow(/403/);

    await b.post(`/api/v1/accounts/${remoteAlice.id}/unblock`, {}, bob.headers);
    const [after] = await a.get(`/api/v1/accounts/relationships?id[]=${remoteBob.id}`, alice.headers);
    expect(after.blocked_by).toBe(false);
  });
});

describe("reports across servers", () => {
  it("forwards a report to the reported account's server, from the server itself", async () => {
    const { a, b } = servers;
    const alice = await a.user("alice");
    const bob = await b.user("bob");
    const mod = await b.user("mod", { moderator: true });
    const remoteBob = await discover(a, alice, bob.actor);
    await a.post(`/api/v1/accounts/${remoteBob.id}/follow`, {}, alice.headers);
    const post = await b.post("/api/v1/statuses", { status: "spam from B" }, bob.headers);
    const [copy] = (await a.get("/api/v1/timelines/home", alice.headers)) as Json[];

    const report = await a.post(
      "/api/v1/reports",
      { account_id: remoteBob.id, status_ids: [copy!.id], comment: "Spam", forward: true },
      alice.headers,
    );
    expect(report.forwarded).toBe(true);

    const [received] = await b.get("/api/v1/admin/reports", mod.headers);
    expect(received).toMatchObject({ comment: "Spam", target_account: { username: "bob" } });
    // Sent by A's instance actor, not by Alice.
    expect(received.account.username).toBe(`127.0.0.1:${new URL(a.origin).port}`);
    expect(received.statuses.map((s: Json) => s.id)).toEqual([post.id]);

    // The instance actor is a real actor, with a handle.
    const actor = await (await fetch(new URL("/users/instance", a.origin), { headers: { accept: "application/activity+json" } })).json();
    expect(actor).toMatchObject({ type: "Application", preferredUsername: `127.0.0.1:${new URL(a.origin).port}` });
  });
});

describe("suspended servers", () => {
  it("stops taking anything from a server the moderators suspended", async () => {
    const { a, b } = servers;
    const alice = await a.user("alice");
    const mod = await a.user("mod", { moderator: true });
    const bob = await b.user("bob");
    const remoteBob = await discover(a, alice, bob.actor);
    await a.post(`/api/v1/accounts/${remoteBob.id}/follow`, {}, alice.headers);

    await a.post("/api/v1/admin/domain_blocks", { domain: b.host, severity: "suspend" }, mod.headers);
    await b.post("/api/v1/statuses", { status: "you won't see this" }, bob.headers);
    expect(await a.get("/api/v1/timelines/home", alice.headers)).toEqual([]);
    // Nothing goes out either: Alice's posts don't reach Bob's server.
    const [rel] = await a.get(`/api/v1/accounts/relationships?id[]=${remoteBob.id}`, alice.headers);
    expect(rel.following).toBe(false);
    expect((await a.get(`/api/v2/search?q=${encodeURIComponent(bob.actor)}&resolve=true`, alice.headers)).accounts).toEqual([]);
  });
});

describe("profiles across servers", () => {
  it("sends profile edits to followers' servers", async () => {
    const { a, b } = servers;
    const alice = await a.user("alice");
    const bob = await b.user("bob");
    const remoteBob = await discover(a, alice, bob.actor);
    await a.post(`/api/v1/accounts/${remoteBob.id}/follow`, {}, alice.headers);

    const res = await fetch(new URL("/api/v1/accounts/update_credentials", b.origin), {
      method: "PATCH",
      headers: { ...bob.headers, "content-type": "application/json" },
      body: JSON.stringify({ display_name: "Bob B.", note: "New bio" }),
    });
    expect(res.status).toBe(200);
    expect(await a.get(`/api/v1/accounts/${remoteBob.id}`)).toMatchObject({ display_name: "Bob B.", note: "<p>New bio</p>" });
  });
});

describe("media across servers", () => {
  it("delivers photos as links to the author's server", async () => {
    const { a, b } = servers;
    const alice = await a.user("alice");
    const bob = await b.user("bob");
    const remoteBob = await discover(a, alice, bob.actor);
    await a.post(`/api/v1/accounts/${remoteBob.id}/follow`, {}, alice.headers);

    const res = await fetch(new URL("/api/v2/media", b.origin), {
      method: "POST",
      headers: bob.headers,
      body: uploadForm(await jpegBytes(800, 600), "image/jpeg", { description: "A photo from B" }),
    });
    const photo = await res.json();
    const post = await b.post("/api/v1/statuses", { status: "look", media_ids: [photo.id] }, bob.headers);

    const [copy] = await a.get("/api/v1/timelines/home", alice.headers);
    expect(copy.uri).toBe(post.uri);
    expect(copy.media_attachments).toEqual([
      expect.objectContaining({ type: "image", url: photo.url, remote_url: photo.url, description: "A photo from B" }),
    ]);
    expect(copy.media_attachments[0].meta.original).toMatchObject({ width: 800, height: 600 });
    // Alice's server links to B; it doesn't copy the file.
    expect(new URL(copy.media_attachments[0].url).origin).toBe(b.origin);
  });
});
