import { beforeEach, describe, expect, it } from "vitest";
import { testApp } from "../../test/app.ts";
import { hasScope, isValidScope } from "../auth/scopes.ts";
import { SafetyStore } from "./store.ts";

const t = testApp();
const { reset, store, statuses, auth, signedInUser, get, postJson, postForm, request, db } = t;
const safety = new SafetyStore(db, store);

const api = "application/json";
const json = async (res: Response) => (await res.json()) as any;
const read = async (path: string, headers: Record<string, string>) => json(await get(path, api, headers));
const post = async (path: string, headers: Record<string, string>, body: Record<string, unknown> = {}) => json(await postJson(path, body, headers));
const texts = (list: any[]) => list.map((s) => s.content.replace(/<[^>]+>/g, ""));

/** A post from another server's account, as if delivered. */
async function remotePost(text: string, domain = "remote.example") {
  const account = await store.upsertRemoteAccount({
    uri: `https://${domain}/users/zed`,
    username: "zed",
    domain,
    displayName: "Zed",
    bio: "",
    fields: [],
    bot: false,
    locked: false,
    discoverable: true,
    url: null,
    inboxUri: `https://${domain}/inbox`,
    sharedInboxUri: null,
    followersUri: null,
    avatarUrl: null,
    headerUrl: null,
    followersCount: null,
    followingCount: null,
    statusesCount: null,
  });
  await statuses.upsertRemote({
    accountId: account.id,
    text,
    content: `<p>${text}</p>`,
    tags: [],
    visibility: "public",
    inReplyToId: null,
    inReplyToAccountId: null,
    sensitive: false,
    spoilerText: "",
    language: null,
    mentionIds: [],
    uri: `https://${domain}/notes/${Math.random()}`,
    url: null,
    publishedAt: new Date(),
  });
  return account;
}

beforeEach(reset);

describe("blocking", () => {
  it("ends follows both ways and keeps each out of the other's way", async () => {
    const sam = await signedInUser("sam");
    const mira = await signedInUser("mira");
    await post(`/api/v1/accounts/${mira.account.id}/follow`, sam.headers);
    await post(`/api/v1/accounts/${sam.account.id}/follow`, mira.headers);
    const miraPost = await post("/api/v1/statuses", mira.headers, { status: "from mira" });
    const samPost = await post("/api/v1/statuses", sam.headers, { status: "from sam" });

    const rel = await post(`/api/v1/accounts/${mira.account.id}/block`, sam.headers);
    expect(rel).toMatchObject({ blocking: true, following: false, followed_by: false });
    expect((await read(`/api/v1/accounts/relationships?id[]=${sam.account.id}`, mira.headers))[0]).toMatchObject({ blocked_by: true });

    // Neither can follow the other again.
    expect((await postJson(`/api/v1/accounts/${sam.account.id}/follow`, {}, mira.headers)).status).toBe(403);
    expect((await postJson(`/api/v1/accounts/${mira.account.id}/follow`, {}, sam.headers)).status).toBe(403);

    // Sam doesn't see Mira in timelines or her profile; Mira can't see Sam's posts at all.
    expect(texts(await read("/api/v1/timelines/public", sam.headers))).toEqual(["from sam"]);
    expect(await read(`/api/v1/accounts/${mira.account.id}/statuses`, sam.headers)).toEqual([]);
    expect((await get(`/api/v1/statuses/${samPost.id}`, api, mira.headers)).status).toBe(404);
    expect(texts(await read("/api/v1/timelines/public", mira.headers))).toEqual(["from mira"]);
    expect((await postJson(`/api/v1/statuses/${samPost.id}/favourite`, {}, mira.headers)).status).toBe(404);
    // Signed out, both are public.
    expect(await read("/api/v1/timelines/public", {})).toHaveLength(2);

    // Mira's mention of Sam doesn't reach Sam's notifications.
    await post("/api/v1/statuses", mira.headers, { status: "@sam hey" });
    expect(await read("/api/v1/notifications", sam.headers)).toEqual([]);

    expect((await read("/api/v1/blocks", sam.headers)).map((a: any) => a.username)).toEqual(["mira"]);
    expect(await post(`/api/v1/accounts/${mira.account.id}/unblock`, sam.headers)).toMatchObject({ blocking: false });
    expect(texts(await read("/api/v1/timelines/public", sam.headers))).toContain(miraPost.content.replace(/<[^>]+>/g, ""));
  });
});

describe("muting", () => {
  it("hides posts and, by default, notifications, but not the profile", async () => {
    const sam = await signedInUser("sam");
    const mira = await signedInUser("mira");
    await post(`/api/v1/accounts/${mira.account.id}/follow`, sam.headers);
    await post("/api/v1/statuses", mira.headers, { status: "boring" });

    expect(await post(`/api/v1/accounts/${mira.account.id}/mute`, sam.headers)).toMatchObject({ muting: true, muting_notifications: true, following: true });
    expect(await read("/api/v1/timelines/home", sam.headers)).toEqual([]);
    expect(await read("/api/v1/timelines/public", sam.headers)).toEqual([]);
    expect(await read(`/api/v1/accounts/${mira.account.id}/statuses`, sam.headers)).toHaveLength(1);
    await post("/api/v1/statuses", mira.headers, { status: "@sam psst" });
    expect(await read("/api/v1/notifications", sam.headers)).toEqual([]);

    // Keeping notifications on shows them again, posts stay hidden.
    expect(await post(`/api/v1/accounts/${mira.account.id}/mute`, sam.headers, { notifications: false })).toMatchObject({ muting_notifications: false });
    expect((await read("/api/v1/notifications", sam.headers)).map((n: any) => n.type)).toEqual(["mention"]);
    expect(await read("/api/v1/timelines/home", sam.headers)).toEqual([]);

    expect((await read("/api/v1/mutes", sam.headers)).map((a: any) => a.username)).toEqual(["mira"]);
    await post(`/api/v1/accounts/${mira.account.id}/unmute`, sam.headers);
    expect(await read("/api/v1/timelines/home", sam.headers)).toHaveLength(2);
  });

  it("ends by itself after the duration", async () => {
    const sam = await signedInUser("sam");
    const mira = await signedInUser("mira");
    await post("/api/v1/statuses", mira.headers, { status: "later" });
    await post(`/api/v1/accounts/${mira.account.id}/mute`, sam.headers, { duration: 1 });
    expect(await read("/api/v1/timelines/public", sam.headers)).toEqual([]);
    await new Promise((r) => setTimeout(r, 1100));
    expect(await read("/api/v1/timelines/public", sam.headers)).toHaveLength(1);
    expect(await read("/api/v1/mutes", sam.headers)).toEqual([]);
  });
});

describe("blocking servers", () => {
  it("hides everything from a server, for that account only", async () => {
    const sam = await signedInUser("sam");
    const mira = await signedInUser("mira");
    const zed = await remotePost("from afar");
    await remotePost("from elsewhere", "other.example");
    expect(await read("/api/v1/timelines/public", sam.headers)).toHaveLength(2);

    expect((await postJson("/api/v1/domain_blocks", { domain: "https://Remote.Example/" }, sam.headers)).status).toBe(200);
    expect(await read("/api/v1/domain_blocks", sam.headers)).toEqual(["remote.example"]);
    expect(texts(await read("/api/v1/timelines/public", sam.headers))).toEqual(["from elsewhere"]);
    expect(await read("/api/v1/timelines/public", mira.headers)).toHaveLength(2);
    expect((await read(`/api/v1/accounts/relationships?id[]=${zed.id}`, sam.headers))[0]).toMatchObject({ domain_blocking: true });
    expect((await postJson(`/api/v1/accounts/${zed.id}/follow`, {}, sam.headers)).status).toBe(403);

    expect((await postJson("/api/v1/domain_blocks", { domain: "not a domain!" }, sam.headers)).status).toBe(422);
    await request("/api/v1/domain_blocks", { method: "DELETE", headers: { ...sam.headers, "content-type": api }, body: JSON.stringify({ domain: "remote.example" }) });
    expect(await read("/api/v1/timelines/public", sam.headers)).toHaveLength(2);
  });

  it("drops followers from the blocked server", async () => {
    const sam = await signedInUser("sam");
    // A throwaway inbox; the Reject sent to it isn't checked here.
    await t.remoteFollower(sam.account.id, "http://127.0.0.1:9/inbox");
    expect((await store.followCounts(sam.account.id)).followers).toBe(1);
    await postJson("/api/v1/domain_blocks", { domain: "127.0.0.1:9" }, sam.headers);
    expect((await store.followCounts(sam.account.id)).followers).toBe(0);
  });
});

describe("reports and moderation", () => {
  it("files a report with the reported account's posts only", async () => {
    const sam = await signedInUser("sam");
    const mira = await signedInUser("mira");
    const bad = await post("/api/v1/statuses", mira.headers, { status: "spam spam" });
    const mine = await post("/api/v1/statuses", sam.headers, { status: "not mira's" });
    const report = await post("/api/v1/reports", sam.headers, {
      account_id: mira.account.id,
      status_ids: [bad.id, mine.id],
      comment: "Spamming the local timeline",
      category: "spam",
    });
    expect(report).toMatchObject({ action_taken: false, category: "spam", status_ids: [bad.id], target_account: { username: "mira" } });
    expect((await postJson("/api/v1/reports", { account_id: sam.account.id }, sam.headers)).status).toBe(422);
  });

  it("lets moderators see and resolve reports, and suspend accounts", async () => {
    const sam = await signedInUser("sam");
    const mira = await signedInUser("mira");
    const mod = await signedInUser("mod", ["read", "write", "follow", "admin:read", "admin:write"]);
    await post("/api/v1/statuses", mira.headers, { status: "rule breaking" });
    const report = await post("/api/v1/reports", sam.headers, { account_id: mira.account.id, comment: "bad" });

    // Not a moderator yet: refused, even with the scopes.
    expect((await get("/api/v1/admin/reports", api, mod.headers)).status).toBe(403);
    await safety.setRole(mod.account.id, "moderator");
    const open = await read("/api/v1/admin/reports", mod.headers);
    expect(open.map((r: any) => r.id)).toEqual([report.id]);
    expect(open[0]).toMatchObject({ account: { username: "sam" }, target_account: { username: "mira", suspended: false } });
    expect((await read("/api/v1/accounts/verify_credentials", mod.headers)).role).toMatchObject({ name: "Moderator" });
    // A regular token can't use the admin API, whoever holds it.
    expect((await get("/api/v1/admin/reports", api, sam.headers)).status).toBe(403);

    await postJson(`/api/v1/admin/accounts/${mira.account.id}/action`, { type: "suspend", report_id: report.id }, mod.headers);
    expect(await read("/api/v1/admin/reports", mod.headers)).toEqual([]);
    expect((await read("/api/v1/admin/reports?resolved=true", mod.headers))[0]).toMatchObject({
      action_taken: true,
      action_taken_by_account: { username: "mod" },
      target_account: { suspended: true },
    });

    // Suspended: posts gone for everyone, the token stops working, and so does signing in.
    expect(await read("/api/v1/timelines/public", {})).toEqual([]);
    expect((await get("/api/v1/timelines/home", api, mira.headers)).status).toBe(403);
    const { app: client, clientSecret } = await auth.createApp({ name: "t", website: null, redirectUris: ["urn:ietf:wg:oauth:2.0:oob"], scopes: ["read"] });
    const login = await postForm("/oauth/token", {
      grant_type: "password",
      username: "mira",
      password: "correct horse",
      client_id: client.clientId,
      client_secret: clientSecret,
      scope: "read",
    });
    expect(await json(login)).toMatchObject({ error: "invalid_grant", error_description: expect.stringContaining("suspended") });

    // Moderators can't suspend each other.
    const other = await signedInUser("other");
    await safety.setRole(other.account.id, "admin");
    expect((await postJson(`/api/v1/admin/accounts/${other.account.id}/action`, { type: "suspend" }, mod.headers)).status).toBe(403);

    await postJson(`/api/v1/admin/accounts/${mira.account.id}/unsuspend`, {}, mod.headers);
    expect(await read("/api/v1/timelines/public", {})).toHaveLength(1);
  });
});

describe("admin scopes", () => {
  it("are valid and nest like Mastodon's", () => {
    expect(isValidScope("admin:read:reports")).toBe(true);
    expect(isValidScope("admin")).toBe(false);
    expect(isValidScope("read:statuses:extra")).toBe(false);
    expect(hasScope(["admin:read"], "admin:read:reports")).toBe(true);
    expect(hasScope(["admin:read"], "admin:write:reports")).toBe(false);
    expect(hasScope(["read"], "read:notifications")).toBe(true);
    expect(hasScope(["read"], "admin:read:reports")).toBe(false);
  });
});

describe("server-wide moderation", () => {
  async function moderator() {
    const mod = await signedInUser("mod", ["read", "write", "follow", "admin:read", "admin:write"]);
    await safety.setRole(mod.account.id, "moderator");
    return mod;
  }

  it("limits an account to the people who follow it", async () => {
    const mod = await moderator();
    const sam = await signedInUser("sam");
    const fan = await signedInUser("fan");
    const other = await signedInUser("other");
    await post(`/api/v1/accounts/${sam.account.id}/follow`, fan.headers);
    await post("/api/v1/statuses", sam.headers, { status: "limited voice" });

    expect((await postJson(`/api/v1/admin/accounts/${sam.account.id}/action`, { type: "silence" }, mod.headers)).status).toBe(200);
    expect(await read("/api/v1/timelines/public", other.headers)).toEqual([]);
    expect(await read("/api/v1/timelines/public", {})).toEqual([]);
    expect(texts(await read("/api/v1/timelines/public", fan.headers))).toEqual(["limited voice"]);
    expect(texts(await read("/api/v1/timelines/home", fan.headers))).toEqual(["limited voice"]);
    // Their mention of a non-follower doesn't notify; of a follower it does.
    await post("/api/v1/statuses", sam.headers, { status: "@other @fan hi" });
    expect(await read("/api/v1/notifications", other.headers)).toEqual([]);
    expect((await read("/api/v1/notifications", fan.headers)).map((n: any) => n.type)).toEqual(["mention"]);

    await postJson(`/api/v1/admin/accounts/${sam.account.id}/unsilence`, {}, mod.headers);
    expect(await read("/api/v1/timelines/public", other.headers)).toHaveLength(2);
    const log = await read("/api/v1/pinstripe/admin/log", mod.headers);
    expect(log.map((e: any) => [e.action, e.summary, e.moderator.username])).toEqual([
      ["unlimit", "@sam", "mod"],
      ["limit", "@sam", "mod"],
    ]);
  });

  it("limits or suspends whole servers, and lists them publicly", async () => {
    const mod = await moderator();
    const sam = await signedInUser("sam");
    const zed = await remotePost("from afar", "bad.example");
    await store.follow({ followerId: sam.account.id, followingId: zed.id, state: "accepted", uri: null });
    expect(await read("/api/v1/timelines/public", sam.headers)).toHaveLength(1);

    const limited = await json(await postJson("/api/v1/admin/domain_blocks", { domain: "Bad.Example", severity: "silence", public_comment: "Spam" }, mod.headers));
    expect(limited).toMatchObject({ domain: "bad.example", severity: "silence", public_comment: "Spam" });
    // Limited: Sam follows Zed, so still sees them; others don't.
    expect(await read("/api/v1/timelines/public", sam.headers)).toHaveLength(1);
    expect(await read("/api/v1/timelines/public", {})).toEqual([]);

    const suspended = await json(await request(`/api/v1/admin/domain_blocks/${limited.id}`, {
      method: "PUT",
      headers: { ...mod.headers, "content-type": "application/json" },
      body: JSON.stringify({ severity: "suspend" }),
    }));
    expect(suspended.severity).toBe("suspend");
    // Suspended: gone for everyone, and the follow is removed.
    expect(await read("/api/v1/timelines/public", sam.headers)).toEqual([]);
    expect((await store.followCounts(sam.account.id)).following).toBe(0);
    expect(await json(await get("/api/v1/instance/domain_blocks", "application/json"))).toEqual([
      { domain: "bad.example", digest: expect.any(String), severity: "suspend", comment: "Spam" },
    ]);
    // Not for regular users.
    expect((await get("/api/v1/admin/domain_blocks", "application/json", sam.headers)).status).toBe(403);

    await request(`/api/v1/admin/domain_blocks/${limited.id}`, { method: "DELETE", headers: mod.headers });
    expect(await read("/api/v1/timelines/public", {})).toHaveLength(1);
    expect((await read("/api/v1/pinstripe/admin/log", mod.headers)).map((e: any) => e.action)).toEqual([
      "unblock_server",
      "suspend_server",
      "limit_server",
    ]);
  });
});

