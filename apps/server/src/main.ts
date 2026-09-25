import { InProcessMessageQueue, MemoryKvStore } from "@fedify/fedify";
import { serve } from "@hono/node-server";
import { buildApp } from "./app.ts";
import { loadConfig } from "./config.ts";
import { buildFederation } from "./federation.ts";
import { MemoryStore } from "./store.ts";

const config = loadConfig(process.env);
const store = new MemoryStore();

// In-memory backends until Postgres lands; state resets on restart.
const federation = buildFederation({
  kv: new MemoryKvStore(),
  queue: new InProcessMessageQueue(),
  origin: config.origin,
  version: config.version,
});

if (config.seedAccount) {
  await store.createAccount({ username: config.seedAccount, displayName: config.seedAccount });
}

const app = buildApp({ federation, store, domain: new URL(config.origin).host });

serve({ fetch: app.fetch, port: config.port }, ({ port }) => {
  console.log(`Pinstripe listening on :${port} as ${config.origin}`);
});
