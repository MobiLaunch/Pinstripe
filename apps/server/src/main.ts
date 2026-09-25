import { type KvStore, type MessageQueue, InProcessMessageQueue, MemoryKvStore } from "@fedify/fedify";
import { PostgresKvStore, PostgresMessageQueue } from "@fedify/postgres";
import { serve } from "@hono/node-server";
import { buildApp } from "./app.ts";
import { loadConfig } from "./config.ts";
import { connect, runMigrations } from "./db/client.ts";
import { buildFederation } from "./federation.ts";
import { PostgresStore } from "./pg-store.ts";
import { MemoryStore, type Store } from "./store.ts";

const config = loadConfig(process.env);

let store: Store;
let kv: KvStore;
let queue: MessageQueue;
if (config.databaseUrl) {
  const { sql, db } = connect(config.databaseUrl);
  await runMigrations(db);
  store = new PostgresStore(db);
  kv = new PostgresKvStore(sql);
  queue = new PostgresMessageQueue(sql);
} else {
  console.warn("DATABASE_URL not set: using in-memory storage, which resets on restart.");
  store = new MemoryStore();
  kv = new MemoryKvStore();
  queue = new InProcessMessageQueue();
}

const federation = buildFederation({ kv, queue, origin: config.origin, version: config.version });

if (config.seedAccount && !(await store.getAccountByUsername(config.seedAccount))) {
  await store.createAccount({ username: config.seedAccount, displayName: config.seedAccount });
}

const app = buildApp({ federation, store, domain: new URL(config.origin).host });

serve({ fetch: app.fetch, port: config.port }, ({ port }) => {
  console.log(`Pinstripe listening on :${port} as ${config.origin}`);
});
