import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { MemoryKvStore } from "@fedify/fedify";
import { afterAll } from "vitest";
import { LinkVerifier } from "../src/accounts/verify-links.ts";
import { buildApp } from "../src/app.ts";
import { FailureLimiter } from "../src/auth/rate-limit.ts";
import { AuthStore } from "../src/auth/store.ts";
import { buildFederation } from "../src/federation.ts";
import { MemoryMailer } from "../src/mail/mailer.ts";
import { MediaService } from "../src/media/service.ts";
import { LocalDiskStorage } from "../src/media/storage.ts";
import { MediaStore } from "../src/media/store.ts";
import { StatusStore } from "../src/statuses/store.ts";
import { Store } from "../src/store.ts";
import { testDb } from "./db.ts";

export const ORIGIN = "https://pinstripe.test";

/** The whole app against the test database. Call once per file; `reset()` in beforeEach. */
export function testApp() {
  const { db, reset: resetDb } = testDb();
  const store = new Store(db);
  const auth = new AuthStore(db);
  const statuses = new StatusStore(db);
  // Each test file gets its own media folder, removed afterwards.
  const mediaDir = mkdtempSync(path.join(tmpdir(), "pinstripe-test-media-"));
  afterAll(() => rmSync(mediaDir, { recursive: true, force: true }));
  const media = new MediaService(new MediaStore(db), new LocalDiskStorage(mediaDir, ORIGIN));
  const loginLimiter = new FailureLimiter(3, 60_000);
  const emailLimiter = new FailureLimiter(5, 60_000);
  const reset = async () => {
    await resetDb();
    loginLimiter.clear();
    emailLimiter.clear();
  };
  // Fedify's cache can stay in memory in tests; nothing reads it across runs.
  // No queue: deliveries happen inline, so tests can observe them. Private
  // addresses are allowed so a local server can stand in for a remote inbox.
  const federation = buildFederation({ kv: new MemoryKvStore(), origin: ORIGIN, version: "0.0.0", allowPrivateAddress: true });
  const mailer = new MemoryMailer();
  // Tests serve the pages being linked to from 127.0.0.1.
  const linkVerifier = new LinkVerifier(store, { allowPrivateAddress: true });
  const app = buildApp({ federation, store, statuses, media, auth, domain: "pinstripe.test", loginLimiter, mailer, emailLimiter, linkVerifier });

  const request = (path: string, init: RequestInit = {}) => app.request(new URL(path, ORIGIN), init);
  const get = (path: string, accept = "application/activity+json", headers: Record<string, string> = {}) =>
    request(path, { headers: { accept, ...headers } });
  const postJson = (path: string, body: unknown, headers: Record<string, string> = {}) =>
    request(path, { method: "POST", headers: { "content-type": "application/json", ...headers }, body: JSON.stringify(body) });
  const postForm = (path: string, body: Record<string, string>, headers: Record<string, string> = {}) =>
    request(path, { method: "POST", headers, body: new URLSearchParams(body) });

  /** A local user with a full-scope token, created directly (faster than the HTTP flow). */
  async function signedInUser(username: string, scopes = ["read", "write", "follow"]) {
    const account = await auth.registerUser({ username, email: `${username}@example.com`, password: "correct horse", locale: null });
    const { app: client } = await auth.createApp({ name: "Test", website: null, redirectUris: ["pinstripe://oauth"], scopes });
    const { token } = await auth.createToken({ appId: client.id, accountId: account.id, scopes });
    return { account, token, headers: { authorization: `Bearer ${token}` } };
  }

  /** A remote account (as if fetched from its server) that follows `followingId`. */
  async function remoteFollower(followingId: string, inboxUri: string, state: "accepted" | "pending" = "accepted") {
    const origin = new URL(inboxUri).origin;
    const account = await store.upsertRemoteAccount({
      uri: `${origin}/users/mira`,
      username: "mira",
      domain: new URL(inboxUri).host,
      displayName: "Mira",
      bio: "",
      fields: [],
      bot: false,
      locked: false,
      discoverable: true,
      url: null,
      inboxUri,
      sharedInboxUri: null,
      followersUri: `${origin}/users/mira/followers`,
      avatarUrl: null,
      headerUrl: null,
      followersCount: null,
      followingCount: null,
      statusesCount: null,
    });
    await store.follow({ followerId: account.id, followingId, state, uri: `${origin}/follows/1` });
    return account;
  }

  const del = (path: string, headers: Record<string, string> = {}) => request(path, { method: "DELETE", headers });

  return { app, db, store, statuses, media, auth, mailer, linkVerifier, reset, signedInUser, remoteFollower, del, request, get, postJson, postForm };
}
