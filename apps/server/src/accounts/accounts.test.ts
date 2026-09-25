import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { testApp } from "../../test/app.ts";
import { accounts } from "../db/schema.ts";

const { db, reset, signedInUser, get, postJson } = testApp();
const api = "application/json";
type Json = Record<string, any>;
const json = async (res: Response) => (await res.json()) as any;

beforeEach(reset);

describe("following on the same server", () => {
  it("follows, fills the home timeline, and unfollows", async () => {
    const sam = await signedInUser("sam");
    const mira = await signedInUser("mira");
    const post = await json(await postJson("/api/v1/statuses", { status: "from mira", visibility: "private" }, mira.headers));

    const rel = await json(await postJson(`/api/v1/accounts/${mira.account.id}/follow`, {}, sam.headers));
    expect(rel).toMatchObject({ id: mira.account.id, following: true, followed_by: false });
    // Following makes followers-only posts visible, including ones from before.
    const home = await json(await get("/api/v1/timelines/home", api, sam.headers));
    expect(home.map((s: Json) => s.id)).toEqual([post.id]);
    expect((await json(await get(`/api/v1/accounts/${mira.account.id}`, api))).followers_count).toBe(1);
    const [fromMira] = await json(await get(`/api/v1/accounts/relationships?id[]=${sam.account.id}`, api, mira.headers));
    expect(fromMira).toMatchObject({ following: false, followed_by: true });

    await postJson(`/api/v1/accounts/${mira.account.id}/unfollow`, {}, sam.headers);
    expect(await json(await get("/api/v1/timelines/home", api, sam.headers))).toEqual([]);
  });

  it("turns follows of locked accounts into requests", async () => {
    const sam = await signedInUser("sam");
    const lockedMira = await signedInUser("mira");
    await lock(lockedMira.account.id);

    expect(await json(await postJson(`/api/v1/accounts/${lockedMira.account.id}/follow`, {}, sam.headers))).toMatchObject({
      following: false,
      requested: true,
    });
    const requests = await json(await get("/api/v1/follow_requests", api, lockedMira.headers));
    expect(requests.map((a: Json) => a.username)).toEqual(["sam"]);
    const me = await json(await get("/api/v1/accounts/verify_credentials", api, lockedMira.headers));
    expect(me.source.follow_requests_count).toBe(1);

    const rel = await json(await postJson(`/api/v1/follow_requests/${sam.account.id}/authorize`, {}, lockedMira.headers));
    expect(rel).toMatchObject({ followed_by: true, requested_by: false });
    expect((await postJson(`/api/v1/follow_requests/${sam.account.id}/authorize`, {}, lockedMira.headers)).status).toBe(404);
  });

  it("won't follow yourself, and needs a follow scope", async () => {
    const sam = await signedInUser("sam");
    const reader = await signedInUser("reader", ["read"]);
    expect((await postJson(`/api/v1/accounts/${sam.account.id}/follow`, {}, sam.headers)).status).toBe(403);
    expect((await postJson(`/api/v1/accounts/${sam.account.id}/follow`, {}, reader.headers)).status).toBe(403);
  });

  it("lists followers and following", async () => {
    const sam = await signedInUser("sam");
    const mira = await signedInUser("mira");
    const jo = await signedInUser("jo");
    await postJson(`/api/v1/accounts/${sam.account.id}/follow`, {}, mira.headers);
    await postJson(`/api/v1/accounts/${sam.account.id}/follow`, {}, jo.headers);
    const followers = await get(`/api/v1/accounts/${sam.account.id}/followers?limit=1`, api);
    expect((await json(followers)).map((a: Json) => a.username)).toEqual(["jo"]);
    expect(followers.headers.get("link")).toContain('rel="next"');
    const following = await json(await get(`/api/v1/accounts/${mira.account.id}/following`, api));
    expect(following.map((a: Json) => a.username)).toEqual(["sam"]);
  });
});

describe("search", () => {
  it("finds local accounts by username or display name prefix", async () => {
    const sam = await signedInUser("samantha");
    await signedInUser("sammy");
    await signedInUser("mira");
    const found = await json(await get("/api/v2/search?q=sam&type=accounts", api, sam.headers));
    expect(found.accounts.map((a: Json) => a.username).sort()).toEqual(["samantha", "sammy"]);
    expect(found.statuses).toEqual([]);
    const byHandle = await json(await get("/api/v1/accounts/search?q=@mira", api));
    expect(byHandle.map((a: Json) => a.username)).toEqual(["mira"]);
  });

  it("treats % and _ literally", async () => {
    await signedInUser("sam_one");
    await signedInUser("samxone");
    const found = await json(await get("/api/v1/accounts/search?q=sam_", api));
    expect(found.map((a: Json) => a.username)).toEqual(["sam_one"]);
  });

  it("doesn't fetch remote URLs for anonymous searches", async () => {
    const found = await json(await get(`/api/v2/search?q=${encodeURIComponent("http://127.0.0.1:1/users/x")}&resolve=true`, api));
    expect(found).toEqual({ accounts: [], statuses: [], hashtags: [] });
  });
});

/** Locks an account directly in the database (Settings → Approve new followers). */
async function lock(id: string) {
  const [row] = await db.select().from(accounts).where(eq(accounts.id, id));
  await db.update(accounts).set({ settings: { ...row!.settings, approveFollowers: true } }).where(eq(accounts.id, id));
}
