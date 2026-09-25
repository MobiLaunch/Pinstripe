/**
 * Two Pinstripe servers federating with each other over real HTTP: follows,
 * posts, favourites, boosts, mentions, replies and deletes.
 */
import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
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
