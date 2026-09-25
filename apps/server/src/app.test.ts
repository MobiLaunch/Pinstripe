import { MemoryKvStore } from "@fedify/fedify";
import { beforeEach, describe, expect, it } from "vitest";
import { buildApp } from "./app.ts";
import { buildFederation } from "./federation.ts";
import { type LocalAccount, MemoryStore } from "./store.ts";

const ORIGIN = "https://pinstripe.test";

let app: ReturnType<typeof buildApp>;
let sam: LocalAccount;

beforeEach(async () => {
  const store = new MemoryStore();
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

describe("client API", () => {
  it("looks up accounts by handle", async () => {
    const res = await get("/api/v1/accounts/lookup?acct=@sam", "application/json");
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ id: sam.id, acct: "@sam@pinstripe.test" });
  });
});
