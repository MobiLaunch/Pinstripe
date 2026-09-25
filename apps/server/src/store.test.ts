import { beforeEach, describe, expect, it } from "vitest";
import { testDb } from "../test/db.ts";
import { InvalidUsernameError, Store, UsernameTakenError } from "./store.ts";

const { db, reset } = testDb();
const store = new Store(db);
beforeEach(reset);

describe("Store", () => {
  it("creates and finds accounts, case-insensitively", async () => {
    const sam = await store.createAccount({ username: "Sam", displayName: "Sam Avery" });
    expect(sam).toMatchObject({ username: "Sam", displayName: "Sam Avery", bot: false });
    expect(sam.settings.approveFollowers).toBe(false);
    expect((await store.getAccount(sam.id))?.username).toBe("Sam");
    expect((await store.getAccountByUsername("sAM"))?.id).toBe(sam.id);
    expect(await store.getAccount("not-a-uuid")).toBeNull();
    expect(await store.getAccount(crypto.randomUUID())).toBeNull();
    expect(await store.countLocalAccounts()).toBe(1);
  });

  it("rejects taken and invalid usernames", async () => {
    await store.createAccount({ username: "sam" });
    await expect(store.createAccount({ username: "SAM" })).rejects.toBeInstanceOf(UsernameTakenError);
    await expect(store.createAccount({ username: "no spaces" })).rejects.toBeInstanceOf(InvalidUsernameError);
  });

  it("creates key pairs once, even when asked concurrently", async () => {
    const sam = await store.createAccount({ username: "sam" });
    const [first, again] = await Promise.all([store.getKeyPairs(sam.id), store.getKeyPairs(sam.id)]);
    expect(first).toHaveLength(2);
    expect(first[0]?.publicKey.algorithm.name).toBe("RSASSA-PKCS1-v1_5");
    expect(first[1]?.publicKey.algorithm.name).toBe("Ed25519");
    const later = await store.getKeyPairs(sam.id);
    const jwk = (k: CryptoKey) => crypto.subtle.exportKey("jwk", k);
    expect(await jwk(later[0]!.publicKey)).toEqual(await jwk(first[0]!.publicKey));
    expect(await jwk(again[0]!.publicKey)).toEqual(await jwk(first[0]!.publicKey));
  });

  it("follows, requests, relationships and counts", async () => {
    const sam = await store.createAccount({ username: "sam" });
    const mira = await store.createAccount({ username: "mira" });
    const jo = await store.createAccount({ username: "jo" });
    await store.follow({ followerId: mira.id, followingId: sam.id, state: "pending", uri: null });
    expect(await store.isFollowing(mira.id, sam.id)).toBe(false);
    expect(await store.followCounts(sam.id)).toEqual({ followers: 0, following: 0, requests: 1 });
    await store.acceptFollow(mira.id, sam.id);
    await store.follow({ followerId: sam.id, followingId: jo.id, state: "accepted", uri: null });
    // Re-requesting never downgrades an accepted follow.
    await store.follow({ followerId: mira.id, followingId: sam.id, state: "pending", uri: null });
    expect(await store.followCounts(sam.id)).toEqual({ followers: 1, following: 1, requests: 0 });

    const rel = await store.relationships(sam.id, [mira.id, jo.id, "junk"]);
    expect(rel.get(mira.id)).toEqual({ following: false, requested: false, followedBy: true, requestedBy: false });
    expect(rel.get(jo.id)).toEqual({ following: true, requested: false, followedBy: false, requestedBy: false });
    expect(rel.has("junk")).toBe(false);

    const followers = await store.followList(sam.id, "followers", { limit: 10 });
    expect(followers.map((f) => f.account.username)).toEqual(["mira"]);
    expect(await store.unfollow(mira.id, sam.id)).not.toBeNull();
    expect(await store.unfollow(mira.id, sam.id)).toBeNull();
  });

  it("keeps local and remote accounts with the same username apart", async () => {
    const local = await store.createAccount({ username: "mira" });
    const data = {
      uri: "https://tilde.zone/users/mira",
      username: "mira",
      domain: "tilde.zone",
      displayName: "Mira (remote)",
      bio: "<p>hi</p>",
      fields: [],
      bot: false,
      locked: true,
      discoverable: false,
      url: "https://tilde.zone/@mira",
      inboxUri: "https://tilde.zone/users/mira/inbox",
      sharedInboxUri: "https://tilde.zone/inbox",
      followersUri: "https://tilde.zone/users/mira/followers",
      avatarUrl: null,
      headerUrl: null,
      followersCount: 10,
      followingCount: 5,
      statusesCount: 99,
    };
    const remote = await store.upsertRemoteAccount(data);
    expect(remote.id).not.toBe(local.id);
    expect((await store.getAccountByUsername("mira"))?.id).toBe(local.id);
    expect((await store.getAccountByHandle("MIRA", "Tilde.Zone"))?.id).toBe(remote.id);
    expect(remote.settings.approveFollowers).toBe(true);
    expect(await store.getLocalAccount(remote.id)).toBeNull();
    expect(await store.countLocalAccounts()).toBe(1);
    // Upserting again by URI updates in place.
    const again = await store.upsertRemoteAccount({ ...data, bio: "<p>new</p>" });
    expect(again).toMatchObject({ id: remote.id, bio: "<p>new</p>" });
  });
});
