/**
 * Two real Pinstripe servers for federation tests, each with its own
 * database, listening on 127.0.0.1 and talking ActivityPub over HTTP.
 * Without a queue, deliveries and inbox processing happen inline, so by the
 * time an API call returns, the other server has handled what it was sent.
 */
import { mkdtemp, rm } from "node:fs/promises";
import { createServer, type Server } from "node:http";
import { tmpdir } from "node:os";
import path from "node:path";
import type { AddressInfo } from "node:net";
import { MemoryKvStore } from "@fedify/fedify";
import { getRequestListener } from "@hono/node-server";
import { afterAll, beforeAll } from "vitest";
import { buildApp } from "../src/app.ts";
import { SafetyStore } from "../src/safety/store.ts";
import { AuthStore } from "../src/auth/store.ts";
import { connect } from "../src/db/client.ts";
import { buildFederation } from "../src/federation.ts";
import { MediaService } from "../src/media/service.ts";
import { LocalDiskStorage } from "../src/media/storage.ts";
import { MediaStore } from "../src/media/store.ts";
import { StatusStore } from "../src/statuses/store.ts";
import { Store } from "../src/store.ts";
import { secondDatabaseUrl } from "./global-setup.ts";

export interface Instance {
  origin: string;
  host: string;
  store: Store;
  statuses: StatusStore;
  reset(): Promise<void>;
  /** A local user with a full-scope token. */
  user(username: string, options?: { moderator?: boolean }): Promise<{ id: string; username: string; handle: string; actor: string; headers: Record<string, string> }>;
  get(path: string, headers?: Record<string, string>): Promise<any>;
  post(path: string, body: unknown, headers?: Record<string, string>): Promise<any>;
  del(path: string, headers?: Record<string, string>): Promise<any>;
}

async function start(databaseUrl: string): Promise<{ instance: Instance; close: () => Promise<void> }> {
  const conn = connect(databaseUrl);
  const store = new Store(conn.db);
  const statuses = new StatusStore(conn.db);
  const auth = new AuthStore(conn.db);
  const mediaDir = await mkdtemp(path.join(tmpdir(), "pinstripe-test-media-"));

  let listener: ReturnType<typeof getRequestListener> | null = null;
  const server: Server = createServer((req, res) => listener!(req, res));
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address() as AddressInfo;
  const origin = `http://127.0.0.1:${port}`;
  const federation = buildFederation({ kv: new MemoryKvStore(), origin, version: "0.0.0", allowPrivateAddress: true });
  const media = new MediaService(new MediaStore(conn.db), new LocalDiskStorage(mediaDir, origin));
  const app = buildApp({ federation, store, statuses, media, auth, domain: `127.0.0.1:${port}` });
  listener = getRequestListener(app.fetch);

  const call = async (method: string, path: string, body?: unknown, headers: Record<string, string> = {}) => {
    const res = await fetch(new URL(path, origin), {
      method,
      headers: { accept: "application/json", ...(body ? { "content-type": "application/json" } : {}), ...headers },
      body: body ? JSON.stringify(body) : undefined,
    });
    const json = await res.json().catch(() => null);
    if (!res.ok) throw new Error(`${method} ${path} → ${res.status} ${JSON.stringify(json)}`);
    return json;
  };

  const instance: Instance = {
    origin,
    host: `127.0.0.1:${port}`,
    store,
    statuses,
    reset: async () => {
      await conn.sql`TRUNCATE accounts, oauth_apps CASCADE`;
    },
    user: async (username, options: { moderator?: boolean } = {}) => {
      const account = await auth.registerUser({ username, email: `${username}@example.com`, password: "correct horse", locale: null });
      const scopes = ["read", "write", "follow", ...(options.moderator ? ["admin:read", "admin:write"] : [])];
      if (options.moderator) await new SafetyStore(conn.db, store).setRole(account.id, "moderator");
      const { app: client } = await auth.createApp({ name: "Test", website: null, redirectUris: ["pinstripe://oauth"], scopes });
      const { token } = await auth.createToken({ appId: client.id, accountId: account.id, scopes });
      return {
        id: account.id,
        username,
        handle: `${username}@127.0.0.1:${port}`,
        actor: `${origin}/users/${account.id}`,
        headers: { authorization: `Bearer ${token}` },
      };
    },
    get: (path, headers) => call("GET", path, undefined, headers),
    post: (path, body, headers) => call("POST", path, body ?? {}, headers),
    del: (path, headers) => call("DELETE", path, undefined, headers),
  };
  return {
    instance,
    close: async () => {
      await new Promise<void>((resolve) => server.close(() => resolve()));
      await conn.sql.end();
      await rm(mediaDir, { recursive: true, force: true });
    },
  };
}

/** Starts two servers for the file's tests; `reset()` empties both. */
export function twoInstances() {
  const pair = {} as { a: Instance; b: Instance; reset: () => Promise<void> };
  const closers: (() => Promise<void>)[] = [];
  beforeAll(async () => {
    const url = process.env.TEST_DATABASE_URL!;
    const [a, b] = await Promise.all([start(url), start(secondDatabaseUrl(url))]);
    pair.a = a.instance;
    pair.b = b.instance;
    pair.reset = async () => {
      await Promise.all([a.instance.reset(), b.instance.reset()]);
    };
    closers.push(a.close, b.close);
  });
  afterAll(async () => {
    await Promise.all(closers.map((close) => close()));
  });
  return pair;
}
