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
    expect(await store.countAccounts()).toBe(1);
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

  it("tracks followers and their state", async () => {
    const sam = await store.createAccount({ username: "sam" });
    const mira = {
      actorUri: "https://tilde.zone/users/mira",
      inboxUri: "https://tilde.zone/users/mira/inbox",
      sharedInboxUri: "https://tilde.zone/inbox",
      followActivityUri: "https://tilde.zone/follows/1",
      state: "pending" as const,
    };
    await store.upsertFollower(sam.id, mira);
    expect(await store.listFollowers(sam.id, "accepted")).toEqual([]);
    await store.upsertFollower(sam.id, { ...mira, state: "accepted" });
    expect(await store.listFollowers(sam.id)).toEqual([{ ...mira, state: "accepted" }]);
    await store.removeFollower(sam.id, mira.actorUri);
    expect(await store.listFollowers(sam.id)).toEqual([]);
  });
});
