import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { connect, runMigrations } from "./db/client.ts";
import { PostgresStore } from "./pg-store.ts";
import { InvalidUsernameError, MemoryStore, type Store, UsernameTakenError } from "./store.ts";

/**
 * One contract, run against every Store. Postgres runs when TEST_DATABASE_URL
 * is set (CI sets it); the tests truncate that database, so never point it
 * at real data.
 */
const pgUrl = process.env.TEST_DATABASE_URL;
const pg = pgUrl ? connect(pgUrl) : null;
if (pg) await runMigrations(pg.db);
afterAll(() => pg?.sql.end());

const stores: [string, () => Promise<Store>][] = [["memory", async () => new MemoryStore()]];
if (pg) {
  stores.push([
    "postgres",
    async () => {
      await pg.sql`TRUNCATE accounts CASCADE`;
      return new PostgresStore(pg.db);
    },
  ]);
}

describe.each(stores)("%s store", (_name, make) => {
  let store: Store;
  beforeEach(async () => {
    store = await make();
  });

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

  it("creates key pairs once and returns the same ones after", async () => {
    const sam = await store.createAccount({ username: "sam" });
    const [first, again] = await Promise.all([store.getKeyPairs(sam.id), store.getKeyPairs(sam.id)]);
    expect(first).toHaveLength(2);
    expect(first[0]?.publicKey.algorithm.name).toBe("RSASSA-PKCS1-v1_5");
    expect(first[1]?.publicKey.algorithm.name).toBe("Ed25519");
    const later = await store.getKeyPairs(sam.id);
    const jwk = (k: CryptoKey) => crypto.subtle.exportKey("jwk", k);
    expect(await jwk(later[0]!.publicKey)).toEqual(await jwk(first[0]!.publicKey));
    expect(await jwk(again![0]!.publicKey)).toEqual(await jwk(first[0]!.publicKey));
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
