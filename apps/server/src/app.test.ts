import { MemoryKvStore } from "@fedify/fedify";
import { beforeEach, describe, expect, it } from "vitest";
import { buildApp } from "./app.ts";
import { buildFederation } from "./federation.ts";
import { type LocalAccount, MemoryStore } from "./store.ts";

const ORIGIN = "https://pinstripe.test";

let app: ReturnType<typeof buildApp>;
let sam: LocalAccount;
let store: MemoryStore;

beforeEach(async () => {
  store = new MemoryStore();
  const federation = buildFederation({ kv: new MemoryKvStore(), origin: ORIGIN, version: "0.0.0" });
  app = buildApp({ federation, store, domain: "pinstripe.test" });
  sam = await store.createAccount({ username: "sam", displayName: "Sam Avery" });
});

const get = (path: string, accept = "application/activity+json") =>
  app.request(new URL(path, ORIGIN), { headers: { accept } });

describe("WebFinger", () => {
  it("resolves a local handle to the actor", async () => {
    const res = await get("/.well-known/webfinger?resource=acct:sam@pinstripe.test", "application/jrd+json");
    expect(res.status).toBe(200);
    const jrd = await res.json();
    const self = jrd.links.find((l: { rel: string }) => l.rel === "self");
    expect(self.href).toBe(`${ORIGIN}/users/${sam.id}`);
  });

  it("404s unknown users", async () => {
    const res = await get("/.well-known/webfinger?resource=acct:nobody@pinstripe.test", "application/jrd+json");
    expect(res.status).toBe(404);
  });
});

describe("actor", () => {
  it("serves a Person with keys, inbox and followers", async () => {
    const res = await get(`/users/${sam.id}`);
    expect(res.status).toBe(200);
    const actor = await res.json();
    expect(actor.type).toBe("Person");
    expect(actor.preferredUsername).toBe("sam");
    expect(actor.name).toBe("Sam Avery");
    expect(actor.inbox).toBe(`${ORIGIN}/users/${sam.id}/inbox`);
    expect(actor.followers).toBe(`${ORIGIN}/users/${sam.id}/followers`);
    expect(actor.endpoints.sharedInbox).toBe(`${ORIGIN}/inbox`);
    expect(actor.publicKey.publicKeyPem).toMatch(/BEGIN PUBLIC KEY/);
    expect(actor.manuallyApprovesFollowers).toBe(false);
  });

  it("serves bots as Service", async () => {
    sam.bot = true;
    const actor = await (await get(`/users/${sam.id}`)).json();
    expect(actor.type).toBe("Service");
  });
});

describe("NodeInfo", () => {
  it("advertises ActivityPub and the user count", async () => {
    const res = await get("/nodeinfo/2.1", "application/json");
    expect(res.status).toBe(200);
    const info = await res.json();
    expect(info.software.name).toBe("pinstripe");
    expect(info.protocols).toEqual(["activitypub"]);
    expect(info.usage.users.total).toBe(1);
  });
});

describe("Mastodon client API", () => {
  it("looks up local accounts by handle, in Mastodon's Account shape", async () => {
    for (const acct of ["sam", "@sam", "SAM@pinstripe.test"]) {
      const res = await get(`/api/v1/accounts/lookup?acct=${encodeURIComponent(acct)}`, "application/json");
      expect(res.status).toBe(200);
      expect(await res.json()).toMatchObject({
        id: sam.id,
        username: "sam",
        acct: "sam",
        display_name: "Sam Avery",
        locked: false,
        url: `${ORIGIN}/@sam`,
        uri: `${ORIGIN}/users/${sam.id}`,
        followers_count: 0,
        fields: [],
        emojis: [],
      });
    }
  });

  it("404s unknown and remote handles like Mastodon", async () => {
    for (const acct of ["nobody", "sam@elsewhere.social"]) {
      const res = await get(`/api/v1/accounts/lookup?acct=${acct}`, "application/json");
      expect(res.status).toBe(404);
      expect(await res.json()).toEqual({ error: "Record not found" });
    }
  });

  it("fetches accounts by id", async () => {
    expect((await get(`/api/v1/accounts/${sam.id}`, "application/json")).status).toBe(200);
    expect((await get("/api/v1/accounts/nope", "application/json")).status).toBe(404);
  });

  it("counts accepted followers, and reports hidden counts as zero", async () => {
    await store.upsertFollower(sam.id, {
      actorUri: "https://tilde.zone/users/mira",
      inboxUri: "https://tilde.zone/users/mira/inbox",
      sharedInboxUri: null,
      followActivityUri: "https://tilde.zone/follows/1",
      state: "accepted",
    });
    const count = async () => (await (await get(`/api/v1/accounts/${sam.id}`, "application/json")).json()).followers_count;
    expect(await count()).toBe(1);
    sam.settings.hideFollowerCounts = true;
    expect(await count()).toBe(0);
  });
});
