import { MemoryKvStore } from "@fedify/fedify";
import { buildApp } from "../src/app.ts";
import { FailureLimiter } from "../src/auth/rate-limit.ts";
import { AuthStore } from "../src/auth/store.ts";
import { buildFederation } from "../src/federation.ts";
import { Store } from "../src/store.ts";
import { testDb } from "./db.ts";

export const ORIGIN = "https://pinstripe.test";

/** The whole app against the test database. Call once per file; `reset()` in beforeEach. */
export function testApp() {
  const { db, reset: resetDb } = testDb();
  const store = new Store(db);
  const auth = new AuthStore(db);
  const loginLimiter = new FailureLimiter(3, 60_000);
  const reset = async () => {
    await resetDb();
    loginLimiter.clear();
  };
  // Fedify's cache can stay in memory in tests; nothing reads it across runs.
  const federation = buildFederation({ kv: new MemoryKvStore(), origin: ORIGIN, version: "0.0.0" });
  const app = buildApp({ federation, store, auth, domain: "pinstripe.test", loginLimiter });

  const request = (path: string, init: RequestInit = {}) => app.request(new URL(path, ORIGIN), init);
  const get = (path: string, accept = "application/activity+json", headers: Record<string, string> = {}) =>
    request(path, { headers: { accept, ...headers } });
  const postJson = (path: string, body: unknown, headers: Record<string, string> = {}) =>
    request(path, { method: "POST", headers: { "content-type": "application/json", ...headers }, body: JSON.stringify(body) });
  const postForm = (path: string, body: Record<string, string>, headers: Record<string, string> = {}) =>
    request(path, { method: "POST", headers, body: new URLSearchParams(body) });

  return { app, db, store, auth, reset, request, get, postJson, postForm };
}
